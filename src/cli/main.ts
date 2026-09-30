import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { basename, join, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { connect, type ScpClient } from '../client';
import { ErrorCode, isScpError, ScpError } from '../errors';
import { excludeMatcher } from '../glob';
import { mkdirp, remoteIsDirectory } from '../remote-helpers';
import { remotePath } from '../remote-path';
import { parseTarget, type RemoteTarget } from '../target';
import type { ConnectOptions, Protocol, TransferOptions, TransferProgress } from '../types';

export interface CliIo {
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown; isTTY?: boolean };
  env: Record<string, string | undefined>;
}

const HELP = `Usage: node-scp [options] <source>... <target>

Copies files to or from a server over SFTP or SCP, whichever the server supports.
Remote locations are written [user@]host:[path] or scp://[user@]host[:port]/[path].

Examples:
  node-scp -r ./dist deploy@example.com:/var/www/app
  node-scp root@192.168.1.1:/etc/config/network ./backup/
  node-scp --protocol scp -r ./build root@router:/tmp/build

Options:
  -r, --recursive          Copy directories.
  -p, --preserve           Keep file modes and times.
  -P, --port <port>        SSH port. Defaults to 22.
  -i, --identity <file>    Private key file.
  -u, --user <name>        User name when the location has none.
      --protocol <name>    auto (default), sftp or scp.
  -c, --concurrency <n>    Parallel files for SFTP directory copies. Defaults to 4.
      --exclude <pattern>  Skip matching entries. Repeatable. A pattern without / matches
                           names at any depth, for example --exclude node_modules.
      --fingerprint <fp>   Expected host key, SHA256:... as printed by ssh-keygen -l.
                           Repeatable. Also read from NODE_SCP_FINGERPRINT.
      --scp-command <cmd>  Remote scp command. Defaults to scp.
      --timeout <ms>       Connection timeout. Defaults to 20000.
  -q, --quiet              Print nothing but errors.
  -h, --help               Show this help.
  -V, --version            Show the version.

Authentication, in order of use:
  NODE_SCP_PRIVATE_KEY     Private key contents, handy in CI.
  -i <file>                Private key file. NODE_SCP_PASSPHRASE unlocks it.
  NODE_SCP_PASSWORD        Password. Never pass passwords as arguments.
  SSH_AUTH_SOCK            ssh-agent, when running.
  ~/.ssh/id_ed25519, ~/.ssh/id_ecdsa, ~/.ssh/id_rsa when nothing else is given.
`;

class UsageError extends Error {}

function readVersion(): string {
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (pkg.name === 'node-scp' && pkg.version) return pkg.version;
    } catch {}
  }
  return '0.0.0';
}

function fingerprintOf(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
}

function normalizeFingerprint(value: string): string {
  return value
    .trim()
    .replace(/^SHA256:/i, '')
    .replace(/=+$/, '');
}

function formatBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

function integer(name: string, value: string | undefined, min: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new UsageError(`${name} must be an integer >= ${min}`);
  return n;
}

interface Plan {
  direction: 'upload' | 'download';
  remote: RemoteTarget;
  sources: string[];
  target: string;
}

function plan(positionals: string[]): Plan {
  if (positionals.length < 2) throw new UsageError('Expected at least one source and a target');
  const target = positionals[positionals.length - 1]!;
  const sources = positionals.slice(0, -1);
  const targetRemote = parseTarget(target);
  const remoteSources = sources.map((s) => parseTarget(s));

  if (targetRemote) {
    if (remoteSources.some(Boolean)) {
      throw new UsageError('Copying between two remote hosts is not supported');
    }
    return { direction: 'upload', remote: targetRemote, sources, target: targetRemote.path };
  }
  if (remoteSources.every(Boolean)) {
    const first = remoteSources[0]!;
    for (const other of remoteSources) {
      if (
        other!.host !== first.host ||
        other!.port !== first.port ||
        other!.username !== first.username
      ) {
        throw new UsageError('All remote sources must be on the same host');
      }
    }
    return {
      direction: 'download',
      remote: first,
      sources: remoteSources.map((r) => r!.path),
      target,
    };
  }
  throw new UsageError(
    remoteSources.some(Boolean)
      ? 'Sources must be all local or all remote'
      : 'Either the sources or the target must be a remote location like user@host:path',
  );
}

function authOptions(
  identity: string | undefined,
  env: CliIo['env'],
): Pick<ConnectOptions, 'privateKey' | 'passphrase' | 'password' | 'agent'> {
  const auth: Pick<ConnectOptions, 'privateKey' | 'passphrase' | 'password' | 'agent'> = {};
  if (env.NODE_SCP_PRIVATE_KEY) {
    auth.privateKey = env.NODE_SCP_PRIVATE_KEY;
  } else if (identity) {
    try {
      auth.privateKey = readFileSync(identity);
    } catch (err) {
      throw new UsageError(`Cannot read identity file '${identity}': ${(err as Error).message}`);
    }
  }
  if (env.NODE_SCP_PASSPHRASE) auth.passphrase = env.NODE_SCP_PASSPHRASE;
  if (env.NODE_SCP_PASSWORD) auth.password = env.NODE_SCP_PASSWORD;
  if (env.SSH_AUTH_SOCK) auth.agent = env.SSH_AUTH_SOCK;
  if (!auth.privateKey && !auth.password && !auth.agent) {
    const home = env.HOME ?? homedir();
    for (const name of ['id_ed25519', 'id_ecdsa', 'id_rsa']) {
      const file = join(home, '.ssh', name);
      if (existsSync(file)) {
        auth.privateKey = readFileSync(file);
        break;
      }
    }
  }
  return auth;
}

class ProgressLine {
  readonly #io: CliIo;
  readonly #enabled: boolean;
  #last = 0;
  #width = 0;

  constructor(io: CliIo, enabled: boolean) {
    this.#io = io;
    this.#enabled = enabled && Boolean(io.stderr.isTTY);
  }

  update(p: TransferProgress, prefix: string): void {
    if (!this.#enabled) return;
    const now = Date.now();
    if (now - this.#last < 100) return;
    this.#last = now;
    const pct = p.total ? ` ${Math.floor((p.transferred / p.total) * 100)}%` : '';
    const files = p.filesTotal ? ` ${p.filesCompleted}/${p.filesTotal} files` : '';
    let line = `${prefix}${pct} ${formatBytes(p.transferred)}${files} ${p.path}`;
    if (line.length > 100) line = `${line.slice(0, 97)}...`;
    this.#io.stderr.write(`\r${line.padEnd(this.#width)}`);
    this.#width = line.length;
  }

  clear(): void {
    if (this.#enabled && this.#width > 0) this.#io.stderr.write(`\r${' '.repeat(this.#width)}\r`);
    this.#width = 0;
  }
}

async function localIsDirectory(path: string): Promise<boolean> {
  return (await stat(path).catch(() => undefined))?.isDirectory() ?? false;
}

async function execute(
  client: ScpClient,
  job: Plan,
  transfer: TransferOptions,
  progress: ProgressLine,
) {
  const paths = remotePath(client.remoteOs);
  const many = job.sources.length > 1;
  const totals = { files: 0, bytes: 0 };
  const onProgress = (p: TransferProgress) => progress.update(p, job.direction);

  if (job.direction === 'upload') {
    const target = job.target === '' ? '.' : job.target;
    const intoDir =
      many || /[\\/]$/.test(target) || target === '.' || (await remoteIsDirectory(client, target));
    if (intoDir && many && !(await remoteIsDirectory(client, target))) {
      await mkdirp(client, paths.trimTrailing(target));
    }
    for (const source of job.sources) {
      const name = basename(source.replace(/[\\/]+$/, '')) || source;
      const dest = intoDir ? paths.join(paths.trimTrailing(target) || '/', name) : target;
      const result = await client.upload(source, dest, { ...transfer, onProgress });
      totals.files += result.files;
      totals.bytes += result.bytes;
    }
    return totals;
  }

  const target = job.target;
  const intoDir =
    many || target.endsWith('/') || target.endsWith(sep) || (await localIsDirectory(target));
  for (const source of job.sources) {
    const src = source === '' ? '.' : source;
    const name = paths.basename(paths.trimTrailing(src));
    if (intoDir && (name === '' || name === '.' || name === '..')) {
      throw new UsageError(`Cannot derive a local name from '${source}', give an explicit target`);
    }
    const dest = intoDir ? join(target, name) : target;
    const result = await client.download(src, dest, { ...transfer, onProgress });
    totals.files += result.files;
    totals.bytes += result.bytes;
  }
  return totals;
}

/** Runs the CLI and resolves to the process exit code. */
export async function main(argv: string[], io: CliIo): Promise<number> {
  let values: ReturnType<typeof parse>['values'];
  let positionals: string[];
  function parse(args: string[]) {
    return parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        recursive: { type: 'boolean', short: 'r' },
        preserve: { type: 'boolean', short: 'p' },
        port: { type: 'string', short: 'P' },
        identity: { type: 'string', short: 'i' },
        user: { type: 'string', short: 'u' },
        protocol: { type: 'string' },
        concurrency: { type: 'string', short: 'c' },
        exclude: { type: 'string', multiple: true },
        fingerprint: { type: 'string', multiple: true },
        'scp-command': { type: 'string' },
        timeout: { type: 'string' },
        quiet: { type: 'boolean', short: 'q' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
      },
    });
  }

  try {
    ({ values, positionals } = parse(argv));
  } catch (err) {
    io.stderr.write(`node-scp: ${(err as Error).message}\nTry 'node-scp --help'.\n`);
    return 2;
  }
  if (values.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout.write(`${readVersion()}\n`);
    return 0;
  }

  const progress = new ProgressLine(io, !values.quiet);
  let client: ScpClient | undefined;
  try {
    const job = plan(positionals);
    const protocol = (values.protocol ?? 'auto') as Protocol;
    if (!['auto', 'sftp', 'scp'].includes(protocol)) {
      throw new UsageError(`--protocol must be auto, sftp or scp, got '${protocol}'`);
    }
    const port = integer('--port', values.port, 1) ?? job.remote.port ?? 22;
    const concurrency = integer('--concurrency', values.concurrency, 1);
    const timeout = integer('--timeout', values.timeout, 1) ?? 20_000;

    const expected = [
      ...(values.fingerprint ?? []),
      ...(io.env.NODE_SCP_FINGERPRINT ? io.env.NODE_SCP_FINGERPRINT.split(',') : []),
    ].map(normalizeFingerprint);
    let seen: string | undefined;

    const options: ConnectOptions = {
      host: job.remote.host,
      port,
      username: job.remote.username ?? values.user ?? io.env.USER ?? userInfo().username,
      protocol,
      readyTimeout: timeout,
      ...authOptions(values.identity, io.env),
      // Runs before authentication, so the warning lands before any credential is sent.
      hostVerifier: (key: Buffer) => {
        const first = seen === undefined;
        seen = fingerprintOf(key);
        if (expected.length > 0) return expected.includes(seen);
        if (first && !values.quiet) {
          io.stderr.write(
            `node-scp: host key SHA256:${seen} was not verified, pass --fingerprint to pin it\n`,
          );
        }
        return true;
      },
    };
    if (values['scp-command']) options.scpCommand = values['scp-command'];

    const transfer: TransferOptions = {};
    if (values.recursive) transfer.recursive = true;
    if (values.preserve) transfer.preserve = true;
    if (concurrency !== undefined) transfer.concurrency = concurrency;
    if (values.exclude?.length) {
      const excluded = excludeMatcher(values.exclude);
      transfer.filter = (path) => !excluded(path);
    }

    const started = Date.now();
    try {
      client = await connect(options);
    } catch (err) {
      if (expected.length > 0 && seen && !expected.includes(seen)) {
        throw new ScpError(
          ErrorCode.AuthFailed,
          `Host key mismatch for ${job.remote.host}: got SHA256:${seen}`,
          { cause: err },
        );
      }
      throw err;
    }
    const totals = await execute(client, job, transfer, progress);
    progress.clear();
    if (!values.quiet) {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const verb = job.direction === 'upload' ? 'Uploaded' : 'Downloaded';
      io.stderr.write(
        `${verb} ${totals.files} file${totals.files === 1 ? '' : 's'} (${formatBytes(totals.bytes)}) in ${seconds}s over ${client.protocol}\n`,
      );
    }
    return 0;
  } catch (err) {
    progress.clear();
    if (err instanceof UsageError) {
      io.stderr.write(`node-scp: ${err.message}\nTry 'node-scp --help'.\n`);
      return 2;
    }
    const code = isScpError(err) ? ` (${err.code})` : '';
    io.stderr.write(`node-scp: ${(err as Error).message}${code}\n`);
    return 1;
  } finally {
    await client?.close();
  }
}
