import type { Client as SshClient } from 'ssh2';
import { ErrorCode, ScpError } from './errors';

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a command on the server and collects its output. */
export function runCommand(ssh: SshClient, command: string): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve, reject) => {
    ssh.exec(command, (err, stream) => {
      if (err) {
        reject(
          new ScpError(ErrorCode.Remote, `Cannot run '${command}': ${err.message}`, { cause: err }),
        );
        return;
      }
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let code: number | null = null;
      stream.on('data', (chunk: Buffer) => stdout.push(chunk));
      stream.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      stream.on('exit', (exitCode: number | null) => {
        code = exitCode;
      });
      stream.on('close', () =>
        resolve({
          code,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }),
      );
    });
  });
}
