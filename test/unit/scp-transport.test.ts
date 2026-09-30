import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Duplex, PassThrough } from 'node:stream';
import type { Client as SshClient } from 'ssh2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../src/errors';
import { remotePath } from '../../src/remote-path';
import { ScpTransport } from '../../src/scp/transport';

/** A remote `scp -f` that sends one small file, answering each client byte with the next step. */
function fileSource(): Duplex & { stderr: PassThrough } {
  const steps = [
    (ch: Duplex) => ch.push('C0644 5 f\n'),
    (ch: Duplex) => {
      ch.push('hello');
      ch.push(Buffer.from([0]));
    },
    (ch: Duplex) => {
      ch.push(null);
      ch.emit('exit', 0);
      setImmediate(() => ch.destroy());
    },
  ];
  const channel = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      steps.shift()?.(channel);
      callback();
    },
  }) as Duplex & { stderr: PassThrough };
  channel.stderr = new PassThrough();
  return channel;
}

describe('ScpTransport cancellation', () => {
  let local: string;

  beforeAll(async () => {
    local = await mkdtemp(join(tmpdir(), 'node-scp-unit-'));
  });

  afterAll(async () => {
    await rm(local, { recursive: true, force: true });
  });

  it('honours an abort that happens while the exec request is in flight', async () => {
    const controller = new AbortController();
    const ssh = {
      exec(_command: string, callback: (err: Error | undefined, channel: Duplex) => void) {
        setTimeout(() => controller.abort(), 5);
        setTimeout(() => callback(undefined, fileSource()), 20);
      },
    } as unknown as SshClient;
    const transport = new ScpTransport(ssh, {
      scpCommand: 'scp',
      paths: remotePath('posix'),
      handshakeTimeout: 0,
    });
    await expect(
      transport.download('/f', join(local, 'f'), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: ErrorCode.Aborted });
  });

  it('aborts a congested upload without waiting for the channel to close', async () => {
    // Like ssh2 on a slow link: destroy() only queues a close request, so neither 'drain' nor
    // 'close' arrives for a long time.
    let records = 0;
    const channel = new Duplex({
      writableHighWaterMark: 1,
      read() {},
      write(_chunk, _encoding, callback) {
        if (records++ === 0) {
          channel.push(Buffer.from([0]));
          callback();
        }
      },
    }) as Duplex & { stderr: PassThrough };
    channel.stderr = new PassThrough();
    channel.destroy = () => channel;
    const ssh = {
      exec(_command: string, callback: (err: Error | undefined, channel: Duplex) => void) {
        setImmediate(() => {
          channel.push(Buffer.from([0]));
          callback(undefined, channel);
        });
      },
    } as unknown as SshClient;
    const transport = new ScpTransport(ssh, {
      scpCommand: 'scp',
      paths: remotePath('posix'),
      handshakeTimeout: 0,
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const started = Date.now();
    await expect(
      transport.writeFile('/f', Buffer.alloc(1024 * 1024), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: ErrorCode.Aborted });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('honours an abort when the server never answers the exec request', async () => {
    const controller = new AbortController();
    const ssh = {
      exec() {
        setTimeout(() => controller.abort(), 20);
      },
    } as unknown as SshClient;
    const transport = new ScpTransport(ssh, {
      scpCommand: 'scp',
      paths: remotePath('posix'),
      handshakeTimeout: 60_000,
    });
    await expect(
      transport.download('/f', join(local, 'never'), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: ErrorCode.Aborted });
  });
});
