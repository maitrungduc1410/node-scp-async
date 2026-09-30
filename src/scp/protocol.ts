/**
 * Encoder and parser for the SCP wire protocol (the one `scp -t` and `scp -f` speak).
 *
 * Control records, each terminated by `\n`:
 *   `C<mode> <size> <name>`  a file follows, then exactly <size> bytes, then one `\0`
 *   `D<mode> 0 <name>`       enter a directory
 *   `E`                      leave the current directory
 *   `T<mtime> 0 <atime> 0`   times for the next C or D record (only with `-p`)
 * After every record and after file data the receiver answers one status byte: `\0` for OK,
 * `\x01<message>\n` for an error, `\x02<message>\n` for a fatal error.
 */
import { ErrorCode, ScpError } from '../errors';
import { isSafeReceivedName } from '../names';

export const OK = 0;
export const WARNING = 1;
export const FATAL = 2;

export type ControlRecord =
  | { type: 'C'; mode: number; size: number; name: string }
  | { type: 'D'; mode: number; name: string }
  | { type: 'E' }
  | { type: 'T'; mtime: number; atime: number };

function octal(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, '0');
}

/** Checks a name we are about to send. The protocol cannot carry `/` or newlines in names. */
export function assertSendableName(name: string): void {
  if (name === '' || name === '.' || name === '..' || /[/\n\0]/.test(name)) {
    throw new ScpError(
      ErrorCode.InvalidArgument,
      `File name ${JSON.stringify(name)} cannot be sent over SCP`,
    );
  }
}

export function encodeFile(mode: number, size: number, name: string): string {
  assertSendableName(name);
  return `C${octal(mode)} ${size} ${name}\n`;
}

export function encodeDirectory(mode: number, name: string): string {
  assertSendableName(name);
  return `D${octal(mode)} 0 ${name}\n`;
}

export function encodeTimes(mtime: number, atime: number): string {
  return `T${Math.floor(mtime)} 0 ${Math.floor(atime)} 0\n`;
}

export const END_DIRECTORY = 'E\n';

/** Validates a name received in a C or D record, see {@link isSafeReceivedName}. */
export function assertSafeReceivedName(name: string, localPlatform = process.platform): void {
  if (!isSafeReceivedName(name, localPlatform)) {
    throw new ScpError(
      ErrorCode.ScpProtocol,
      `Server sent an unsafe file name ${JSON.stringify(name)}`,
    );
  }
}

function protocolError(line: string): ScpError {
  return new ScpError(
    ErrorCode.ScpProtocol,
    `Unexpected SCP control record ${JSON.stringify(line.slice(0, 200))}`,
  );
}

/** Parses one control line, given without its trailing newline. */
export function parseRecord(line: string): ControlRecord {
  switch (line[0]) {
    case 'C':
    case 'D': {
      const match = /^([CD])([0-7]{3,5}) (\d+) (.+)$/s.exec(line);
      if (!match) throw protocolError(line);
      const size = Number(match[3]);
      if (!Number.isSafeInteger(size)) throw protocolError(line);
      const mode = Number.parseInt(match[2]!, 8) & 0o7777;
      const name = match[4]!;
      if (match[1] === 'D') return { type: 'D', mode, name };
      return { type: 'C', mode, size, name };
    }
    case 'E':
      if (line !== 'E') throw protocolError(line);
      return { type: 'E' };
    case 'T': {
      const match = /^T(\d+) (\d+) (\d+) (\d+)$/.exec(line);
      if (!match) throw protocolError(line);
      return { type: 'T', mtime: Number(match[1]), atime: Number(match[3]) };
    }
    default:
      throw protocolError(line);
  }
}
