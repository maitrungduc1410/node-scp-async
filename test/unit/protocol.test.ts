import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../src/errors';
import {
  assertSafeReceivedName,
  assertSendableName,
  encodeDirectory,
  encodeFile,
  encodeTimes,
  parseRecord,
} from '../../src/scp/protocol';

const sendableName = fc
  .string({ unit: 'binary', minLength: 1, maxLength: 60 })
  .filter((s) => !/[/\n\0]/.test(s) && s !== '.' && s !== '..');

describe('SCP control records', () => {
  it('encodes the formats OpenSSH expects', () => {
    expect(encodeFile(0o644, 12, 'a.txt')).toBe('C0644 12 a.txt\n');
    expect(encodeFile(0o100755, 0, 'run.sh')).toBe('C0755 0 run.sh\n');
    expect(encodeDirectory(0o40755, 'dir')).toBe('D0755 0 dir\n');
    expect(encodeTimes(1_700_000_000.9, 1_600_000_000)).toBe('T1700000000 0 1600000000 0\n');
  });

  it('round trips files and directories', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0o7777 }),
        fc.maxSafeNat(),
        sendableName,
        (mode, size, name) => {
          expect(parseRecord(encodeFile(mode, size, name).slice(0, -1))).toEqual({
            type: 'C',
            mode,
            size,
            name,
          });
          expect(parseRecord(encodeDirectory(mode, name).slice(0, -1))).toEqual({
            type: 'D',
            mode,
            name,
          });
        },
      ),
    );
  });

  it('parses times and end records', () => {
    expect(parseRecord('T1700000000 0 1600000000 0')).toEqual({
      type: 'T',
      mtime: 1_700_000_000,
      atime: 1_600_000_000,
    });
    expect(parseRecord('E')).toEqual({ type: 'E' });
  });

  it.each([
    '',
    'X0644 1 a',
    'C0644 a b',
    'C0644 12',
    'C99 1 a',
    'C0644 99999999999999999999 big',
    'Eextra',
    'T1 0 2',
  ])('rejects malformed record %j', (line) => {
    expect(() => parseRecord(line)).toThrow(
      expect.objectContaining({ code: ErrorCode.ScpProtocol }),
    );
  });

  it('never throws anything but ScpError on garbage', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (line) => {
        try {
          parseRecord(line);
        } catch (err) {
          expect(err).toMatchObject({ code: ErrorCode.ScpProtocol });
        }
      }),
    );
  });
});

describe('names', () => {
  it.each(['', '.', '..', 'a/b', 'new\nline', 'nul\0'])('refuses to send %j', (name) => {
    expect(() => assertSendableName(name)).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });

  it.each(['', '.', '..', '../x', 'a/b', '/etc/passwd', 'nul\0'])(
    'refuses to receive %j',
    (name) => {
      expect(() => assertSafeReceivedName(name)).toThrow(
        expect.objectContaining({ code: ErrorCode.ScpProtocol }),
      );
    },
  );

  it('refuses backslashes, drive letters and streams only when the local side is Windows', () => {
    for (const name of ['a\\b', '..\\x', 'C:x', 'file.txt:stream']) {
      expect(() => assertSafeReceivedName(name, 'win32')).toThrow(
        expect.objectContaining({ code: ErrorCode.ScpProtocol }),
      );
      expect(() => assertSafeReceivedName(name, 'linux')).not.toThrow();
    }
  });

  it.each(['file', '.env', '..hidden', 'with space', "quote'd", '$(x)'])('accepts %j', (name) => {
    expect(() => assertSafeReceivedName(name)).not.toThrow();
    expect(() => assertSendableName(name)).not.toThrow();
  });
});
