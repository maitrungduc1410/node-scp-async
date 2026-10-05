import { posix, win32 } from 'node:path';

/** Path and quoting style of the server: `posix`, or `win32` for Windows OpenSSH. */
export type RemoteOs = 'posix' | 'win32';

export interface RemotePathApi {
  readonly os: RemoteOs;
  join(...parts: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
  /** Removes trailing separators while keeping a lone root such as `/` or `C:\`. */
  trimTrailing(path: string): string;
}

function makeApi(os: RemoteOs): RemotePathApi {
  const impl = os === 'win32' ? win32 : posix;
  const trailing = os === 'win32' ? /[\\/]+$/ : /\/+$/;
  return {
    os,
    join: (...parts) => impl.join(...parts),
    dirname: (path) => impl.dirname(path),
    basename: (path) => impl.basename(path),
    trimTrailing(path) {
      const trimmed = path.replace(trailing, '');
      if (trimmed === '') return path.length > 0 ? path[0]! : path;
      if (os === 'win32' && /^[A-Za-z]:$/.test(trimmed)) return `${trimmed}\\`;
      return trimmed;
    },
  };
}

const APIS: Record<RemoteOs, RemotePathApi> = { posix: makeApi('posix'), win32: makeApi('win32') };

export function remotePath(os: RemoteOs = 'posix'): RemotePathApi {
  return APIS[os];
}

/** Joins relative path segments that always use `/`, the form used for filters and progress. */
export function toPortable(relative: string): string {
  return relative
    .split(/[\\/]+/)
    .filter(Boolean)
    .join('/');
}
