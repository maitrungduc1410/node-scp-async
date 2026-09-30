import { createReadStream, createWriteStream } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import type { Client as SshClient } from 'ssh2';
import {
  abortError,
  ErrorCode,
  fromLocalError,
  isScpError,
  ScpError,
  sizeMismatch,
  throwIfAborted,
} from '../errors';
import { creationMode } from '../names';
import type { RemotePathApi } from '../remote-path';
import { quoteArg } from '../shell';
import {
  applyLocalAttributes,
  ensureLocalDir,
  fileNode,
  type LocalDirNode,
  type LocalFileNode,
  statLocal,
  totals,
  walkLocal,
} from '../transfer/local';
import { ProgressTracker } from '../transfer/progress';
import type { Transport } from '../transport';
import type { ReadFileOptions, TransferOptions, TransferResult, WriteFileOptions } from '../types';
import { ScpChannel } from './channel';
import {
  assertSafeReceivedName,
  type ControlRecord,
  END_DIRECTORY,
  encodeDirectory,
  encodeFile,
  encodeTimes,
} from './protocol';

const ZERO = Buffer.from([0]);

export interface ScpTransportOptions {
  scpCommand: string;
  paths: RemotePathApi;
  /** Milliseconds the remote scp may take to answer at all before it counts as unavailable. */
  handshakeTimeout: number;
}

/**
 * Transfers files with the classic SCP protocol by running `scp -t` (sink) or `scp -f`
 * (source) on the server. Needs nothing but an exec channel and an `scp` binary, which is what
 * Dropbear, BusyBox based firmware and many network devices offer.
 */
export class ScpTransport implements Transport {
  readonly protocol = 'scp' as const;
  readonly #ssh: SshClient;
  readonly #scp: string;
  readonly #paths: RemotePathApi;
  readonly #handshakeTimeout: number;

  constructor(ssh: SshClient, options: ScpTransportOptions) {
    this.#ssh = ssh;
    this.#scp = options.scpCommand;
    this.#paths = options.paths;
    this.#handshakeTimeout = options.handshakeTimeout;
  }

  async upload(
    localPath: string,
    remotePath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    const { signal } = options;
    throwIfAborted(signal);
    const st = await statLocal(localPath);
    const isDir = st.isDirectory();
    if (!isDir && !st.isFile()) {
      throw new ScpError(ErrorCode.Local, `'${localPath}' is not a regular file or directory`, {
        path: localPath,
      });
    }
    if (isDir && !options.recursive) {
      throw new ScpError(
        ErrorCode.IsADirectory,
        `'${localPath}' is a directory, pass { recursive: true } to copy it`,
        { path: localPath },
      );
    }
    const { parent, name } = this.#split(remotePath);
    const root: LocalDirNode | LocalFileNode = isDir
      ? await walkLocal(localPath, options.filter, signal)
      : fileNode(localPath, name, name, st);
    const sum = totals(root);
    const progress = new ProgressTracker(options.onProgress, sum.bytes, sum.files);

    const channel = await this.#openSink(parent, isDir, options.preserve ?? false, signal);
    try {
      await channel.expectOk('starting the upload');
      if (root.kind === 'dir') await this.#sendDirectory(channel, root, name, options, progress);
      else await this.#sendFile(channel, root, name, options, progress);
      await channel.finish('the upload');
    } catch (err) {
      channel.destroy();
      throw signal?.aborted ? abortError(signal) : err;
    }
    return { files: sum.files, directories: sum.directories, bytes: sum.bytes };
  }

  async download(
    remotePath: string,
    localPath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    const { signal } = options;
    throwIfAborted(signal);
    const flags = ['-f'];
    if (options.recursive) flags.push('-r');
    if (options.preserve) flags.push('-p');
    const channel = await this.#open(flags, remotePath, signal);
    const progress = new ProgressTracker(options.onProgress, undefined, undefined);
    const result: TransferResult = { files: 0, directories: 0, bytes: 0 };
    try {
      await this.#receive(channel, localPath, options, progress, result);
      await channel.finish('the download');
    } catch (err) {
      channel.destroy();
      if (signal?.aborted) throw abortError(signal);
      throw isScpError(err) ? err : await channel.failure('downloading', err);
    }
    return result;
  }

  async writeFile(
    remotePath: string,
    data: string | Uint8Array | Readable,
    options: WriteFileOptions,
  ): Promise<void> {
    const { signal } = options;
    throwIfAborted(signal);
    let body: Buffer | Readable;
    let size: number;
    if (typeof data === 'string' || data instanceof Uint8Array) {
      body = Buffer.from(data);
      size = body.length;
    } else if (options.size !== undefined) {
      body = data;
      size = options.size;
    } else {
      const chunks: Buffer[] = [];
      try {
        for await (const chunk of data) chunks.push(Buffer.from(chunk as Uint8Array));
      } catch (err) {
        throwIfAborted(signal);
        throw fromLocalError(err, 'read the source of', remotePath);
      }
      body = Buffer.concat(chunks);
      size = body.length;
    }
    const { parent, name } = this.#split(remotePath);
    const channel = await this.#openSink(parent, false, false, signal);
    try {
      await channel.expectOk('starting the upload');
      await channel.write(encodeFile(options.mode ?? 0o644, size, name));
      await channel.expectOk(`creating '${remotePath}'`);
      const source = Buffer.isBuffer(body) ? Readable.from([body]) : body;
      const sent = await this.#pump(channel, source, size, () => {}, true);
      if (sent !== size) throw sizeMismatch(sent, size);
      await channel.write(ZERO);
      await channel.expectOk(`writing '${remotePath}'`);
      await channel.finish('the upload');
    } catch (err) {
      channel.destroy();
      throw signal?.aborted ? abortError(signal) : err;
    }
  }

  async readFile(remotePath: string, options: ReadFileOptions): Promise<Buffer> {
    const { signal } = options;
    throwIfAborted(signal);
    const channel = await this.#open(['-f'], remotePath, signal);
    try {
      await channel.write(ZERO);
      let first = await channel.nextByte();
      while (first === 0x54 /* T */) {
        channel.parseRecord(`T${await channel.readLine('reading times')}`);
        await channel.write(ZERO);
        first = await channel.nextByte();
      }
      if (first === null) throw await channel.failure('waiting for the file', 'no data');
      if (first !== 0x43 /* C */) {
        if (first === 1 || first === 2) await channel.throwStatus(first, `reading '${remotePath}'`);
        throw new ScpError(ErrorCode.ScpProtocol, `Expected a file record for '${remotePath}'`);
      }
      const record = channel.parseRecord(`C${await channel.readLine('reading the file header')}`);
      if (record.type !== 'C') throw new ScpError(ErrorCode.ScpProtocol, 'Expected a file record');
      await channel.write(ZERO);
      const chunks: Buffer[] = [];
      for await (const chunk of channel.reader.readExactly(record.size)) chunks.push(chunk);
      await channel.expectOk(`reading '${remotePath}'`);
      await channel.write(ZERO);
      await channel.finish('the download');
      return Buffer.concat(chunks, record.size);
    } catch (err) {
      channel.destroy();
      if (signal?.aborted) throw abortError(signal);
      throw isScpError(err) ? err : await channel.failure(`reading '${remotePath}'`, err);
    }
  }

  /** Splits an exact destination into the directory the sink runs in and the name to create. */
  #split(remotePath: string): { parent: string; name: string } {
    const trimmed = this.#paths.trimTrailing(remotePath);
    const name = this.#paths.basename(trimmed);
    if (name === '' || name === '.' || name === '..' || trimmed === this.#paths.dirname(trimmed)) {
      throw new ScpError(
        ErrorCode.InvalidArgument,
        `'${remotePath}' must name the file or directory to create, not a root or '.'`,
        { path: remotePath },
      );
    }
    return { parent: this.#paths.dirname(trimmed), name };
  }

  #openSink(
    parent: string,
    recursive: boolean,
    preserve: boolean,
    signal: AbortSignal | undefined,
  ): Promise<ScpChannel> {
    // -d makes the sink insist that `parent` is a directory, so a missing parent fails instead
    // of silently creating a file named like the parent.
    const flags = ['-t', '-d'];
    if (recursive) flags.push('-r');
    if (preserve) flags.push('-p');
    return this.#open(flags, parent, signal);
  }

  #open(flags: string[], path: string, signal: AbortSignal | undefined): Promise<ScpChannel> {
    // Like OpenSSH, only add `--` when needed: minimal SCP servers on network devices may not
    // understand it.
    const separator = path.startsWith('-') ? '-- ' : '';
    const command = `${this.#scp} ${flags.join(' ')} ${separator}${quoteArg(path, this.#paths.os)}`;
    return ScpChannel.open(this.#ssh, command, {
      signal,
      handshakeTimeout: this.#handshakeTimeout,
    });
  }

  async #sendTimes(channel: ScpChannel, mtime: number, atime: number, what: string) {
    await channel.write(encodeTimes(mtime, atime));
    await channel.expectOk(`setting times of ${what}`);
  }

  async #sendFile(
    channel: ScpChannel,
    file: LocalFileNode,
    name: string,
    options: TransferOptions,
    progress: ProgressTracker,
  ): Promise<void> {
    throwIfAborted(options.signal);
    if (options.preserve) await this.#sendTimes(channel, file.mtime, file.atime, `'${file.rel}'`);
    await channel.write(encodeFile(creationMode(file.mode, options.preserve), file.size, name));
    await channel.expectOk(`creating '${file.rel}'`);
    progress.update(file.rel, 0, file.size);
    let sent = 0;
    if (file.size > 0) {
      let stream: Readable;
      try {
        stream = createReadStream(file.abs, { start: 0, end: file.size - 1 });
      } catch (err) {
        throw fromLocalError(err, 'read', file.abs);
      }
      sent = await this.#pump(channel, stream, file.size, (n) =>
        progress.update(file.rel, n, file.size),
      );
    }
    if (sent !== file.size) {
      throw new ScpError(ErrorCode.Local, `'${file.abs}' changed size during the upload`, {
        path: file.abs,
      });
    }
    await channel.write(ZERO);
    await channel.expectOk(`writing '${file.rel}'`);
    progress.complete(file.rel, file.size);
  }

  async #sendDirectory(
    channel: ScpChannel,
    dir: LocalDirNode,
    name: string,
    options: TransferOptions,
    progress: ProgressTracker,
  ): Promise<void> {
    throwIfAborted(options.signal);
    const label = dir.rel === '' ? `'${name}'` : `'${dir.rel}'`;
    if (options.preserve) await this.#sendTimes(channel, dir.mtime, dir.atime, label);
    await channel.write(encodeDirectory(creationMode(dir.mode, options.preserve), name));
    await channel.expectOk(`creating directory ${label}`);
    progress.directories++;
    for (const child of dir.children) {
      if (child.kind === 'dir')
        await this.#sendDirectory(channel, child, child.name, options, progress);
      else await this.#sendFile(channel, child, child.name, options, progress);
    }
    await channel.write(END_DIRECTORY);
    await channel.expectOk(`finishing directory ${label}`);
  }

  /**
   * Copies at most `size` bytes from `source` into the channel, returns bytes copied. A file
   * that grew since it was stat'ed is cut at `size`, like OpenSSH does; with `exact` a longer
   * source is an error, because the caller declared its size.
   */
  async #pump(
    channel: ScpChannel,
    source: Readable,
    size: number,
    onBytes: (sent: number) => void,
    exact = false,
  ): Promise<number> {
    let sent = 0;
    try {
      for await (const raw of source) {
        let chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
        if (sent + chunk.length > size) {
          if (exact) throw sizeMismatch(sent + chunk.length, size);
          chunk = chunk.subarray(0, size - sent);
        }
        if (chunk.length > 0) {
          await channel.write(chunk);
          sent += chunk.length;
          onBytes(sent);
        }
        if (sent >= size && !exact) break;
      }
    } catch (err) {
      if (isScpError(err)) throw err;
      throw fromLocalError(err, 'read', undefined);
    } finally {
      source.destroy();
    }
    return sent;
  }

  async #receive(
    channel: ScpChannel,
    localRoot: string,
    options: TransferOptions,
    progress: ProgressTracker,
    result: TransferResult,
  ): Promise<void> {
    interface Frame {
      local: string;
      rel: string;
      skip: boolean;
      times?: { mtime: number; atime: number } | undefined;
      mode: number;
    }
    const stack: Frame[] = [];
    let pendingTimes: { mtime: number; atime: number } | undefined;
    let seenTopLevel = false;

    await channel.write(ZERO);
    for (;;) {
      const first = await channel.nextByte();
      if (first === null) {
        if (!seenTopLevel || stack.length > 0) {
          throw await channel.failure('waiting for data', 'the server sent nothing');
        }
        return;
      }
      if (first === 1 || first === 2) await channel.throwStatus(first, 'downloading');
      const line = String.fromCharCode(first) + (await channel.readLine('reading a record'));
      const record: ControlRecord = channel.parseRecord(line);
      const parent = stack[stack.length - 1];
      const topLevel = parent === undefined;
      if (topLevel && seenTopLevel && record.type !== 'T') {
        throw new ScpError(ErrorCode.ScpProtocol, 'Server sent more than one top level entry');
      }
      const locate = (name: string) => {
        if (parent === undefined) {
          // The top level entry is written to localRoot, so its name only has to be one that
          // `scp -f` can send: a basename, or `.` for a download of `host:.`.
          if (name !== '.') assertSafeReceivedName(name, 'linux');
          return { rel: '', local: localRoot };
        }
        assertSafeReceivedName(name);
        return {
          rel: parent.rel === '' ? name : `${parent.rel}/${name}`,
          local: join(parent.local, name),
        };
      };

      switch (record.type) {
        case 'T': {
          pendingTimes = { mtime: record.mtime, atime: record.atime };
          await channel.write(ZERO);
          break;
        }
        case 'D': {
          if (!options.recursive) {
            throw new ScpError(ErrorCode.ScpProtocol, 'Server sent a directory without -r');
          }
          const { rel, local } = locate(record.name);
          const skip =
            (parent?.skip ?? false) ||
            (!topLevel &&
              options.filter !== undefined &&
              !options.filter(rel, { type: 'directory', size: 0, mode: record.mode }));
          if (!skip) {
            await ensureLocalDir(local);
            progress.directories++;
            result.directories++;
          }
          stack.push({ local, rel, skip, times: pendingTimes, mode: record.mode });
          pendingTimes = undefined;
          seenTopLevel = true;
          await channel.write(ZERO);
          break;
        }
        case 'E': {
          const frame = stack.pop();
          if (!frame) throw new ScpError(ErrorCode.ScpProtocol, 'Unbalanced end of directory');
          if (!frame.skip && options.preserve) {
            await applyLocalAttributes(frame.local, { mode: frame.mode, ...frame.times });
          }
          await channel.write(ZERO);
          break;
        }
        case 'C': {
          const located = locate(record.name);
          const rel = topLevel ? record.name : located.rel;
          const local = located.local;
          const skip =
            (parent?.skip ?? false) ||
            (!topLevel &&
              options.filter !== undefined &&
              !options.filter(rel, { type: 'file', size: record.size, mode: record.mode }));
          const times = pendingTimes;
          pendingTimes = undefined;
          seenTopLevel = true;
          await channel.write(ZERO);
          if (skip) {
            for await (const _ of channel.reader.readExactly(record.size)) {
              // discard
            }
          } else {
            if (topLevel) await ensureLocalDir(dirname(local));
            await this.#receiveFile(
              channel,
              local,
              rel,
              record.size,
              creationMode(record.mode, options.preserve),
              progress,
            );
          }
          await channel.expectOk(`receiving '${rel}'`);
          await channel.write(ZERO);
          if (!skip) {
            if (options.preserve)
              await applyLocalAttributes(local, { mode: record.mode, ...times });
            progress.complete(rel, record.size);
            result.files++;
            result.bytes += record.size;
          }
          break;
        }
      }
    }
  }

  async #receiveFile(
    channel: ScpChannel,
    local: string,
    rel: string,
    size: number,
    mode: number,
    progress: ProgressTracker,
  ): Promise<void> {
    let handle: FileHandle;
    try {
      handle = await open(local, 'w', mode);
    } catch (err) {
      throw fromLocalError(err, 'create', local);
    }
    const out = createWriteStream(local, { fd: handle, autoClose: true });
    const failed = new Promise<never>((_, reject) => {
      out.once('error', (err) => reject(fromLocalError(err, 'write', local)));
    });
    failed.catch(() => {});
    let received = 0;
    progress.update(rel, 0, size);
    try {
      for await (const chunk of channel.reader.readExactly(size)) {
        received += chunk.length;
        if (!out.write(chunk)) {
          await Promise.race([new Promise<void>((r) => out.once('drain', () => r())), failed]);
        }
        progress.update(rel, received, size);
      }
      const closed = new Promise<void>((r) => out.once('close', () => r()));
      out.end();
      await Promise.race([closed, failed]);
    } catch (err) {
      out.destroy();
      if (isScpError(err)) throw err;
      throw await channel.failure(`receiving '${rel}'`, err);
    }
  }
}
