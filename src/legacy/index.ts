/**
 * The 0.x API of node-scp, kept so existing code can upgrade by changing one import:
 *
 * ```ts
 * import { Client } from 'node-scp/legacy';
 * ```
 *
 * It always uses SFTP, like 0.x did. New code should use `connect` from `node-scp`.
 *
 * @module legacy
 */
import { EventEmitter } from 'node:events';
import { resolve as resolveLocal } from 'node:path';
import type {
  AcceptConnection,
  ChangePasswordCallback,
  ClientChannel,
  ClientErrorExtensions,
  ConnectConfig,
  InputAttributes,
  KeyboardInteractiveCallback,
  NegotiatedAlgorithms,
  ParsedKey,
  Prompt,
  RejectConnection,
  SFTPWrapper,
  TransferOptions as Ssh2TransferOptions,
  WriteFileOptions as Ssh2WriteFileOptions,
  Client as SshClient,
  Stats,
  TcpConnectionDetails,
  UNIXConnectionDetails,
  X11Details,
} from 'ssh2';
import { connect, type ScpClient as ModernClient } from '../client';
import { ErrorCode, isScpError, ScpError } from '../errors';
import { remotePath as remotePathApi } from '../remote-path';
import { typeFromMode } from '../sftp/ops';

/** Listeners for ssh2 client events, passed as `events` in {@link TScpOptions}. */
export interface ClientEvents {
  banner?: (message: string) => void;
  ready?: () => void;
  'tcp connection'?: (
    details: TcpConnectionDetails,
    accept: AcceptConnection<ClientChannel>,
    reject: RejectConnection,
  ) => void;
  x11?: (
    details: X11Details,
    accept: AcceptConnection<ClientChannel>,
    reject: RejectConnection,
  ) => void;
  'keyboard-interactive'?: (
    name: string,
    instructions: string,
    lang: string,
    prompts: Prompt[],
    finish: KeyboardInteractiveCallback,
  ) => void;
  'change password'?: (message: string, done: ChangePasswordCallback) => void;
  error?: (err: Error & ClientErrorExtensions) => void;
  end?: () => void;
  close?: () => void;
  timeout?: () => void;
  connect?: () => void;
  greeting?: (greeting: string) => void;
  handshake?: (negotiated: NegotiatedAlgorithms) => void;
  hostkeys?: (keys: ParsedKey[]) => void;
  'unix connection'?: (
    info: UNIXConnectionDetails,
    accept: AcceptConnection,
    reject: RejectConnection,
  ) => void;
}

/** Options of the 0.x {@link Client}: every ssh2 connect option plus the two below. */
export type TScpOptions = ConnectConfig & {
  /** `win32` for Windows OpenSSH servers. Defaults to `posix`. */
  remoteOsType?: 'posix' | 'win32';
  /** Event listeners attached to the ssh2 client before it connects. */
  events?: ClientEvents;
};

/** Entry shape returned by {@link ScpClient.list}, unchanged from 0.x. */
export interface ListEntry {
  /** `d` directory, `-` file, `l` symlink, or the first character of the long listing. */
  type: string;
  name: string;
  size: number;
  modifyTime: number;
  accessTime: number;
  rights: { user: string; group: string; other: string };
  owner: number;
  group: number;
}

const FORWARDED = [
  'connect',
  'end',
  'timeout',
  'banner',
  'greeting',
  'handshake',
  'hostkeys',
  'keyboard-interactive',
  'change password',
  'tcp connection',
  'unix connection',
  'x11',
] as const;

function notConnected(name: string): ScpError {
  return new ScpError(ErrorCode.NotConnected, `${name}: No SFTP connection available`);
}

function rights(bits: number): string {
  return `${bits & 4 ? 'r' : ''}${bits & 2 ? 'w' : ''}${bits & 1 ? 'x' : ''}`;
}

function listType(mode: number | undefined, longname: string): string {
  const type = typeFromMode(mode, longname);
  if (type === 'directory') return 'd';
  if (type === 'file') return '-';
  if (type === 'symlink') return 'l';
  return longname.charAt(0) || '?';
}

type Callback<T> = (err: Error | null | undefined, value: T) => void;

/**
 * The 0.x client returned by {@link Client}, with the same methods and events as before.
 *
 * @deprecated Use `connect` from `node-scp`.
 */
export class ScpClient extends EventEmitter {
  sftpWrapper: SFTPWrapper | null = null;
  sshClient: SshClient | null = null;
  remotePathSep: '/' | '\\' = '/';
  endCalled = false;
  /** The v1 client behind this object. */
  modern: ModernClient | null = null;

  constructor(options: Pick<TScpOptions, 'remoteOsType'> = {}) {
    super();
    if (options.remoteOsType === 'win32') this.remotePathSep = '\\';
  }

  /** @internal */
  attach(modern: ModernClient): void {
    this.modern = modern;
    this.sshClient = modern.ssh;
    this.sftpWrapper = modern.sftp ?? null;
    modern.ssh.on('close', () => {
      this.sftpWrapper = null;
      this.sshClient = null;
      this.emit('close');
    });
    modern.ssh.on('error', (err: Error) => {
      if (this.listenerCount('error') > 0) this.emit('error', err);
    });
  }

  #paths() {
    return remotePathApi(this.remotePathSep === '\\' ? 'win32' : 'posix');
  }

  #sftp(name: string): SFTPWrapper {
    if (!this.sftpWrapper) throw notConnected(name);
    return this.sftpWrapper;
  }

  #call<T>(name: string, run: (sftp: SFTPWrapper, cb: Callback<T>) => void): Promise<T> {
    const sftp = this.sftpWrapper;
    if (!sftp) return Promise.reject(notConnected(name));
    return new Promise<T>((resolve, reject) => {
      run(sftp, (err, value) => {
        if (err) reject(err);
        else resolve(value);
      });
    });
  }

  #modern(name: string): ModernClient {
    if (!this.modern || !this.sftpWrapper) throw notConnected(name);
    return this.modern;
  }

  async #normalize(path: string): Promise<string> {
    if (path.startsWith('..')) {
      return `${await this.realPath('..')}${this.remotePathSep}${path.substring(3)}`;
    }
    if (path.startsWith('.')) {
      return `${await this.realPath('.')}${this.remotePathSep}${path.substring(2)}`;
    }
    return path;
  }

  /** Uploads a file using parallel writes. */
  uploadFile(
    localPath: string,
    remotePath: string,
    options: Ssh2TransferOptions = {},
  ): Promise<void> {
    return this.#call<void>('uploadFile', (sftp, cb) =>
      sftp.fastPut(localPath, remotePath, options, (err) => cb(err, undefined)),
    );
  }

  /** Downloads a file using parallel reads. */
  downloadFile(
    remotePath: string,
    localPath: string,
    options: Ssh2TransferOptions = {},
  ): Promise<void> {
    return this.#call<void>('downloadFile', (sftp, cb) =>
      sftp.fastGet(remotePath, localPath, options, (err) => cb(err, undefined)),
    );
  }

  /** Makes `dir` an empty directory, creating it when missing. */
  async emptyDir(dir: string): Promise<void> {
    this.#sftp('emptyDir');
    const type = await this.exists(dir);
    if (!type) {
      await this.mkdir(dir);
    } else if (type === 'd') {
      await this.rmdir(dir);
      await this.mkdir(dir);
    }
  }

  /** Uploads the contents of a local directory into `dest`, creating `dest` when missing. */
  async uploadDir(src: string, dest: string): Promise<void> {
    await this.#modern('uploadDir').upload(src, dest, { recursive: true });
  }

  /** Downloads a remote directory. Resolves to a short summary message, like 0.x. */
  async downloadDir(remotePath: string, localPath: string): Promise<string> {
    const modern = this.#modern('downloadDir');
    const remote = await this.#normalize(remotePath);
    const type = await this.exists(remote);
    if (!type) throw new Error(`No such directory: ${remote}`);
    if (type !== 'd') throw new Error(`Bad path: ${remote} must be a directory`);
    const local = resolveLocal(localPath);
    const paths = this.#paths();
    let completed = 0;
    await modern.download(remote, local, {
      recursive: true,
      onProgress: (p) => {
        if (p.filesCompleted === completed) return;
        completed = p.filesCompleted;
        const detail = {
          source: paths.join(remote, ...p.path.split('/')),
          destination: resolveLocal(local, p.path),
        };
        this.emit('download', detail);
        this.sshClient?.emit('download', detail);
      },
    });
    return `${remote} downloaded to ${local}`;
  }

  stat(remotePath: string): Promise<Stats> {
    return this.#call<Stats>('stat', (sftp, cb) => sftp.stat(remotePath, cb));
  }

  setstat(path: string, attributes: InputAttributes = {}): Promise<void> {
    return this.#call<void>('setstat', (sftp, cb) =>
      sftp.setstat(path, attributes, (err) => cb(err, undefined)),
    );
  }

  unlink(remotePath: string): Promise<void> {
    return this.#call<void>('unlink', (sftp, cb) =>
      sftp.unlink(remotePath, (err) => cb(err, undefined)),
    );
  }

  /** Removes a directory and everything inside it. */
  async rmdir(remotePath: string): Promise<void> {
    const paths = this.#paths();
    const entries = await this.#call<Array<{ filename: string; attrs: Stats }>>(
      'rmdir',
      (sftp, cb) => sftp.readdir(remotePath, cb as Callback<unknown>),
    );
    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') continue;
      const full = paths.join(remotePath, entry.filename);
      if (typeFromMode(entry.attrs.mode) === 'directory') await this.rmdir(full);
      else await this.unlink(full);
    }
    await this.#call<void>('rmdir', (sftp, cb) =>
      sftp.rmdir(remotePath, (err) => cb(err, undefined)),
    );
  }

  /** Creates a directory, with parents when `recursive` is set. */
  async mkdir(
    remotePath: string,
    attributes: InputAttributes = {},
    options: { recursive?: boolean } = {},
  ): Promise<void> {
    const make = (path: string) =>
      this.#call<void>('mkdir', (sftp, cb) =>
        sftp.mkdir(path, attributes, (err) => cb(err, undefined)),
      );
    if (!options.recursive) {
      await make(remotePath);
      return;
    }
    const sep = this.remotePathSep;
    const paths = this.#paths();
    const parts = remotePath.split(sep).filter(Boolean);
    let current = remotePath.startsWith(sep) ? sep : '';
    for (const part of parts) {
      current = current ? paths.join(current, part) : part;
      const type = await this.exists(current);
      if (!type) {
        try {
          await make(current);
        } catch (err) {
          if ((await this.exists(current)) !== 'd') throw err;
        }
      } else if (type !== 'd') {
        throw new Error(
          `Cannot create directory '${remotePath}': Path exists and is not a directory`,
        );
      }
    }
  }

  /** Resolves to `'d'`, `'-'` or `'l'`, or `false` when the path does not exist. */
  async exists(remotePath: string): Promise<'d' | '-' | 'l' | false> {
    this.#sftp('exists');
    try {
      const stats = await this.stat(remotePath);
      if (stats.isDirectory()) return 'd';
      if (stats.isSymbolicLink()) return 'l';
      if (stats.isFile()) return '-';
      return false;
    } catch {
      return false;
    }
  }

  writeFile(
    remotePath: string,
    data: string | Buffer,
    options: Ssh2WriteFileOptions = {},
  ): Promise<void> {
    return this.#call<void>('writeFile', (sftp, cb) =>
      sftp.writeFile(remotePath, data, options, (err) => cb(err, undefined)),
    );
  }

  utimes(path: string, atime: number | Date, mtime: number | Date): Promise<void> {
    return this.#call<void>('utimes', (sftp, cb) =>
      sftp.utimes(path, atime, mtime, (err) => cb(err, undefined)),
    );
  }

  symlink(targetPath: string, linkPath: string): Promise<void> {
    return this.#call<void>('symlink', (sftp, cb) =>
      sftp.symlink(targetPath, linkPath, (err) => cb(err, undefined)),
    );
  }

  rename(srcPath: string, destPath: string): Promise<void> {
    return this.#call<void>('rename', (sftp, cb) =>
      sftp.rename(srcPath, destPath, (err) => cb(err, undefined)),
    );
  }

  readlink(path: string): Promise<string> {
    return this.#call<string>('readlink', (sftp, cb) => sftp.readlink(path, cb));
  }

  readFile(remotePath: string): Promise<Buffer> {
    return this.#call<Buffer>('readFile', (sftp, cb) => sftp.readFile(remotePath, cb));
  }

  lstat(path: string): Promise<Stats> {
    return this.#call<Stats>('lstat', (sftp, cb) => sftp.lstat(path, cb));
  }

  appendFile(
    remotePath: string,
    data: string | Buffer,
    options: Ssh2WriteFileOptions = {},
  ): Promise<void> {
    return this.#call<void>('appendFile', (sftp, cb) =>
      sftp.appendFile(remotePath, data, options, (err) => cb(err, undefined)),
    );
  }

  chmod(path: string, mode: number | string): Promise<void> {
    return this.#call<void>('chmod', (sftp, cb) =>
      sftp.chmod(path, mode, (err) => cb(err, undefined)),
    );
  }

  chown(path: string, uid: number, gid: number): Promise<void> {
    return this.#call<void>('chown', (sftp, cb) =>
      sftp.chown(path, uid, gid, (err) => cb(err, undefined)),
    );
  }

  /** Closes the connection. The returned promise resolves once it is closed. */
  close(): Promise<void> {
    this.endCalled = true;
    const modern = this.modern;
    this.sftpWrapper = null;
    return modern ? modern.close() : Promise.resolve();
  }

  /** Lists a directory. `pattern` filters names, as a RegExp or a `*` wildcard string. */
  async list(remotePath: string, pattern: RegExp | string = /.*/): Promise<ListEntry[]> {
    this.#sftp('list');
    const path = await this.#normalize(remotePath);
    if ((await this.exists(path)) !== 'd') throw new Error('Remote path is invalid');
    const entries = await this.#call<Array<{ filename: string; longname: string; attrs: Stats }>>(
      'list',
      (sftp, cb) => sftp.readdir(path, cb as Callback<unknown>),
    );
    const regex =
      pattern instanceof RegExp ? pattern : new RegExp(pattern.replace(/\*([^*])*?/gi, '.*'));
    return entries
      .filter((item) => item.filename !== '.' && item.filename !== '..')
      .map((item) => {
        const mode = item.attrs.mode ?? 0;
        return {
          type: listType(item.attrs.mode, item.longname),
          name: item.filename,
          size: item.attrs.size,
          modifyTime: item.attrs.mtime * 1000,
          accessTime: item.attrs.atime * 1000,
          rights: {
            user: rights(mode >> 6),
            group: rights(mode >> 3),
            other: rights(mode),
          },
          owner: item.attrs.uid,
          group: item.attrs.gid,
        };
      })
      .filter((item) => regex.test(item.name));
  }

  /** Resolves `remotePath` to an absolute path. */
  realPath(remotePath: string): Promise<string> {
    return this.#call<string>('realPath', (sftp, cb) => sftp.realpath(remotePath, cb));
  }
}

function unwrap(err: unknown): unknown {
  if (
    isScpError(err) &&
    err.cause instanceof Error &&
    (err.code === ErrorCode.ConnectionFailed ||
      err.code === ErrorCode.AuthFailed ||
      err.code === ErrorCode.Timeout)
  ) {
    return err.cause;
  }
  return err;
}

/**
 * Connects over SFTP and resolves to a {@link ScpClient}.
 *
 * @deprecated Use `connect` from `node-scp`.
 */
export async function Client(options: TScpOptions): Promise<ScpClient> {
  const { remoteOsType, events, ...config } = options;
  const client = new ScpClient(remoteOsType ? { remoteOsType } : {});
  for (const [event, handler] of Object.entries(events ?? {})) {
    if (typeof handler === 'function') client.on(event, handler as (...args: unknown[]) => void);
  }
  let modern: ModernClient;
  try {
    modern = await connect({
      ...config,
      protocol: 'sftp',
      remoteOs: remoteOsType ?? 'posix',
      beforeConnect: (ssh) => {
        const emitter: EventEmitter = ssh;
        for (const event of FORWARDED) {
          emitter.on(event, (...args: unknown[]) => client.emit(event, ...args));
        }
      },
    });
  } catch (err) {
    const raw = unwrap(err);
    if (client.listenerCount('error') > 0) client.emit('error', raw);
    throw raw;
  }
  client.attach(modern);
  client.emit('ready');
  return client;
}

export default Client;
