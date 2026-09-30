import type { Attributes, FileEntry, InputAttributes, SFTPWrapper, Stats } from 'ssh2';
import { fromSftpError } from '../errors';
import type { EntryType } from '../types';

type Callback<T> = (err: Error | null | undefined, value?: T) => void;

/** Turns one callback style SFTPWrapper call into a promise with a mapped {@link ScpError}. */
export function call<T = void>(
  operation: string,
  path: string,
  fn: (cb: Callback<T>) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      fn((err, value) => {
        if (err) reject(fromSftpError(err, operation, path));
        else resolve(value as T);
      });
    } catch (err) {
      reject(fromSftpError(err, operation, path));
    }
  });
}

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

export function typeFromMode(mode: number | undefined, longname?: string): EntryType {
  if (typeof mode === 'number' && (mode & S_IFMT) !== 0) {
    const fmt = mode & S_IFMT;
    if (fmt === S_IFDIR) return 'directory';
    if (fmt === S_IFREG) return 'file';
    if (fmt === S_IFLNK) return 'symlink';
    return 'other';
  }
  switch (longname?.[0]) {
    case 'd':
      return 'directory';
    case '-':
      return 'file';
    case 'l':
      return 'symlink';
    default:
      return 'other';
  }
}

export const stat = (sftp: SFTPWrapper, path: string) =>
  call<Stats>('stat', path, (cb) => sftp.stat(path, cb));

export const lstat = (sftp: SFTPWrapper, path: string) =>
  call<Stats>('lstat', path, (cb) => sftp.lstat(path, cb));

export const readdir = (sftp: SFTPWrapper, path: string) =>
  call<FileEntry[]>('readdir', path, (cb) => sftp.readdir(path, cb));

export const mkdir = (sftp: SFTPWrapper, path: string, attrs: InputAttributes = {}) =>
  call('mkdir', path, (cb) => sftp.mkdir(path, attrs, cb));

export const rmdir = (sftp: SFTPWrapper, path: string) =>
  call('rmdir', path, (cb) => sftp.rmdir(path, cb));

export const unlink = (sftp: SFTPWrapper, path: string) =>
  call('unlink', path, (cb) => sftp.unlink(path, cb));

export const rename = (sftp: SFTPWrapper, from: string, to: string) =>
  call('rename', from, (cb) => sftp.rename(from, to, cb));

export const realpath = (sftp: SFTPWrapper, path: string) =>
  call<string>('realpath', path, (cb) => sftp.realpath(path, cb));

export const setstat = (sftp: SFTPWrapper, path: string, attrs: InputAttributes) =>
  call('setstat', path, (cb) => sftp.setstat(path, attrs, cb));

export const readFile = (sftp: SFTPWrapper, path: string) =>
  call<Buffer>('readFile', path, (cb) => sftp.readFile(path, cb));

/**
 * Creates `path` with `mode` if it does not exist yet. Resolves to false when it could not be
 * created: SFTP v3 has no distinct status for an existing file, so the caller's next open reports
 * any real problem.
 */
export async function createNewFile(
  sftp: SFTPWrapper,
  path: string,
  mode: number,
): Promise<boolean> {
  let handle: Buffer;
  try {
    handle = await call<Buffer>('upload', path, (cb) => sftp.open(path, 'wx', { mode }, cb));
  } catch {
    return false;
  }
  await call('upload', path, (cb) => sftp.close(handle, cb));
  return true;
}

export const writeFile = (sftp: SFTPWrapper, path: string, data: Buffer, mode: number) =>
  call('writeFile', path, (cb) => sftp.writeFile(path, data, { mode }, cb));

export type { Attributes };
