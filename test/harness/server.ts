import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { Server, type ServerChannel, utils } from 'ssh2';
import type { ConnectOptions } from '../../src/index';

/**
 * In-process SSH server for tests. Authentication and channel handling are done by ssh2, while
 * the actual protocols are served by real programs: exec requests run through `/bin/sh` (so
 * `scp -t` / `scp -f` is the system OpenSSH scp) and the SFTP subsystem is the system
 * `sftp-server`. Each behaviour can be switched off or replaced to simulate other servers.
 */
export interface HarnessOptions {
  /** Working directory of every remote process, which acts as the login directory. */
  root: string;
  /**
   * - `real`: pipe to the system sftp-server (default when it exists)
   * - `none`: reject the subsystem request, like Dropbear without sftp-server
   * - `exit`: accept, then exit with status 127 right away
   * - `silent`: accept, then never answer the SFTP handshake
   */
  sftp?: 'real' | 'none' | 'exit' | 'silent';
  /**
   * - `real`: run the command with `/bin/sh -c` (default)
   * - `none`: reject exec requests, like an SFTP only (`ForceCommand internal-sftp`) server
   * - a function: handle the raw channel yourself to inject faults
   */
  exec?: 'real' | 'none' | ((command: string, channel: ServerChannel) => void);
  /** Records every exec command, useful to assert quoting. */
  commands?: string[];
}

export interface Harness {
  port: number;
  connectOptions: ConnectOptions;
  close(): Promise<void>;
}

export const SFTP_SERVER_PATHS = [
  '/usr/lib/openssh/sftp-server',
  '/usr/libexec/openssh/sftp-server',
  '/usr/libexec/sftp-server',
  '/usr/lib/ssh/sftp-server',
  '/usr/lib/sftp-server',
];

export const sftpServerPath = SFTP_SERVER_PATHS.find((p) => existsSync(p));

export const hasScpBinary = ['/usr/bin/scp', '/bin/scp', '/usr/local/bin/scp'].some((p) =>
  existsSync(p),
);

let hostKey: string | undefined;
function getHostKey(): string {
  hostKey ??= generateHostKey();
  return hostKey;
}

/** A fresh ed25519 host key. */
export function generateHostKey(): string {
  // ssh2 emits an ed25519 key it cannot parse back about once in 250 tries.
  for (;;) {
    const key = utils.generateKeyPairSync('ed25519').private;
    if (!(utils.parseKey(key) instanceof Error)) return key;
  }
}

function pipeProcess(channel: ServerChannel, file: string, args: string[], cwd: string): void {
  const child = spawn(file, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  channel.pipe(child.stdin);
  child.stdout.pipe(channel, { end: false });
  child.stderr.pipe(channel.stderr, { end: false });
  child.stdin.on('error', () => {});
  channel.on('close', () => child.kill('SIGTERM'));
  child.on('close', (code, signal) => {
    try {
      if (signal) channel.exit(signal, false, '');
      else channel.exit(code ?? 1);
      channel.end();
    } catch {
      // channel already gone
    }
  });
}

export async function startHarness(options: HarnessOptions): Promise<Harness> {
  const sftpMode = options.sftp ?? (sftpServerPath ? 'real' : 'none');
  const exec = options.exec ?? 'real';
  const connections = new Set<import('ssh2').Connection>();

  const server = new Server({ hostKeys: [getHostKey()] }, (client) => {
    connections.add(client);
    client.on('close', () => connections.delete(client));
    client.on('error', () => {});
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === 'test' && ctx.password === 'test') {
        ctx.accept();
      } else {
        ctx.reject(['password']);
      }
    });
    client.on('session', (acceptSession) => {
      const session = acceptSession();
      session.on('exec', (accept, reject, info) => {
        options.commands?.push(info.command);
        if (exec === 'none') {
          reject();
          return;
        }
        const channel = accept();
        if (typeof exec === 'function') exec(info.command, channel);
        else pipeProcess(channel, '/bin/sh', ['-c', info.command], options.root);
      });
      session.on('subsystem', (accept, reject, info) => {
        if (info.name !== 'sftp' || sftpMode === 'none' || !sftpServerPath) {
          reject();
          return;
        }
        const channel = accept();
        if (sftpMode === 'exit') {
          channel.exit(127);
          channel.end();
          return;
        }
        if (sftpMode === 'silent') return;
        pipeProcess(channel, sftpServerPath, ['-e'], options.root);
      });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    connectOptions: {
      host: '127.0.0.1',
      port,
      username: 'test',
      password: 'test',
      readyTimeout: 10_000,
    },
    async close() {
      for (const c of connections) c.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
