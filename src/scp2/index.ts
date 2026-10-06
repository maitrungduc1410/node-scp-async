/**
 * A drop in replacement for the unmaintained `scp2` package:
 *
 * ```js
 * const { scp } = require('node-scp/scp2');
 * scp('dist/', 'deploy:secret@example.com:/var/www/', (err) => {});
 * ```
 *
 * Unlike `scp2` it works with servers that only speak SCP, such as Dropbear on OpenWrt, and it
 * returns a promise when no callback is given.
 *
 * @module scp2
 */
import { EventEmitter } from 'node:events';
import { stat } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import { connect, type ScpClient as ModernClient } from '../client';
import { ErrorCode, ScpError } from '../errors';
import { expandGlob, hasMagic } from '../glob';
import { mkdirp, remoteIsDirectory } from '../remote-helpers';
import { remotePath } from '../remote-path';
import type { ConnectOptions } from '../types';

/** Connection options in the `scp2` style: node-scp's connect options plus a remote `path`. */
export interface Scp2Options extends Omit<ConnectOptions, 'port' | 'beforeConnect' | 'signal'> {
  /** SSH port, as a number or a string. */
  port?: number | string;
  /** Remote path the operation works on. */
  path?: string;
}

/** What {@link write} sends: `content` written to the remote `destination`. */
export interface Scp2WriteOptions {
  destination: string;
  content: string | Buffer;
  attrs?: { mode?: number };
  source?: string;
}

/** Node style callback of the `scp2` API, called with an error or with `null` on success. */
export type Scp2Callback = (err?: Error | null) => void;

const SCP2_REMOTE = /^([a-zA-Z0-9\-._]+)(:.*)?@([^:]+)(:\d+)?:(.*)$/;

function finish<T>(
  promise: Promise<T>,
  callback: Scp2Callback | undefined,
): Promise<T> | undefined {
  if (!callback) return promise;
  promise.then(
    () => callback(null),
    (err: Error) => callback(err),
  );
  return undefined;
}

/** Drop in for the `Client` class of `scp2`, with the same constructor, events and methods. */
export class Client extends EventEmitter {
  remote: Scp2Options = {};
  #defaults: Scp2Options;
  #connection: Promise<ModernClient> | undefined;

  constructor(options: Scp2Options = {}) {
    super();
    this.#defaults = { ...options };
  }

  /** Sets default connection options, merged under what {@link parse} returns. */
  defaults(options: Scp2Options): void {
    this.#defaults = { ...this.#defaults, ...options };
  }

  /** Parses `user:password@host:port:/path` or an options object and remembers it. */
  parse(remote: string | Scp2Options): Scp2Options {
    if (typeof remote !== 'string') {
      this.remote = { ...this.#defaults, ...remote };
      return this.remote;
    }
    const m = SCP2_REMOTE.exec(remote);
    if (!m) return {};
    const parsed: Scp2Options = { username: m[1]!, host: m[3]!, path: m[5]! };
    if (m[2]) parsed.password = m[2].slice(1);
    if (m[4]) parsed.port = Number(m[4].slice(1));
    this.remote = { ...this.#defaults, ...parsed };
    return this.remote;
  }

  /** @internal */
  connection(): Promise<ModernClient> {
    if (!this.#connection) {
      const { path: _path, port, ...options } = { ...this.#defaults, ...this.remote };
      const config: ConnectOptions = { ...options };
      if (port !== undefined) config.port = Number(port);
      this.#connection = connect({
        ...config,
        beforeConnect: (ssh) => {
          ssh.on('connect', () => this.emit('connect'));
          ssh.on('end', () => this.emit('end'));
          ssh.on('close', () => {
            this.#connection = undefined;
            this.emit('close');
          });
          ssh.on('error', (err) => {
            if (this.listenerCount('error') > 0) this.emit('error', err);
          });
        },
      }).then(
        (client) => {
          this.emit('ready');
          return client;
        },
        (err: unknown) => {
          this.#connection = undefined;
          throw err;
        },
      );
    }
    return this.#connection;
  }

  /** Resolves to the raw ssh2 SFTP session, like `scp2`. Fails on SCP only servers. */
  sftp(callback?: (err: Error | null, sftp?: ModernClient['sftp']) => void) {
    const promise = this.connection().then((client) => {
      if (!client.sftp) {
        throw new ScpError(ErrorCode.SftpUnavailable, 'The server does not offer SFTP');
      }
      return client.sftp;
    });
    if (!callback) return promise;
    promise.then(
      (sftp) => callback(null, sftp),
      (err: Error) => callback(err),
    );
    return undefined;
  }

  /** Creates a remote directory and its parents. */
  mkdir(dir: string, attrs?: { mode?: number } | Scp2Callback, callback?: Scp2Callback) {
    const cb = typeof attrs === 'function' ? attrs : callback;
    const mode = typeof attrs === 'object' ? attrs.mode : undefined;
    return finish(
      this.connection().then(async (client) => {
        await mkdirp(client, dir, mode);
        this.emit('mkdir', dir);
      }),
      cb,
    );
  }

  /** Writes `content` to `destination`. */
  write(options: Scp2WriteOptions, callback?: Scp2Callback) {
    return finish(
      this.connection().then(async (client) => {
        const data =
          typeof options.content === 'string' ? Buffer.from(options.content) : options.content;
        await client.writeFile(options.destination, data, {
          mode: options.attrs?.mode ?? 0o644,
        });
        this.emit('transfer', data, data.length, data.length);
        this.emit('write', options);
      }),
      callback,
    );
  }

  /**
   * Uploads a local file. A `dest` ending in `/`, or naming an existing directory, receives the
   * file under its own name. Missing parent directories are created.
   */
  upload(src: string, dest: string, callback?: Scp2Callback) {
    return finish(
      this.connection().then(async (client) => {
        const target = await fileTarget(client, dest, basename(src));
        await mkdirp(client, remotePath(client.remoteOs).dirname(target));
        await client.upload(src, target, {
          onProgress: (p) => this.emit('transfer', null, p.transferred, p.total),
        });
        this.emit('write', { source: src, destination: target });
      }),
      callback,
    );
  }

  /** Downloads a remote file or directory. */
  download(src: string, dest: string, callback?: Scp2Callback) {
    return finish(
      this.connection().then(async (client) => {
        const local = await localTarget(dest, remotePath(client.remoteOs).basename(src));
        await client.download(src, local, { recursive: true });
        this.emit('read', src);
      }),
      callback,
    );
  }

  /** Closes the connection. */
  close(): void {
    void this.shutdown();
  }

  /** @internal Closes the connection and waits until it is closed. */
  async shutdown(): Promise<void> {
    const connection = this.#connection;
    this.#connection = undefined;
    const client = await connection?.catch(() => undefined);
    await client?.close();
  }
}

async function fileTarget(client: ModernClient, dest: string, name: string): Promise<string> {
  const paths = remotePath(client.remoteOs);
  const path = dest === '' ? '.' : dest;
  if (/[\\/]$/.test(path) || path === '.' || (await remoteIsDirectory(client, path))) {
    return paths.join(paths.trimTrailing(path) || '/', name);
  }
  return path;
}

async function localTarget(dest: string, name: string): Promise<string> {
  if (dest.endsWith('/') || dest.endsWith(sep)) return join(dest, name);
  const st = await stat(dest).catch(() => undefined);
  return st?.isDirectory() ? join(dest, name) : dest;
}

async function copyToRemote(client: Client, src: string, dest: string | Scp2Options) {
  const remote = client.parse(dest);
  if (!remote.host) {
    throw new ScpError(ErrorCode.InvalidArgument, `Cannot parse the destination ${String(dest)}`);
  }
  const conn = await client.connection();
  const paths = remotePath(conn.remoteOs);
  const base = remote.path === undefined || remote.path === '' ? '.' : remote.path;

  if (!hasMagic(src)) {
    const st = await stat(src).catch(() => undefined);
    if (st?.isDirectory()) {
      const target = paths.trimTrailing(base) || '/';
      await mkdirp(conn, target);
      await conn.upload(src, target, {
        recursive: true,
        onProgress: (p) => client.emit('transfer', null, p.transferred, p.total),
      });
      return;
    }
    await client.upload(src, base);
    return;
  }

  const { base: globRoot, matches } = await expandGlob(src);
  for (const rel of matches) {
    const abs = join(globRoot, rel);
    const st = await stat(abs);
    if (!st.isFile()) continue;
    const target = paths.join(paths.trimTrailing(base) || '/', ...rel.split('/'));
    await mkdirp(conn, paths.dirname(target));
    await conn.upload(abs, target, {
      onProgress: (p) => client.emit('transfer', null, p.transferred, p.total),
    });
    client.emit('write', { source: abs, destination: target });
  }
}

async function run(src: string | Scp2Options, dest: string | Scp2Options, client: Client) {
  try {
    const parsedSource = client.parse(src);
    if (parsedSource.host && parsedSource.path !== undefined) {
      if (typeof dest !== 'string') {
        throw new ScpError(
          ErrorCode.InvalidArgument,
          'A download destination must be a local path',
        );
      }
      await client.download(parsedSource.path === '' ? '.' : parsedSource.path, dest);
      return;
    }
    if (typeof src !== 'string') {
      throw new ScpError(ErrorCode.InvalidArgument, 'An upload source must be a local path');
    }
    await copyToRemote(client, src, dest);
  } finally {
    await client.shutdown();
  }
}

/**
 * Copies between local and remote in the style of `scp2`. The remote side is written as
 * `user:password@host:port:/path` or given as an options object with a `path`.
 */
export function scp(
  src: string | Scp2Options,
  dest: string | Scp2Options,
  callback: Scp2Callback,
): void;
export function scp(
  src: string | Scp2Options,
  dest: string | Scp2Options,
  client: Client,
  callback: Scp2Callback,
): void;
export function scp(
  src: string | Scp2Options,
  dest: string | Scp2Options,
  client?: Client,
): Promise<void>;
export function scp(
  src: string | Scp2Options,
  dest: string | Scp2Options,
  clientOrCallback?: Client | Scp2Callback,
  callback?: Scp2Callback,
): Promise<void> | undefined {
  const client = clientOrCallback instanceof Client ? clientOrCallback : new Client();
  const cb = typeof clientOrCallback === 'function' ? clientOrCallback : callback;
  return finish(run(src, dest, client), cb);
}

const shared = new Client();

/** Sets defaults on the shared client, like `require('scp2').defaults(...)`. */
export const defaults = (options: Scp2Options) => shared.defaults(options);
/** Uploads a local file or directory with the shared client. */
export const upload = (src: string, dest: string, callback?: Scp2Callback) =>
  shared.upload(src, dest, callback);
/** Downloads a remote file or directory with the shared client. */
export const download = (src: string, dest: string, callback?: Scp2Callback) =>
  shared.download(src, dest, callback);
/** Creates a remote directory and its parents with the shared client. */
export const mkdir = (
  dir: string,
  attrs?: { mode?: number } | Scp2Callback,
  callback?: Scp2Callback,
) => shared.mkdir(dir, attrs, callback);
/** Writes `content` to a remote file with the shared client. */
export const write = (options: Scp2WriteOptions, callback?: Scp2Callback) =>
  shared.write(options, callback);
/** Parses a remote location for the shared client, like `require('scp2').parse(...)`. */
export const parse = (remote: string | Scp2Options) => shared.parse(remote);
/** Closes the connection of the shared client. */
export const close = () => shared.close();

/** The shared default client of `require('scp2')`, with `scp` and `Client` attached. */
export default Object.assign(shared, { scp, Client });
