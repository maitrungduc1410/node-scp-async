import { chmod, open, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FileEntry, SFTPWrapper, TransferOptions as Ssh2TransferOptions } from 'ssh2';
import {
  ErrorCode,
  fromLocalError,
  fromSftpError,
  ScpError,
  sizeMismatch,
  throwIfAborted,
} from '../errors';
import { creationMode, isSafeReceivedName } from '../names';
import type { RemotePathApi } from '../remote-path';
import {
  applyLocalAttributes,
  ensureLocalDir,
  fileNode,
  flatten,
  type LocalFileNode,
  statLocal,
  totals,
  walkLocal,
} from '../transfer/local';
import { ProgressTracker } from '../transfer/progress';
import { runQueue, withAbort } from '../transfer/queue';
import type { Transport } from '../transport';
import type {
  EntryInfo,
  ReadFileOptions,
  TransferOptions,
  TransferResult,
  WriteFileOptions,
} from '../types';
import * as ops from './ops';

const DEFAULT_CONCURRENCY = 4;
const OWNER_WRITE = 0o200;

interface RemoteFile {
  rel: string;
  remote: string;
  local: string;
  size: number;
  mode: number;
  atime: number;
  mtime: number;
}

interface RemoteDir {
  rel: string;
  remote: string;
  local: string;
  mode: number;
  atime: number;
  mtime: number;
  parent: RemoteDir | undefined;
  /** Resolved path, used to detect symlinks that point back to an ancestor. */
  real?: string;
}

export class SftpTransport implements Transport {
  readonly protocol = 'sftp' as const;
  readonly #sftp: SFTPWrapper;
  readonly #paths: RemotePathApi;
  readonly #lost: Promise<never>;

  constructor(sftp: SFTPWrapper, paths: RemotePathApi) {
    this.#sftp = sftp;
    this.#paths = paths;
    this.#lost = new Promise<never>((_resolve, reject) => {
      sftp.once('close', () =>
        reject(
          new ScpError(ErrorCode.ConnectionClosed, 'The connection closed during the transfer'),
        ),
      );
    });
    this.#lost.catch(() => undefined);
  }

  upload(localPath: string, remotePath: string, options: TransferOptions): Promise<TransferResult> {
    return this.#unlessLost(this.#upload(localPath, remotePath, options));
  }

  download(
    remotePath: string,
    localPath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    return this.#unlessLost(this.#download(remotePath, localPath, options));
  }

  writeFile(
    remotePath: string,
    data: string | Uint8Array | Readable,
    options: WriteFileOptions,
  ): Promise<void> {
    return this.#unlessLost(this.#writeFile(remotePath, data, options));
  }

  readFile(remotePath: string, options: ReadFileOptions): Promise<Buffer> {
    return this.#unlessLost(this.#readFile(remotePath, options));
  }

  /**
   * ssh2 never calls back some operations, fastPut and fastGet among them, when the connection
   * drops in the middle: they wait for the reply to a close request sent on a dead channel.
   */
  #unlessLost<T>(operation: Promise<T>): Promise<T> {
    return Promise.race([operation, this.#lost]);
  }

  async #upload(
    localPath: string,
    remotePath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    const { signal } = options;
    throwIfAborted(signal);
    const st = await statLocal(localPath);

    if (st.isFile()) {
      const node = fileNode(localPath, basenameOf(localPath), basenameOf(localPath), st);
      const progress = new ProgressTracker(options.onProgress, node.size, 1);
      await withAbort(this.#putFile(node, remotePath, options, progress), signal);
      return { files: 1, directories: 0, bytes: node.size };
    }
    if (!st.isDirectory()) {
      throw new ScpError(ErrorCode.Local, `'${localPath}' is not a regular file or directory`, {
        path: localPath,
      });
    }
    if (!options.recursive) {
      throw new ScpError(
        ErrorCode.IsADirectory,
        `'${localPath}' is a directory, pass { recursive: true } to copy it`,
        { path: localPath },
      );
    }

    const root = await walkLocal(localPath, options.filter, signal);
    const sum = totals(root);
    const progress = new ProgressTracker(options.onProgress, sum.bytes, sum.files);
    const { dirs, files } = flatten(root);
    const remoteRoot = this.#paths.trimTrailing(remotePath);
    const remoteOf = (rel: string) =>
      rel === '' ? remoteRoot : this.#paths.join(remoteRoot, ...rel.split('/'));

    for (const dir of dirs) {
      throwIfAborted(signal);
      await this.#ensureRemoteDir(remoteOf(dir.rel), creationMode(dir.mode, options.preserve));
    }
    await runQueue(
      files,
      options.concurrency ?? DEFAULT_CONCURRENCY,
      (file) => this.#putFile(file, remoteOf(file.rel), options, progress),
      signal,
    );
    if (options.preserve) {
      for (const dir of [...dirs].reverse()) {
        await ops.setstat(this.#sftp, remoteOf(dir.rel), {
          mode: dir.mode,
          atime: dir.atime,
          mtime: dir.mtime,
        });
      }
    }
    return { files: sum.files, directories: sum.directories, bytes: sum.bytes };
  }

  async #download(
    remotePath: string,
    localPath: string,
    options: TransferOptions,
  ): Promise<TransferResult> {
    const { signal } = options;
    throwIfAborted(signal);
    const st = await ops.stat(this.#sftp, remotePath);

    if (st.isFile()) {
      const file: RemoteFile = {
        rel: this.#paths.basename(remotePath),
        remote: remotePath,
        local: localPath,
        size: st.size,
        mode: st.mode & 0o7777,
        atime: st.atime,
        mtime: st.mtime,
      };
      await ensureLocalDir(dirname(localPath));
      const progress = new ProgressTracker(options.onProgress, file.size, 1);
      await withAbort(this.#getFile(file, options, progress), signal);
      return { files: 1, directories: 0, bytes: file.size };
    }
    if (!st.isDirectory()) {
      throw new ScpError(ErrorCode.Remote, `'${remotePath}' is not a regular file or directory`, {
        path: remotePath,
      });
    }
    if (!options.recursive) {
      throw new ScpError(
        ErrorCode.IsADirectory,
        `'${remotePath}' is a directory, pass { recursive: true } to copy it`,
        { path: remotePath },
      );
    }

    const root: RemoteDir = {
      rel: '',
      remote: this.#paths.trimTrailing(remotePath),
      local: localPath,
      mode: st.mode & 0o7777,
      atime: st.atime,
      mtime: st.mtime,
      parent: undefined,
    };
    const dirs: RemoteDir[] = [root];
    const files: RemoteFile[] = [];
    for (let i = 0; i < dirs.length; i++) {
      throwIfAborted(signal);
      const dir = dirs[i]!;
      const real = await ops.realpath(this.#sftp, dir.remote).catch(() => dir.remote);
      for (let ancestor = dir.parent; ancestor; ancestor = ancestor.parent) {
        if (ancestor.real === real) {
          throw new ScpError(ErrorCode.Remote, `Symlink loop detected at '${dir.remote}'`, {
            path: dir.remote,
          });
        }
      }
      dir.real = real;
      const entries = await ops.readdir(this.#sftp, dir.remote);
      entries.sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0));
      for (const entry of entries) {
        if (entry.filename === '.' || entry.filename === '..') continue;
        const found = await this.#describe(dir, entry);
        if (!found) continue;
        const info: EntryInfo = {
          type: found.kind === 'dir' ? 'directory' : 'file',
          size: found.kind === 'dir' ? 0 : found.item.size,
          mode: found.item.mode,
        };
        if (options.filter && !options.filter(found.item.rel, info)) continue;
        if (found.kind === 'dir') dirs.push(found.item);
        else files.push(found.item);
      }
    }

    const bytes = files.reduce((n, f) => n + f.size, 0);
    const progress = new ProgressTracker(options.onProgress, bytes, files.length);
    for (const dir of dirs) await ensureLocalDir(dir.local);
    await runQueue(
      files,
      options.concurrency ?? DEFAULT_CONCURRENCY,
      (file) => this.#getFile(file, options, progress),
      signal,
    );
    if (options.preserve) {
      for (const dir of [...dirs].reverse()) await applyLocalAttributes(dir.local, dir);
    }
    return { files: files.length, directories: dirs.length, bytes };
  }

  async #writeFile(
    remotePath: string,
    data: string | Uint8Array | Readable,
    options: WriteFileOptions,
  ): Promise<void> {
    throwIfAborted(options.signal);
    const mode = options.mode ?? 0o644;
    if (typeof data === 'string' || data instanceof Uint8Array) {
      await withAbort(
        ops.writeFile(this.#sftp, remotePath, Buffer.from(data), mode),
        options.signal,
      );
      return;
    }
    const { size } = options;
    // Same contract as SCP, which has to announce the size up front.
    async function* checked(source: AsyncIterable<unknown>) {
      let seen = 0;
      for await (const raw of source) {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as Uint8Array);
        seen += chunk.length;
        if (size !== undefined && seen > size) throw sizeMismatch(seen, size);
        yield chunk;
      }
      if (size !== undefined && seen !== size) throw sizeMismatch(seen, size);
    }
    try {
      await pipeline(
        data,
        checked,
        this.#sftp.createWriteStream(remotePath, { mode }),
        options.signal ? { signal: options.signal } : {},
      );
    } catch (err) {
      throwIfAborted(options.signal);
      throw fromSftpError(err, 'writeFile', remotePath);
    }
  }

  async #readFile(remotePath: string, options: ReadFileOptions): Promise<Buffer> {
    throwIfAborted(options.signal);
    return withAbort(ops.readFile(this.#sftp, remotePath), options.signal);
  }

  async #describe(
    parent: RemoteDir,
    entry: FileEntry,
  ): Promise<{ kind: 'dir'; item: RemoteDir } | { kind: 'file'; item: RemoteFile } | undefined> {
    if (!isSafeReceivedName(entry.filename)) {
      throw new ScpError(
        ErrorCode.Remote,
        `Server listed an unsafe file name ${JSON.stringify(entry.filename)} in '${parent.remote}'`,
        { path: parent.remote },
      );
    }
    const remote = this.#paths.join(parent.remote, entry.filename);
    const rel = parent.rel === '' ? entry.filename : `${parent.rel}/${entry.filename}`;
    const local = join(parent.local, entry.filename);
    let attrs = entry.attrs;
    let type = ops.typeFromMode(attrs.mode, entry.longname);
    if (type === 'symlink') {
      try {
        attrs = await ops.stat(this.#sftp, remote);
      } catch {
        return undefined;
      }
      type = ops.typeFromMode(attrs.mode);
    }
    const base = {
      rel,
      remote,
      local,
      mode: (attrs.mode ?? 0) & 0o7777,
      atime: attrs.atime ?? 0,
      mtime: attrs.mtime ?? 0,
    };
    if (type === 'directory') return { kind: 'dir', item: { ...base, parent } };
    if (type === 'file') return { kind: 'file', item: { ...base, size: attrs.size ?? 0 } };
    return undefined;
  }

  async #ensureRemoteDir(remote: string, mode: number): Promise<void> {
    try {
      await ops.mkdir(this.#sftp, remote, { mode });
      return;
    } catch (mkdirError) {
      let st: Awaited<ReturnType<typeof ops.stat>>;
      try {
        st = await ops.stat(this.#sftp, remote);
      } catch {
        throw mkdirError;
      }
      if (!st.isDirectory()) {
        throw new ScpError(ErrorCode.NotADirectory, `'${remote}' exists and is not a directory`, {
          path: remote,
        });
      }
    }
  }

  async #putFile(
    file: LocalFileNode,
    remote: string,
    options: TransferOptions,
    progress: ProgressTracker,
  ): Promise<void> {
    const transfer: Ssh2TransferOptions = {
      step: (transferred) => progress.update(file.rel, transferred, file.size),
    };
    if (options.preserve) {
      transfer.mode = file.mode;
      return this.#fastPut(file, remote, transfer, options, progress);
    }
    // fastPut can only chmod after opening, which would also change existing files and ignore
    // the server umask. Creating the file first gives new files the source permissions the way
    // `scp` and `sftp put` do. fastPut opens the file again, so it has to stay writable until
    // the data is in.
    const mode = creationMode(file.mode, false);
    const created = await ops.createNewFile(this.#sftp, remote, mode | OWNER_WRITE);
    await this.#fastPut(file, remote, transfer, options, progress);
    if (created && !(mode & OWNER_WRITE)) {
      const { mode: current } = await ops.stat(this.#sftp, remote);
      await ops.setstat(this.#sftp, remote, { mode: current & 0o7777 & ~OWNER_WRITE });
    }
  }

  #fastPut(
    file: LocalFileNode,
    remote: string,
    transfer: Ssh2TransferOptions,
    options: TransferOptions,
    progress: ProgressTracker,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#sftp.fastPut(file.abs, remote, transfer, (err) => {
        if (err) {
          reject(fromSftpError(err, 'upload', remote));
          return;
        }
        const finish = () => {
          progress.complete(file.rel, file.size);
          resolve();
        };
        if (!options.preserve) {
          finish();
          return;
        }
        ops
          .setstat(this.#sftp, remote, { mode: file.mode, atime: file.atime, mtime: file.mtime })
          .then(finish, reject);
      });
    });
  }

  async #getFile(
    file: RemoteFile,
    options: TransferOptions,
    progress: ProgressTracker,
  ): Promise<void> {
    // Same approach as #putFile: fastGet opens the file again, so it starts out writable.
    const mode = creationMode(file.mode, false);
    let created = false;
    if (!options.preserve) {
      try {
        await (await open(file.local, 'wx', mode | OWNER_WRITE)).close();
        created = true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw fromLocalError(err, 'create', file.local);
        }
      }
    }
    await this.#fastGet(file, options, progress);
    if (created && !(mode & OWNER_WRITE)) {
      try {
        await chmod(file.local, (await stat(file.local)).mode & 0o7777 & ~OWNER_WRITE);
      } catch (err) {
        throw fromLocalError(err, 'set the mode of', file.local);
      }
    }
  }

  #fastGet(file: RemoteFile, options: TransferOptions, progress: ProgressTracker): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#sftp.fastGet(
        file.remote,
        file.local,
        { step: (transferred) => progress.update(file.rel, transferred, file.size) },
        (err) => {
          if (err) {
            reject(fromSftpError(err, 'download', file.remote));
            return;
          }
          const finish = () => {
            progress.complete(file.rel, file.size);
            resolve();
          };
          if (!options.preserve) {
            finish();
            return;
          }
          applyLocalAttributes(file.local, file).then(finish, reject);
        },
      );
    });
  }
}

function basenameOf(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
