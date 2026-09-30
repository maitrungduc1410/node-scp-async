import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Attributes, Server, utils } from 'ssh2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, ErrorCode } from '../../src/index';
import { generateHostKey } from '../harness/server';

const { STATUS_CODE } = utils.sftp;
const DIR = 0o040755;
const FILE = 0o100644;
const BODY = Buffer.from('owned\n');

function attrs(mode: number): Attributes {
  return { mode, uid: 0, gid: 0, size: BODY.length, atime: 0, mtime: 0 };
}

/** An SFTP server whose only directory lists `names`, each served as a small file. */
async function startLyingServer(names: string[]): Promise<{ port: number; close(): void }> {
  const server = new Server({ hostKeys: [generateHostKey()] }, (conn) => {
    conn.on('authentication', (ctx) => ctx.accept());
    conn.on('ready', () => {
      conn.on('session', (accept) => {
        accept().on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          let listed = false;
          let sent = false;
          const statOf = (path: string) => attrs(path.endsWith('/dir') ? DIR : FILE);
          sftp.on('REALPATH', (id, path) =>
            sftp.name(id, [{ filename: path, longname: path, attrs: attrs(DIR) }]),
          );
          sftp.on('STAT', (id, path) => sftp.attrs(id, statOf(path)));
          sftp.on('LSTAT', (id, path) => sftp.attrs(id, statOf(path)));
          sftp.on('OPENDIR', (id) => sftp.handle(id, Buffer.from('d')));
          sftp.on('READDIR', (id) => {
            if (listed) return sftp.status(id, STATUS_CODE.EOF);
            listed = true;
            return sftp.name(
              id,
              names.map((filename) => ({
                filename,
                longname: `-rw-r--r-- ${filename}`,
                attrs: attrs(FILE),
              })),
            );
          });
          sftp.on('OPEN', (id) => sftp.handle(id, Buffer.from('f')));
          sftp.on('FSTAT', (id) => sftp.attrs(id, attrs(FILE)));
          sftp.on('READ', (id) => {
            if (sent) return sftp.status(id, STATUS_CODE.EOF);
            sent = true;
            return sftp.data(id, BODY);
          });
          sftp.on('CLOSE', (id) => sftp.status(id, STATUS_CODE.OK));
        });
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, close: () => server.close() };
}

describe('malicious SFTP server', () => {
  let local: string;

  beforeAll(async () => {
    local = await mkdtemp(join(tmpdir(), 'node-scp-evil-sftp-'));
  });

  afterAll(async () => {
    await rm(local, { recursive: true, force: true });
  });

  it.each([
    ['../escaped.txt', 'escaped.txt'],
    ['sub/../../escaped2.txt', 'escaped2.txt'],
    ['/etc/cron.d/evil', undefined],
  ])('refuses the listed name %j', async (name, escapedFile) => {
    const server = await startLyingServer([name]);
    const client = await connect({
      host: '127.0.0.1',
      port: server.port,
      username: 'x',
      password: 'x',
      protocol: 'sftp',
    });
    const parent = join(local, `case-${Math.random().toString(36).slice(2)}`);
    try {
      await expect(
        client.download('/srv/dir', join(parent, 'dest'), { recursive: true }),
      ).rejects.toMatchObject({ code: ErrorCode.Remote });
      if (escapedFile) expect(existsSync(join(parent, escapedFile))).toBe(false);
    } finally {
      await client.close();
      server.close();
    }
  });

  it.skipIf(process.platform === 'win32')(
    'keeps a backslash as part of the file name on POSIX',
    async () => {
      const server = await startLyingServer(['a\\..\\b.txt']);
      const client = await connect({
        host: '127.0.0.1',
        port: server.port,
        username: 'x',
        password: 'x',
        protocol: 'sftp',
      });
      const dest = join(local, 'backslash');
      try {
        await client.download('/srv/dir', dest, { recursive: true });
        expect(await readdir(dest)).toEqual(['a\\..\\b.txt']);
      } finally {
        await client.close();
        server.close();
      }
    },
  );
});
