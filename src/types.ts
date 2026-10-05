import type { ConnectConfig, Client as SshClient } from 'ssh2';
import type { RemoteOs } from './remote-path';

/**
 * Which wire protocol to use for transfers.
 *
 * - `sftp`: SFTP subsystem only. Fails with `ERR_SFTP_UNAVAILABLE` when the server has none.
 * - `scp`: the classic SCP protocol over an exec channel (`scp -t` / `scp -f`).
 * - `auto` (default): SFTP when available, otherwise SCP.
 */
export type Protocol = 'auto' | 'sftp' | 'scp';

/** The protocol a connected client actually uses. */
export type ActiveProtocol = Exclude<Protocol, 'auto'>;

/** Options for {@link connect}: every ssh2 connect option plus the ones node-scp adds. */
export interface ConnectOptions extends ConnectConfig {
  /** Transfer protocol. Defaults to `auto`. */
  protocol?: Protocol;
  /** Path flavour and shell quoting rules of the remote host. Defaults to `posix`. */
  remoteOs?: RemoteOs;
  /** Remote command used for SCP transfers. Defaults to `scp`. */
  scpCommand?: string;
  /** Aborts the connection attempt. */
  signal?: AbortSignal;
  /**
   * Disables Nagle's algorithm on the TCP socket. SCP and SFTP wait for a reply after small
   * messages, so leaving Nagle on makes many small files up to 25 times slower. Defaults to `true`.
   */
  noDelay?: boolean;
  /**
   * Called with the underlying ssh2 client before connecting. Use it to attach listeners that
   * must exist before authentication, for example `keyboard-interactive` or `banner`.
   */
  beforeConnect?: (ssh: SshClient) => void;
}

/** Kind of a filesystem entry. */
export type EntryType = 'file' | 'directory' | 'symlink' | 'other';

/** What a {@link TransferOptions.filter} receives about an entry. */
export interface EntryInfo {
  /** `'file'` or `'directory'`: transfers follow symlinks and skip other kinds of entries. */
  type: EntryType;
  /** Size in bytes, `0` for directories. */
  size: number;
  /** Permission bits, for example `0o644`. */
  mode: number;
}

/** What {@link TransferOptions.onProgress} receives while bytes move. */
export interface TransferProgress {
  /** Path of the file currently moving, relative to the transfer root, using `/`. */
  path: string;
  /** Bytes of the current file transferred so far. */
  fileTransferred: number;
  /** Size of the current file in bytes. */
  fileSize: number;
  /** Bytes transferred in the whole operation so far. */
  transferred: number;
  /** Total bytes of the operation, when known up front. SCP downloads do not know it. */
  total: number | undefined;
  /** Files finished so far. */
  filesCompleted: number;
  /** Total number of files, when known up front. */
  filesTotal: number | undefined;
}

/** Options for {@link ScpClient.upload} and {@link ScpClient.download}. */
export interface TransferOptions {
  /** Required to copy directories, like `scp -r`. */
  recursive?: boolean;
  /**
   * Keep modification and access times and the full mode, including setuid, setgid and sticky
   * bits, also on files that already exist, like `scp -p`. Without it new files still get the
   * source's permission bits, reduced by the umask, and existing files keep their mode.
   */
  preserve?: boolean;
  /**
   * Maximum files transferred in parallel for directory copies. SFTP only, SCP streams one file
   * at a time over a single channel. Defaults to 4.
   */
  concurrency?: number;
  /**
   * Decides whether an entry is copied. `path` is relative to the transfer root and uses `/`.
   * Returning `false` for a directory skips the whole subtree. Symlinks are followed and other
   * entries such as sockets are skipped, so the filter only sees files and directories.
   */
  filter?: (path: string, entry: EntryInfo) => boolean;
  /** Called whenever bytes move. */
  onProgress?: (progress: TransferProgress) => void;
  /** Cancels the transfer. Files already in flight over SFTP finish in the background. */
  signal?: AbortSignal;
}

/** What {@link ScpClient.upload} and {@link ScpClient.download} resolve to. */
export interface TransferResult {
  /** Number of files copied. */
  files: number;
  /** Number of directories created or entered. */
  directories: number;
  /** Number of bytes copied. */
  bytes: number;
}

/** Options for {@link ScpClient.writeFile}. */
export interface WriteFileOptions {
  /** File mode for newly created files. Defaults to `0o644`. */
  mode?: number;
  /**
   * Size of a stream source. SCP must announce the size before sending, so over SCP a stream
   * without `size` is read into memory first. When set, the stream must be exactly this long,
   * over either protocol.
   */
  size?: number;
  /** Cancels the write. */
  signal?: AbortSignal;
}

/** Options for {@link ScpClient.readFile}. */
export interface ReadFileOptions {
  /** Cancels the read. */
  signal?: AbortSignal;
}
