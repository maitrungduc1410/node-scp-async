import type { Readable } from 'node:stream';
import { type ConnectConfig, type SFTPWrapper, Client as SshClient } from 'ssh2';
import { abortError, ErrorCode, fromConnectError, ScpError, throwIfAborted } from './errors';
import { type RemoteOs, remotePath } from './remote-path';
import { ScpTransport } from './scp/transport';
import { RemoteFs } from './sftp/remote-fs';
import { SftpTransport } from './sftp/transport';
import type { Transport } from './transport';
import type {
  ActiveProtocol,
  ConnectOptions,
  ReadFileOptions,
  TransferOptions,
  TransferResult,
  WriteFileOptions,
} from './types';

const asyncDispose: typeof Symbol.asyncDispose =
  Symbol.asyncDispose ?? (Symbol.for('Symbol.asyncDispose') as typeof Symbol.asyncDispose);

const PROTOCOLS = new Set(['auto', 'sftp', 'scp']);

/**
 * A connected client. Create one with {@link connect}, close it with {@link ScpClient.close} or
 * `await using`.
 */
export class ScpClient {
  /** The protocol transfers use on this connection. */
  readonly protocol: ActiveProtocol;
  /** Remote filesystem operations. `undefined` when the connection uses SCP. */
  readonly fs: RemoteFs | undefined;
  /** The raw ssh2 SFTP session, for advanced use. `undefined` when the connection uses SCP. */
  readonly sftp: SFTPWrapper | undefined;
  /** The underlying ssh2 client, for advanced use such as running commands. */
  readonly ssh: SshClient;
  /** Path flavour and quoting rules of the server, as passed to {@link connect}. */
  readonly remoteOs: RemoteOs;

  readonly #transport: Transport;
  #closed = false;
  #closeError: Error | undefined;
  readonly #closedPromise: Promise<void>;

  /** @internal Use {@link connect}. */
  constructor(
    ssh: SshClient,
    sftp: SFTPWrapper | undefined,
    options: { remoteOs: RemoteOs; scpCommand: string; handshakeTimeout: number },
  ) {
    this.ssh = ssh;
    this.sftp = sftp;
    this.remoteOs = options.remoteOs;
    const paths = remotePath(options.remoteOs);
    if (sftp) {
      this.protocol = 'sftp';
      this.fs = new RemoteFs(sftp, paths);
      this.#transport = new SftpTransport(sftp, paths);
    } else {
      this.protocol = 'scp';
      this.fs = undefined;
      this.#transport = new ScpTransport(ssh, {
        scpCommand: options.scpCommand,
        paths,
        handshakeTimeout: options.handshakeTimeout,
      });
    }
    ssh.on('error', (err: Error) => {
      this.#closeError = err;
    });
    this.#closedPromise = new Promise<void>((resolve) => {
      ssh.once('close', () => {
        this.#closed = true;
        resolve();
      });
    });
  }

  /** `true` once the connection is closed, by {@link close} or by the network. */
  get closed(): boolean {
    return this.#closed;
  }

  /**
   * Copies a local file, or a directory with `recursive: true`, to `remotePath`. The destination
   * is exact: `upload('dist', '/www')` makes `/www` mirror `dist`. The remote parent directory
   * must exist.
   */
  upload(
    localPath: string,
    remotePath: string,
    options: TransferOptions = {},
  ): Promise<TransferResult> {
    return this.#run(() => this.#transport.upload(localPath, remotePath, options));
  }

  /**
   * Copies a remote file, or a directory with `recursive: true`, to `localPath`. The destination
   * is exact and local parent directories are created.
   */
  download(
    remotePath: string,
    localPath: string,
    options: TransferOptions = {},
  ): Promise<TransferResult> {
    return this.#run(() => this.#transport.download(remotePath, localPath, options));
  }

  /** Writes a string, bytes or a stream to a remote file. Works over SFTP and SCP. */
  writeFile(
    remotePath: string,
    data: string | Uint8Array | Readable,
    options: WriteFileOptions = {},
  ): Promise<void> {
    return this.#run(() => this.#transport.writeFile(remotePath, data, options));
  }

  /** Reads a whole remote file into memory. Works over SFTP and SCP. */
  readFile(remotePath: string, options: ReadFileOptions = {}): Promise<Buffer> {
    return this.#run(() => this.#transport.readFile(remotePath, options));
  }

  /** Closes the connection. Safe to call more than once. */
  async close(): Promise<void> {
    if (!this.#closed) {
      this.sftp?.end();
      this.ssh.end();
    }
    await this.#closedPromise;
  }

  /** Closes the connection at the end of an `await using` block. */
  async [asyncDispose](): Promise<void> {
    await this.close();
  }

  async #run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closed) {
      throw new ScpError(
        ErrorCode.NotConnected,
        `The connection is closed${this.#closeError ? `: ${this.#closeError.message}` : ''}`,
        { cause: this.#closeError },
      );
    }
    return operation();
  }
}

function openSftp(ssh: SshClient, timeoutMs: number, signal?: AbortSignal): Promise<SFTPWrapper> {
  return new Promise<SFTPWrapper>((resolve, reject) => {
    let done = false;
    const settle = (): boolean => {
      if (done) return false;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      return true;
    };
    const onAbort = () => {
      if (settle()) reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      if (settle()) reject(new Error(`no SFTP response within ${timeoutMs} ms`));
    }, timeoutMs);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      ssh.sftp((err, sftp) => {
        if (!settle()) {
          sftp?.end();
          return;
        }
        if (err) reject(err);
        else resolve(sftp);
      });
    } catch (err) {
      if (settle()) reject(err);
    }
  });
}

function waitForReady(ssh: SshClient, config: ConnectConfig, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      ssh.off('ready', onReady);
      ssh.off('error', onError);
      ssh.off('close', onClose);
      signal?.removeEventListener('abort', onAbort);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      cleanup();
      ssh.end();
      reject(fromConnectError(err));
    };
    const onClose = () => {
      cleanup();
      reject(new ScpError(ErrorCode.ConnectionClosed, 'The connection closed before it was ready'));
    };
    const onAbort = () => {
      cleanup();
      ssh.end();
      reject(abortError(signal));
    };
    ssh.on('ready', onReady);
    ssh.on('error', onError);
    ssh.on('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      ssh.connect(config);
    } catch (err) {
      cleanup();
      reject(
        new ScpError(
          ErrorCode.InvalidArgument,
          `Invalid connection options: ${(err as Error).message}`,
          { cause: err },
        ),
      );
    }
  });
}

/**
 * Opens an SSH connection and picks the transfer protocol.
 *
 * @example
 * ```ts
 * const client = await connect({ host: '10.0.0.1', username: 'root', privateKey });
 * await client.upload('./dist', '/www', { recursive: true });
 * await client.close();
 * ```
 */
export async function connect(options: ConnectOptions): Promise<ScpClient> {
  const {
    protocol = 'auto',
    remoteOs = 'posix',
    scpCommand = 'scp',
    signal,
    beforeConnect,
    noDelay = true,
    ...config
  } = options;
  if (!PROTOCOLS.has(protocol)) {
    throw new ScpError(
      ErrorCode.InvalidArgument,
      `protocol must be 'auto', 'sftp' or 'scp', got ${JSON.stringify(protocol)}`,
    );
  }
  if (remoteOs !== 'posix' && remoteOs !== 'win32') {
    throw new ScpError(
      ErrorCode.InvalidArgument,
      `remoteOs must be 'posix' or 'win32', got ${JSON.stringify(remoteOs)}`,
    );
  }
  throwIfAborted(signal);

  const ssh = new SshClient();
  let lateError: Error | undefined;
  const guard = (err: Error) => {
    lateError = err;
  };
  ssh.on('error', guard);
  let closedEarly = false;
  ssh.once('close', () => {
    closedEarly = true;
  });
  beforeConnect?.(ssh);
  await waitForReady(ssh, config, signal);
  if (noDelay) ssh.setNoDelay(true);

  let sftp: SFTPWrapper | undefined;
  if (protocol !== 'scp') {
    try {
      sftp = await openSftp(ssh, config.readyTimeout ?? 20_000, signal);
    } catch (err) {
      if (signal?.aborted) {
        ssh.end();
        throw abortError(signal);
      }
      if (protocol === 'sftp') {
        ssh.end();
        throw new ScpError(
          ErrorCode.SftpUnavailable,
          `The server does not offer SFTP: ${(err as Error).message}. Use protocol 'scp' or 'auto'.`,
          { cause: err },
        );
      }
    }
  }
  if (signal?.aborted) {
    ssh.end();
    throw abortError(signal);
  }
  if (closedEarly) {
    throw lateError
      ? fromConnectError(lateError)
      : new ScpError(ErrorCode.ConnectionClosed, 'The connection closed during setup');
  }
  const client = new ScpClient(ssh, sftp, {
    remoteOs,
    scpCommand,
    handshakeTimeout: config.readyTimeout ?? 20_000,
  });
  ssh.off('error', guard);
  if (lateError) {
    ssh.end();
    throw fromConnectError(lateError);
  }
  return client;
}
