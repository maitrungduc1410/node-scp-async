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
 * Whether `arg` means the same inside double quotes to cmd.exe (the default Windows OpenSSH
 * shell) and to PowerShell (a common `DefaultShell`). cmd.exe expands `%` and `!` and treats `^`
 * specially even there; PowerShell expands `$` and escapes with a backtick.
 */
function isSafeForWindowsShell(arg: string): boolean {
  return !/["%!^$`\0\r\n]/.test(arg);
}

/**
 * Quotes one argument for a Windows OpenSSH shell. Characters that the shell would interpret
 * even inside double quotes are rejected instead of escaped.
 */
export function quoteWindows(arg: string): string {
  if (!isSafeForWindowsShell(arg)) {
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
