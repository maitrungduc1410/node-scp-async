import { ErrorCode, ScpError } from './errors';
import type { RemoteOs } from './remote-path';

const SAFE_POSIX = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * Quotes one argument for a POSIX shell so it reaches the program as exactly one literal word.
 * No expansion of `$`, backticks, globs, `~` or whitespace can happen on the remote side.
 */
export function quotePosix(arg: string): string {
  if (arg.includes('\0')) {
    throw new ScpError(ErrorCode.InvalidArgument, 'Paths must not contain NUL bytes');
  }
  if (arg === '') return "''";
  if (SAFE_POSIX.test(arg)) return arg;
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

/**
 * Quotes one argument for the default Windows OpenSSH shell (cmd.exe). Characters that cmd.exe
 * would interpret even inside double quotes are rejected instead of escaped.
 */
export function quoteWindows(arg: string): string {
  if (/["%!^\0\r\n]/.test(arg)) {
    throw new ScpError(
      ErrorCode.InvalidArgument,
      `Path ${JSON.stringify(arg)} contains characters that cannot be passed safely to a Windows shell`,
    );
  }
  // Backslashes only escape when they precede a quote, so `"C:\"` would swallow the closing
  // quote. Doubling a trailing run makes it `"C:\\"`, which Windows parses as `C:\`.
  return `"${arg.replace(/\\+$/, '$&$&')}"`;
}

export function quoteArg(arg: string, os: RemoteOs): string {
  return os === 'win32' ? quoteWindows(arg) : quotePosix(arg);
}
