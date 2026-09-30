/**
 * Stable error codes. Every error thrown by node-scp is a {@link ScpError} carrying one of these.
 */
export const ErrorCode = {
  InvalidArgument: 'ERR_INVALID_ARGUMENT',
  ConnectionFailed: 'ERR_CONNECTION_FAILED',
  AuthFailed: 'ERR_AUTH_FAILED',
  Timeout: 'ERR_TIMEOUT',
  NotConnected: 'ERR_NOT_CONNECTED',
  ConnectionClosed: 'ERR_CONNECTION_CLOSED',
  SftpUnavailable: 'ERR_SFTP_UNAVAILABLE',
  ScpUnavailable: 'ERR_SCP_UNAVAILABLE',
  ScpProtocol: 'ERR_SCP_PROTOCOL',
  Unsupported: 'ERR_UNSUPPORTED',
  NotFound: 'ERR_NOT_FOUND',
  PermissionDenied: 'ERR_PERMISSION_DENIED',
  NotADirectory: 'ERR_NOT_A_DIRECTORY',
  IsADirectory: 'ERR_IS_A_DIRECTORY',
  AlreadyExists: 'ERR_ALREADY_EXISTS',
  Remote: 'ERR_REMOTE',
  Local: 'ERR_LOCAL',
  Aborted: 'ERR_ABORTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ScpErrorOptions {
  cause?: unknown;
  /** The local or remote path the failing operation was working on. */
  path?: string;
}

export class ScpError extends Error {
  override readonly name = 'ScpError';
  readonly code: ErrorCode;
  readonly path: string | undefined;

  constructor(code: ErrorCode, message: string, options: ScpErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.path = options.path;
  }
}

export function isScpError(value: unknown, code?: ErrorCode): value is ScpError {
  return value instanceof ScpError && (code === undefined || value.code === code);
}

export function abortError(signal: AbortSignal | undefined): ScpError {
  const reason: unknown = signal?.reason;
  const detail = reason instanceof Error ? `: ${reason.message}` : '';
  return new ScpError(ErrorCode.Aborted, `Operation aborted${detail}`, { cause: reason });
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

/** A stream source that does not match the `size` its caller declared. */
export function sizeMismatch(actual: number, declared: number): ScpError {
  return new ScpError(
    ErrorCode.InvalidArgument,
    actual > declared
      ? `The stream is longer than the declared size of ${declared} bytes`
      : `The stream ended after ${actual} bytes but size was declared as ${declared}`,
  );
}

interface NodeLikeError {
  code?: unknown;
  level?: unknown;
  message?: unknown;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** SFTP status codes from draft-ietf-secsh-filexfer-02, as reported by ssh2 in `err.code`. */
const SFTP_STATUS: Record<number, ErrorCode> = {
  2: ErrorCode.NotFound,
  3: ErrorCode.PermissionDenied,
  4: ErrorCode.Remote,
  5: ErrorCode.Remote,
  6: ErrorCode.ConnectionClosed,
  7: ErrorCode.ConnectionClosed,
  8: ErrorCode.Unsupported,
};

export function fromSftpError(err: unknown, operation: string, path?: string): ScpError {
  if (err instanceof ScpError) return err;
  const code = (err as NodeLikeError | undefined)?.code;
  const mapped =
    typeof code === 'number'
      ? SFTP_STATUS[code]
      : typeof code === 'string'
        ? (ERRNO[code] ?? ErrorCode.Local)
        : undefined;
  const where = path === undefined ? '' : ` '${path}'`;
  return new ScpError(
    mapped ?? ErrorCode.Remote,
    `${operation}${where} failed: ${messageOf(err)}`,
    {
      cause: err,
      path,
    },
  );
}

const ERRNO: Record<string, ErrorCode> = {
  ENOENT: ErrorCode.NotFound,
  EACCES: ErrorCode.PermissionDenied,
  EPERM: ErrorCode.PermissionDenied,
  ENOTDIR: ErrorCode.NotADirectory,
  EISDIR: ErrorCode.IsADirectory,
  EEXIST: ErrorCode.AlreadyExists,
};

export function fromLocalError(err: unknown, operation: string, path?: string): ScpError {
  if (err instanceof ScpError) return err;
  const code = (err as NodeLikeError | undefined)?.code;
  const mapped = typeof code === 'string' ? ERRNO[code] : undefined;
  const where = path === undefined ? '' : ` '${path}'`;
  return new ScpError(
    mapped ?? ErrorCode.Local,
    `${operation}${where} failed locally: ${messageOf(err)}`,
    { cause: err, path },
  );
}

export function fromConnectError(err: unknown): ScpError {
  if (err instanceof ScpError) return err;
  const level = (err as NodeLikeError | undefined)?.level;
  const message = messageOf(err);
  if (level === 'client-authentication') {
    return new ScpError(ErrorCode.AuthFailed, `Authentication failed: ${message}`, { cause: err });
  }
  if (level === 'client-timeout' || /timed out/i.test(message)) {
    return new ScpError(ErrorCode.Timeout, `Connection timed out: ${message}`, { cause: err });
  }
  return new ScpError(ErrorCode.ConnectionFailed, `Connection failed: ${message}`, { cause: err });
}

/**
 * Maps a human readable message coming from a remote `scp` process to an error code.
 * OpenSSH and Dropbear both use strerror(3) texts.
 */
export function codeFromRemoteMessage(message: string): ErrorCode {
  if (/no such file or directory/i.test(message)) return ErrorCode.NotFound;
  if (/permission denied/i.test(message)) return ErrorCode.PermissionDenied;
  if (/is a directory/i.test(message)) return ErrorCode.IsADirectory;
  if (/not a directory/i.test(message)) return ErrorCode.NotADirectory;
  if (/not a regular file/i.test(message)) return ErrorCode.IsADirectory;
  return ErrorCode.Remote;
}
