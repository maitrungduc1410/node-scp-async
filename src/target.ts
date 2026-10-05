import { ErrorCode, ScpError } from './errors';

/** A remote location split into its parts, as returned by {@link parseTarget}. */
export interface RemoteTarget {
  /** Host name or IP address, without brackets for IPv6. */
  host: string;
  /** SSH port, when the location names one. */
  port?: number;
  /** User name, when the location names one. */
  username?: string;
  /** Path on the server. Empty means the login directory. */
  path: string;
}

/**
 * Parses a remote location the way `scp` writes it:
 *
 * - `host:path`, `user@host:path`, `user@[::1]:path` (path may be empty or relative)
 * - `scp://[user@]host[:port][/path]` (the path after the first `/` is taken literally, so
 *   `scp://host/var/www` means `/var/www`)
 *
 * Returns `undefined` when `value` is a local path.
 */
export function parseTarget(value: string): RemoteTarget | undefined {
  if (value.startsWith('scp://')) return parseUri(value);
  // Local paths that happen to contain ':' after a '/' (./a:b) or a Windows drive (C:\x).
  if (/^[A-Za-z]:[\\/]/.test(value)) return undefined;
  const colon = findHostColon(value);
  if (colon === -1) return undefined;
  const slash = value.indexOf('/');
  if (slash !== -1 && slash < colon) return undefined;

  const authority = value.slice(0, colon);
  const path = value.slice(colon + 1);
  const at = authority.lastIndexOf('@');
  const username = at === -1 ? undefined : authority.slice(0, at);
  let host = at === -1 ? authority : authority.slice(at + 1);
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host === '') return undefined;
  if (username === '') {
    throw new ScpError(ErrorCode.InvalidArgument, `Empty user name in '${value}'`);
  }
  return username === undefined ? { host, path } : { host, username, path };
}

function findHostColon(value: string): number {
  if (value.includes('@[') || value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close === -1) return -1;
    return value[close + 1] === ':' ? close + 1 : -1;
  }
  return value.indexOf(':');
}

function parseUri(value: string): RemoteTarget {
  let url: URL;
  try {
    url = new URL(value);
  } catch (err) {
    throw new ScpError(ErrorCode.InvalidArgument, `Invalid scp URI '${value}'`, { cause: err });
  }
  if (url.password) {
    throw new ScpError(
      ErrorCode.InvalidArgument,
      'Passwords in scp URIs are not supported, pass `password` in the options instead',
    );
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new ScpError(ErrorCode.InvalidArgument, `Missing host in '${value}'`);
  const target: RemoteTarget = { host, path: decodeURIComponent(url.pathname) };
  if (url.port) target.port = Number(url.port);
  if (url.username) target.username = decodeURIComponent(url.username);
  return target;
}

/**
 * Formats a {@link RemoteTarget} as `user@host:path`, with brackets around IPv6 addresses. This
 * form has no place for a port, so `port` is left out.
 */
export function formatTarget(target: RemoteTarget): string {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host;
  const user = target.username ? `${target.username}@` : '';
  return `${user}${host}:${target.path}`;
}
