import type { Attributes, SFTPWrapper } from 'ssh2';
import { ErrorCode, isScpError, ScpError } from '../errors';
import type { RemotePathApi } from '../remote-path';
import type { EntryType } from '../types';
import * as ops from './ops';

/** Details of a remote entry, as returned by {@link RemoteFs.stat}. */
export interface RemoteStats {
  type: EntryType;
  /** Size in bytes. */
  size: number;
  /** Permission bits, for example `0o755`. */
  mode: number;
  /** Numeric user id of the owner. */
  uid: number;
  /** Numeric group id. */
  gid: number;
  /** Last access time. */
  atime: Date;
  /** Last modification time. */
  mtime: Date;
}

/** One entry of {@link RemoteFs.list}. Symlinks are described themselves, not their targets. */
export interface RemoteEntry extends RemoteStats {
  /** File name inside the listed directory. */
  name: string;
}

/** Options for {@link RemoteFs.mkdir}. */
export interface MkdirOptions {
  /** Create missing parents and succeed if the directory already exists, like `mkdir -p`. */
  recursive?: boolean;
  /** Permissions for the new directories, reduced by the server's umask. */
  mode?: number;
}

/** Options for {@link RemoteFs.rm}. */
export interface RmOptions {
  /** Remove directories and their contents. */
  recursive?: boolean;
  /** Do not fail when the path does not exist. */
  force?: boolean;
}

export function toRemoteStats(attrs: Attributes, longname?: string): RemoteStats {
  return {
    type: ops.typeFromMode(attrs.mode, longname),
    size: attrs.size ?? 0,
    mode: (attrs.mode ?? 0) & 0o7777,
    uid: attrs.uid ?? 0,
    gid: attrs.gid ?? 0,
    atime: new Date((attrs.atime ?? 0) * 1000),
    mtime: new Date((attrs.mtime ?? 0) * 1000),
  };
}

/**
 * Filesystem operations on the remote host. Only available when the connection uses SFTP,
 * because the SCP protocol has no way to list, stat, rename or delete.
 */
export class RemoteFs {
  readonly #sftp: SFTPWrapper;
  readonly #paths: RemotePathApi;

  /** @internal */
  constructor(sftp: SFTPWrapper, paths: RemotePathApi) {
    this.#sftp = sftp;
    this.#paths = paths;
  }

  /**
   * Returns the entry type, or `false` when nothing exists at `path`. Symlinks are followed, so
   * `'symlink'` means a link whose target is missing. Other errors throw.
   */
  async exists(path: string): Promise<EntryType | false> {
    try {
      return (await this.stat(path)).type;
    } catch (err) {
      if (!isScpError(err, ErrorCode.NotFound)) throw err;
    }
    try {
      await ops.lstat(this.#sftp, path);
      return 'symlink';
    } catch (err) {
      if (isScpError(err, ErrorCode.NotFound)) return false;
      throw err;
    }
  }

  /** Stats `path`, following symlinks. */
  async stat(path: string): Promise<RemoteStats> {
    return toRemoteStats(await ops.stat(this.#sftp, path));
  }

  /** Stats `path` without following a final symlink. */
  async lstat(path: string): Promise<RemoteStats> {
    return toRemoteStats(await ops.lstat(this.#sftp, path));
  }

  /** Lists a directory, without `.` and `..`, sorted by name. */
  async list(path: string): Promise<RemoteEntry[]> {
    const entries = await ops.readdir(this.#sftp, path);
    return entries
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((e) => ({ name: e.filename, ...toRemoteStats(e.attrs, e.longname) }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Creates a directory. With `recursive`, creates missing parents too, like `mkdir -p`. */
  async mkdir(path: string, options: MkdirOptions = {}): Promise<void> {
    const attrs = options.mode === undefined ? {} : { mode: options.mode };
    if (!options.recursive) {
      await ops.mkdir(this.#sftp, path, attrs);
      return;
    }
    const target = this.#paths.trimTrailing(path);
    const missing: string[] = [];
    let current = target;
    for (;;) {
      const type = await this.exists(current);
      if (type === 'directory') break;
      if (type !== false) {
        throw new ScpError(ErrorCode.NotADirectory, `'${current}' exists and is not a directory`, {
          path: current,
        });
      }
      missing.push(current);
      const parent = this.#paths.dirname(current);
      if (parent === current || parent === '.' || parent === '') break;
      current = parent;
    }
    for (const dir of missing.reverse()) {
      try {
        await ops.mkdir(this.#sftp, dir, attrs);
      } catch (err) {
        if ((await this.exists(dir)) !== 'directory') throw err;
      }
    }
  }

  /** Deletes a file or symlink, or with `recursive` a directory and everything in it. */
  async rm(path: string, options: RmOptions = {}): Promise<void> {
    let st: RemoteStats;
    try {
      st = await this.lstat(path);
    } catch (err) {
      if (options.force && isScpError(err, ErrorCode.NotFound)) return;
      throw err;
    }
    if (st.type !== 'directory') {
      await ops.unlink(this.#sftp, path);
      return;
    }
    if (!options.recursive) {
      throw new ScpError(
        ErrorCode.IsADirectory,
        `'${path}' is a directory, pass { recursive: true } to remove it`,
        { path },
      );
    }
    for (const entry of await this.list(path)) {
      await this.rm(this.#paths.join(path, entry.name), { recursive: true });
    }
    await ops.rmdir(this.#sftp, path);
  }

  /** Moves or renames `from` to `to`. */
  async rename(from: string, to: string): Promise<void> {
    await ops.rename(this.#sftp, from, to);
  }

  /** Resolves `path` to an absolute path on the server, for example `.` to the home directory. */
  async realpath(path: string): Promise<string> {
    return ops.realpath(this.#sftp, path);
  }
}
