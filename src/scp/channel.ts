import type { ClientChannel, Client as SshClient } from 'ssh2';
import { abortError, codeFromRemoteMessage, ErrorCode, ScpError } from '../errors';
import { type ControlRecord, parseRecord } from './protocol';
import { ByteReader, EndOfStreamError } from './reader';

const EXIT_WAIT_MS = 5000;

export interface ScpChannelOptions {
  signal?: AbortSignal | undefined;
  /** Milliseconds to wait for the first byte from the remote scp. `0` disables the check. */
  handshakeTimeout?: number;
}

/**
 * One `scp -t` or `scp -f` process on the server, reached through an SSH exec channel.
 */
export class ScpChannel {
  readonly reader: ByteReader;
  readonly #stream: ClientChannel;
  readonly #command: string;
  #stderr = '';
  #exitCode: number | null | undefined;
  #exitSignal: string | undefined;
  #closed = false;
  readonly #closedPromise: Promise<void>;
  #signal: AbortSignal | undefined;
  readonly #onAbort: () => void;
  #handshakeTimer: NodeJS.Timeout | undefined;
  #handshakeTimedOut = false;
  /** Set once the server sent something valid in SCP, until then garbage means "not SCP". */
  #spoke = false;
  readonly #handshakeTimeout: number;

  private constructor(stream: ClientChannel, command: string, options: ScpChannelOptions) {
    this.#stream = stream;
    this.#command = command;
    this.#signal = options.signal;
    this.#handshakeTimeout = options.handshakeTimeout ?? 0;
    this.reader = new ByteReader(stream);
    if (this.#handshakeTimeout > 0) {
      // A server that swallows the exec request (for example `ForceCommand internal-sftp`)
      // never answers the SCP handshake, so waiting for the first byte would hang forever.
      this.#handshakeTimer = setTimeout(() => {
        this.#handshakeTimedOut = true;
        stream.destroy();
      }, this.#handshakeTimeout);
      const answered = () => this.#clearHandshake();
      stream.once('data', answered);
      stream.stderr.once('data', answered);
      stream.once('close', answered);
    }
    stream.stderr.on('data', (chunk: Buffer) => {
      if (this.#stderr.length < 16 * 1024) this.#stderr += chunk.toString('utf8');
    });
    stream.on('exit', (code: number | null, signalName?: string) => {
      this.#exitCode = code;
      this.#exitSignal = signalName;
    });
    this.#closedPromise = new Promise<void>((resolve) => {
      stream.once('close', () => {
        this.#closed = true;
        resolve();
      });
    });
    this.#onAbort = () => stream.destroy();
    options.signal?.addEventListener('abort', this.#onAbort, { once: true });
  }

  #clearHandshake(): void {
    if (this.#handshakeTimer) clearTimeout(this.#handshakeTimer);
    this.#handshakeTimer = undefined;
  }

  static open(
    ssh: SshClient,
    command: string,
    options: ScpChannelOptions = {},
  ): Promise<ScpChannel> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(abortError(signal));
    return new Promise<ScpChannel>((resolve, reject) => {
      let settled = false;
      const settle = (): boolean => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        return true;
      };
      // The handshake timer only starts once the channel exists, so a server that never answers
      // the exec request is only escaped through the signal.
      const onAbort = () => {
        if (settle()) reject(abortError(signal!));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        ssh.exec(command, (err, stream) => {
          if (!settle()) {
            stream?.destroy();
            return;
          }
          if (err) {
            reject(
              new ScpError(
                ErrorCode.ScpUnavailable,
                `The server refused to run '${command}': ${err.message}`,
                { cause: err },
              ),
            );
            return;
          }
          resolve(new ScpChannel(stream, command, options));
        });
      } catch (err) {
        if (settle()) {
          reject(
            new ScpError(ErrorCode.NotConnected, 'The SSH connection is not usable', {
              cause: err,
            }),
          );
        }
      }
    });
  }

  write(data: string | Buffer): Promise<void> {
    if (this.#closed) return Promise.reject(this.#closedError());
    return new Promise<void>((resolve, reject) => {
      const onClose = () => {
        cleanup();
        reject(this.#closedError());
      };
      const onDrain = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.#stream.off('close', onClose);
        this.#stream.off('drain', onDrain);
      };
      this.#stream.once('close', onClose);
      if (this.#stream.write(data)) {
        cleanup();
        resolve();
      } else {
        this.#stream.once('drain', onDrain);
      }
    });
  }

  /** Reads one status byte and throws a mapped error for anything but OK. */
  async expectOk(context: string): Promise<void> {
    const status = await this.#readByteOrFail(context);
    if (status === 0) {
      this.#spoke = true;
      return;
    }
    if (status !== 1 && status !== 2 && !this.#spoke) {
      let rest = '';
      try {
        rest = await this.reader.readLine();
      } catch {}
      throw this.#notScp(String.fromCharCode(status) + rest);
    }
    await this.#throwStatus(status, context);
  }

  /** Parses a control record line. Before any valid SCP output, garbage means "not SCP". */
  parseRecord(line: string): ControlRecord {
    try {
      const record = parseRecord(line);
      this.#spoke = true;
      return record;
    } catch (err) {
      if (!this.#spoke) throw this.#notScp(line);
      throw err;
    }
  }

  #notScp(output: string): ScpError {
    const text = output.trim().slice(0, 200);
    return new ScpError(
      ErrorCode.ScpUnavailable,
      `'${this.#command}' did not answer in the SCP protocol, the server may only allow SFTP${text ? `: ${text}` : ''}`,
    );
  }

  /** Reads the first byte of the next record, `null` when the remote finished cleanly. */
  async nextByte(): Promise<number | null> {
    try {
      return await this.reader.readByte();
    } catch (err) {
      throw await this.failure('reading from the server', err);
    }
  }

  async readLine(context: string): Promise<string> {
    try {
      return await this.reader.readLine();
    } catch (err) {
      throw await this.failure(context, err);
    }
  }

  /** Throws the error that a non-zero status byte announces. */
  async #throwStatus(status: number, context: string): Promise<never> {
    if (status === 1 || status === 2) {
      let message = '';
      try {
        message = await this.reader.readLine();
      } catch {
        message = this.#stderr.trim();
      }
      message = message.replace(/^scp: /, '').trim() || `remote error while ${context}`;
      throw new ScpError(codeFromRemoteMessage(message), message);
    }
    throw new ScpError(
      ErrorCode.ScpProtocol,
      `Unexpected status byte 0x${status.toString(16)} while ${context}`,
    );
  }

  async throwStatus(status: number, context: string): Promise<never> {
    return this.#throwStatus(status, context);
  }

  async #readByteOrFail(context: string): Promise<number> {
    let value: number | null;
    try {
      value = await this.reader.readByte();
    } catch (err) {
      throw await this.failure(context, err);
    }
    if (value === null) throw await this.failure(context, new EndOfStreamError('channel closed'));
    return value;
  }

  /** Builds the most useful error for a channel that stopped unexpectedly. */
  async failure(context: string, cause: unknown): Promise<ScpError> {
    if (cause instanceof ScpError) return cause;
    if (this.#signal?.aborted) return abortError(this.#signal);
    if (this.#handshakeTimedOut) {
      return new ScpError(
        ErrorCode.ScpUnavailable,
        `'${this.#command}' did not answer within ${this.#handshakeTimeout} ms. The server may only allow SFTP.`,
        { cause },
      );
    }
    await this.#waitForClose();
    const stderr = this.#stderr.trim();
    if (
      this.#exitCode === 127 ||
      /(?:^|\s)scp: (?:command )?not found/im.test(stderr) ||
      /disable_scp|sftp connections only/i.test(stderr)
    ) {
      return new ScpError(
        ErrorCode.ScpUnavailable,
        `'${this.#command}' is not available on the server${stderr ? `: ${stderr}` : ''}`,
        { cause },
      );
    }
    const exit =
      this.#exitCode !== undefined && this.#exitCode !== null
        ? ` (exit code ${this.#exitCode})`
        : this.#exitSignal
          ? ` (signal ${this.#exitSignal})`
          : '';
    const detail = stderr || (cause instanceof Error ? cause.message : String(cause));
    return new ScpError(
      stderr ? codeFromRemoteMessage(stderr) : ErrorCode.ConnectionClosed,
      `SCP channel closed while ${context}${exit}: ${detail}`,
      { cause },
    );
  }

  /** Sends EOF and waits for the remote process to exit, checking its status. */
  async finish(context: string): Promise<void> {
    this.#stream.end();
    await this.#waitForClose();
    this.#detach();
    // Every record was acknowledged, so a remote that never closes the channel (some devices)
    // still counts as success, but its channel must not stay open.
    if (!this.#closed) this.#stream.destroy();
    if (this.#exitCode !== undefined && this.#exitCode !== null && this.#exitCode !== 0) {
      const stderr = this.#stderr.trim();
      throw new ScpError(
        stderr ? codeFromRemoteMessage(stderr) : ErrorCode.Remote,
        `Remote scp exited with code ${this.#exitCode} after ${context}${stderr ? `: ${stderr}` : ''}`,
      );
    }
  }

  destroy(): void {
    this.#detach();
    if (!this.#closed) this.#stream.destroy();
  }

  #detach(): void {
    this.#clearHandshake();
    this.#signal?.removeEventListener('abort', this.#onAbort);
    this.#signal = undefined;
  }

  #closedError(): ScpError {
    if (this.#signal?.aborted) return abortError(this.#signal);
    const stderr = this.#stderr.trim();
    return new ScpError(
      ErrorCode.ConnectionClosed,
      `SCP channel closed unexpectedly${stderr ? `: ${stderr}` : ''}`,
    );
  }

  async #waitForClose(): Promise<void> {
    if (this.#closed) return;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      this.#closedPromise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, EXIT_WAIT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }
}
