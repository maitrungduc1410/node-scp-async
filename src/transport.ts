import type { Readable } from 'node:stream';
import type {
  ActiveProtocol,
  ReadFileOptions,
  TransferOptions,
  TransferResult,
  WriteFileOptions,
} from './types';

/**
 * What every wire protocol must provide. Destination paths are exact: `remotePath` or
 * `localPath` is the file or directory that will exist after the call, never a parent to copy
 * into. The remote parent directory must already exist; local parents are created.
 */
export interface Transport {
  readonly protocol: ActiveProtocol;
  upload(localPath: string, remotePath: string, options: TransferOptions): Promise<TransferResult>;
  download(
    remotePath: string,
    localPath: string,
    options: TransferOptions,
  ): Promise<TransferResult>;
  writeFile(
    remotePath: string,
    data: string | Uint8Array | Readable,
    options: WriteFileOptions,
  ): Promise<void>;
  readFile(remotePath: string, options: ReadFileOptions): Promise<Buffer>;
}
