import type { ScpClient } from './client';
import { ErrorCode, ScpError } from './errors';
import { runCommand } from './exec';
import { quoteArg } from './shell';

/**
 * Whether a remote path is an existing directory. Uses SFTP when available, otherwise `test -d`
 * on POSIX hosts. Always `false` for Windows hosts without SFTP.
 */
export async function remoteIsDirectory(client: ScpClient, path: string): Promise<boolean> {
  if (client.fs) return (await client.fs.exists(path)) === 'directory';
  if (client.remoteOs !== 'posix') return false;
  const result = await runCommand(client.ssh, `test -d ${quoteArg(path, 'posix')}`);
  return result.code === 0;
}

/** Creates a remote directory and its parents, over SFTP or with `mkdir -p` on POSIX hosts. */
export async function mkdirp(client: ScpClient, dir: string, mode?: number): Promise<void> {
  if (dir === '' || dir === '.' || dir === '/') return;
  if (client.fs) {
    await client.fs.mkdir(
      dir,
      mode === undefined ? { recursive: true } : { recursive: true, mode },
    );
    return;
  }
  if (client.remoteOs !== 'posix') return;
  const result = await runCommand(client.ssh, `mkdir -p -- ${quoteArg(dir, 'posix')}`);
  if (result.code !== 0) {
    throw new ScpError(ErrorCode.Remote, `mkdir -p '${dir}' failed: ${result.stderr.trim()}`, {
      path: dir,
    });
  }
}
