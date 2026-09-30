import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  codeFromRemoteMessage,
  ErrorCode,
  fromConnectError,
  fromLocalError,
  fromSftpError,
  isScpError,
  ScpError,
} from '../../src/errors';
import { remotePath, toPortable } from '../../src/remote-path';
import { ByteReader, EndOfStreamError } from '../../src/scp/reader';
import { ProgressTracker } from '../../src/transfer/progress';
import { runQueue, withAbort } from '../../src/transfer/queue';
import type { TransferProgress } from '../../src/types';

describe('remote paths', () => {
  it('joins and trims per OS', () => {
    const posix = remotePath('posix');
    expect(posix.join('/www', 'a', 'b')).toBe('/www/a/b');
    expect(posix.trimTrailing('/www///')).toBe('/www');
    expect(posix.trimTrailing('/')).toBe('/');
    expect(posix.trimTrailing('')).toBe('');
    const win = remotePath('win32');
    expect(win.join('C:\\www', 'a')).toBe('C:\\www\\a');
    expect(win.trimTrailing('C:\\')).toBe('C:\\');
    expect(win.trimTrailing('C:\\www\\')).toBe('C:\\www');
    expect(toPortable('a\\b//c')).toBe('a/b/c');
  });
});

describe('errors', () => {
  it('maps SFTP status codes and errno values', () => {
    expect(fromSftpError(Object.assign(new Error('x'), { code: 2 }), 'stat', '/p').code).toBe(
      ErrorCode.NotFound,
    );
    expect(fromSftpError(Object.assign(new Error('x'), { code: 3 }), 'stat').code).toBe(
      ErrorCode.PermissionDenied,
    );
    expect(fromSftpError(Object.assign(new Error('x'), { code: 'ENOENT' }), 'stat').code).toBe(
      ErrorCode.NotFound,
    );
    const local = fromLocalError(Object.assign(new Error('x'), { code: 'EISDIR' }), 'open', '/d');
    expect(local).toMatchObject({ code: ErrorCode.IsADirectory, path: '/d' });
    expect(local.cause).toBeInstanceOf(Error);
  });

  it('maps connection errors by level', () => {
    expect(
      fromConnectError(Object.assign(new Error('x'), { level: 'client-authentication' })).code,
    ).toBe(ErrorCode.AuthFailed);
    expect(fromConnectError(Object.assign(new Error('x'), { level: 'client-timeout' })).code).toBe(
      ErrorCode.Timeout,
    );
    expect(fromConnectError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })).code).toBe(
      ErrorCode.ConnectionFailed,
    );
  });

  it('classifies remote scp messages', () => {
    expect(codeFromRemoteMessage('scp: /x: No such file or directory')).toBe(ErrorCode.NotFound);
    expect(codeFromRemoteMessage('scp: /x: Permission denied')).toBe(ErrorCode.PermissionDenied);
    expect(codeFromRemoteMessage('scp: /x: not a regular file')).toBe(ErrorCode.IsADirectory);
    expect(codeFromRemoteMessage('something else')).toBe(ErrorCode.Remote);
  });

  it('is recognisable across realms by name and code', () => {
    const err = new ScpError(ErrorCode.Timeout, 'slow');
    expect(err.name).toBe('ScpError');
    expect(isScpError(err)).toBe(true);
    expect(isScpError(err, ErrorCode.Timeout)).toBe(true);
    expect(isScpError(err, ErrorCode.NotFound)).toBe(false);
    expect(isScpError(new Error('x'))).toBe(false);
  });
});

describe('runQueue', () => {
  it('never exceeds the limit and processes everything', async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runQueue([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5 * (n % 3)));
      running--;
      done.push(n);
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('rejects on the first error and stops scheduling', async () => {
    const started: number[] = [];
    await expect(
      runQueue([1, 2, 3, 4], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(started).toEqual([1, 2]);
  });

  it('rejects with ERR_ABORTED when the signal fires', async () => {
    const controller = new AbortController();
    const pending = runQueue(
      [1, 2],
      1,
      () => new Promise((r) => setTimeout(r, 50)),
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: ErrorCode.Aborted });
    await expect(withAbort(Promise.resolve(1), controller.signal)).rejects.toMatchObject({
      code: ErrorCode.Aborted,
    });
  });
});

describe('ByteReader', () => {
  it('reads bytes, lines and exact chunks across writes', async () => {
    const stream = new PassThrough();
    const reader = new ByteReader(stream);
    stream.write(Buffer.from([0]));
    stream.write('C0644 5 a');
    stream.write('.txt\nhel');
    stream.write('lo');
    stream.end(Buffer.from([0]));
    expect(await reader.readByte()).toBe(0);
    expect(await reader.readLine()).toBe('C0644 5 a.txt');
    const chunks: Buffer[] = [];
    for await (const chunk of reader.readExactly(5)) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    expect(await reader.readByte()).toBe(0);
    expect(await reader.readByte()).toBeNull();
  });

  it('fails on truncated data', async () => {
    const stream = new PassThrough();
    const reader = new ByteReader(stream);
    stream.end('abc');
    const read = async () => {
      for await (const _ of reader.readExactly(10)) {
      }
    };
    await expect(read()).rejects.toBeInstanceOf(EndOfStreamError);
  });

  it('pauses the source when the buffer grows', async () => {
    const stream = new PassThrough({ highWaterMark: 1 });
    const reader = new ByteReader(stream);
    stream.write(Buffer.alloc(2 * 1024 * 1024));
    await new Promise((r) => setImmediate(r));
    expect(stream.isPaused()).toBe(true);
    let total = 0;
    stream.end();
    for await (const chunk of reader.readExactly(2 * 1024 * 1024)) total += chunk.length;
    expect(total).toBe(2 * 1024 * 1024);
  });
});

describe('ProgressTracker', () => {
  it('aggregates per file progress', () => {
    const events: TransferProgress[] = [];
    const tracker = new ProgressTracker((p) => events.push({ ...p }), 30, 2);
    tracker.update('a', 5, 10);
    tracker.update('a', 10, 10);
    tracker.complete('a', 10);
    tracker.update('b', 20, 20);
    tracker.complete('b', 20);
    const last = events.at(-1)!;
    expect(last).toMatchObject({ transferred: 30, total: 30, filesCompleted: 2, filesTotal: 2 });
    expect(events.every((e, i) => i === 0 || e.transferred >= events[i - 1]!.transferred)).toBe(
      true,
    );
  });
});
