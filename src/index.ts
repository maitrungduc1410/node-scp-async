/**
 * Copy files to and from SSH servers over SFTP or SCP.
 *
 * ```ts
 * import { connect } from 'node-scp';
 *
 * await using client = await connect({ host: 'example.com', username: 'deploy', privateKey });
 * await client.upload('./dist', '/var/www/app', { recursive: true });
 * ```
 *
 * @packageDocumentation
 * @mergeModuleWith <project>
 */
import { connect, ScpClient } from './client';
import { ErrorCode, ScpError } from './errors';
import { parseTarget, type RemoteTarget } from './target';
import type { ConnectOptions, TransferOptions, TransferResult } from './types';

export { ErrorCode, isScpError, ScpError, type ScpErrorOptions } from './errors';
export type { RemoteOs } from './remote-path';
export {
  type MkdirOptions,
  type RemoteEntry,
  RemoteFs,
  type RemoteStats,
  type RmOptions,
} from './sftp/remote-fs';
export { formatTarget, parseTarget, type RemoteTarget } from './target';
export type {
  ActiveProtocol,
  ConnectOptions,
  EntryInfo,
  EntryType,
  Protocol,
  ReadFileOptions,
  TransferOptions,
  TransferProgress,
  TransferResult,
  WriteFileOptions,
} from './types';
export { connect, ScpClient };

/** Options for the one shot {@link upload} and {@link download} helpers. */
export type CopyOptions = Omit<ConnectOptions, 'host' | 'port' | 'username'> &
  TransferOptions &
  Partial<Pick<ConnectOptions, 'host' | 'port' | 'username'>>;

const TRANSFER_KEYS = ['recursive', 'preserve', 'concurrency', 'filter', 'onProgress'] as const;

function split(
  target: string | RemoteTarget,
  options: CopyOptions,
): { connectOptions: ConnectOptions; transfer: TransferOptions; path: string } {
  const parsed = typeof target === 'string' ? parseTarget(target) : target;
  if (!parsed) {
    throw new ScpError(
      ErrorCode.InvalidArgument,
      `'${String(target)}' is not a remote location, expected user@host:path`,
    );
  }
  const connectOptions: Record<string, unknown> = { ...options };
  const transfer: Record<string, unknown> = {};
  for (const key of TRANSFER_KEYS) {
    if (key in connectOptions) {
      transfer[key] = connectOptions[key];
      delete connectOptions[key];
    }
  }
  if (options.signal) transfer.signal = options.signal;
  connectOptions.host = parsed.host;
  if (parsed.port !== undefined) connectOptions.port = parsed.port;
  if (parsed.username !== undefined) connectOptions.username = parsed.username;
  return {
    connectOptions: connectOptions as ConnectOptions,
    transfer: transfer as TransferOptions,
    path: parsed.path === '' ? '.' : parsed.path,
  };
}

/**
 * Connects, uploads and disconnects in one call.
 *
 * @example
 * ```ts
 * await upload('./dist', 'deploy@example.com:/var/www/app', { recursive: true, privateKey });
 * ```
 */
export async function upload(
  localPath: string,
  target: string | RemoteTarget,
  options: CopyOptions = {},
): Promise<TransferResult> {
  const { connectOptions, transfer, path } = split(target, options);
  const client = await connect(connectOptions);
  try {
    return await client.upload(localPath, path, transfer);
  } finally {
    await client.close();
  }
}

/**
 * Connects, downloads and disconnects in one call.
 *
 * @example
 * ```ts
 * await download('root@192.168.1.1:/etc/config', './backup/config', { recursive: true, password });
 * ```
 */
export async function download(
  source: string | RemoteTarget,
  localPath: string,
  options: CopyOptions = {},
): Promise<TransferResult> {
  const { connectOptions, transfer, path } = split(source, options);
  const client = await connect(connectOptions);
  try {
    return await client.download(path, localPath, transfer);
  } finally {
    await client.close();
  }
}
