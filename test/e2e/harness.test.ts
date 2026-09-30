import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { type AddressInfo, connect as connectTcp, createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerChannel } from 'ssh2';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { connect, download, ErrorCode, isScpError, type ScpClient, upload } from '../../src/index';
import { type Harness, hasScpBinary, sftpServerPath, startHarness } from '../harness/server';
import { makeTree, snapshot } from '../scenarios';

const canRun = Boolean(sftpServerPath) && hasScpBinary;

describe.skipIf(!canRun)('harness specific behaviour', () => {
  let root: string;
  let local: string;
  const harnesses: Harness[] = [];
  const clients: ScpClient[] = [];

  async function server(options: Omit<Parameters<typeof startHarness>[0], 'root'> = {}) {
    const h = await startHarness({ root, ...options });
    harnesses.push(h);
    return h;
  }

  async function client(h: Harness, extra: Parameters<typeof connect>[0] = {}) {
    const c = await connect({ ...h.connectOptions, ...extra });
    clients.push(c);
    return c;
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'node-scp-hroot-'));
    local = await mkdtemp(join(tmpdir(), 'node-scp-hlocal-'));
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await Promise.all(harnesses.splice(0).map((h) => h.close()));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(local, { recursive: true, force: true });
  });

  describe('protocol negotiation', () => {
    it('auto picks SFTP when the server offers it', async () => {
      const c = await client(await server());
      expect(c.protocol).toBe('sftp');
      expect(c.fs).toBeDefined();
    });

    it('auto falls back to SCP when the SFTP subsystem is rejected', async () => {
      const c = await client(await server({ sftp: 'none' }));
      expect(c.protocol).toBe('scp');
      expect(c.fs).toBeUndefined();
      await c.writeFile(join(root, 'fallback.txt'), 'via scp');
      expect(await readFile(join(root, 'fallback.txt'), 'utf8')).toBe('via scp');
    });

    it('auto falls back to SCP when sftp-server exits right away', async () => {
      const c = await client(await server({ sftp: 'exit' }));
      expect(c.protocol).toBe('scp');
    });

    it("protocol 'sftp' fails with ERR_SFTP_UNAVAILABLE when there is no SFTP", async () => {
      const h = await server({ sftp: 'none' });
      await expect(connect({ ...h.connectOptions, protocol: 'sftp' })).rejects.toMatchObject({
        code: ErrorCode.SftpUnavailable,
      });
    });

    it('SFTP only servers work in auto mode, SCP mode reports ERR_SCP_UNAVAILABLE', async () => {
      const h = await server({ exec: 'none' });
      const auto = await client(h);
      expect(auto.protocol).toBe('sftp');
      const scp = await client(h, { protocol: 'scp' });
      await expect(scp.writeFile(join(root, 'x'), 'x')).rejects.toMatchObject({
        code: ErrorCode.ScpUnavailable,
      });
    });

    it('gives up on an exec channel that never answers, like ForceCommand internal-sftp', async () => {
      const silent = (_command: string, _channel: ServerChannel) => {};
      const c = await client(await server({ exec: silent }), {
        protocol: 'scp',
        readyTimeout: 500,
      });
      const started = Date.now();
      await expect(c.writeFile(join(root, 'z'), 'z')).rejects.toMatchObject({
        code: ErrorCode.ScpUnavailable,
      });
      await expect(c.readFile(join(root, 'z'))).rejects.toMatchObject({
        code: ErrorCode.ScpUnavailable,
      });
      expect(Date.now() - started).toBeLessThan(5000);
    });

    it('reports ERR_SCP_UNAVAILABLE when the scp binary is missing', async () => {
      const c = await client(await server(), {
        protocol: 'scp',
        scpCommand: 'definitely-not-scp',
      });
      const err = await c.writeFile(join(root, 'y'), 'y').catch((e: unknown) => e);
      expect(isScpError(err, ErrorCode.ScpUnavailable)).toBe(true);
    });
  });

  describe('SCP safety', () => {
    it('quotes every path it sends to the remote shell', async () => {
      const commands: string[] = [];
      const c = await client(await server({ commands }), { protocol: 'scp' });
      const dir = join(root, "odd $(touch PWNED) `touch PWNED2` 'dir'");
      await mkdir(dir);
      const target = join(dir, "name ';touch PWNED3'.txt");
      await c.writeFile(target, 'safe');
      expect(await readFile(target, 'utf8')).toBe('safe');
      expect((await c.readFile(target)).toString()).toBe('safe');
      for (const name of ['PWNED', 'PWNED2', 'PWNED3']) {
        expect(existsSync(join(root, name))).toBe(false);
      }
      expect(commands.at(-2)).toBe(`scp -t -d '${dir.replaceAll("'", `'\\''`)}'`);
    });

    it('guards remote paths that start with a dash', async () => {
      const commands: string[] = [];
      const c = await client(await server({ commands }), { protocol: 'scp' });
      await mkdir(join(root, '-dash-dir'), { recursive: true });
      const previous = process.cwd();
      await c.writeFile('-dash-dir/file.txt', 'dash');
      expect(process.cwd()).toBe(previous);
      expect(await readFile(join(root, '-dash-dir', 'file.txt'), 'utf8')).toBe('dash');
      expect(commands.at(-1)).toBe('scp -t -d -- -dash-dir');
      expect((await c.readFile('-dash-dir/file.txt')).toString()).toBe('dash');
      expect(commands.at(-1)).toBe('scp -f -- -dash-dir/file.txt');
    });

    it('rejects names from the server that would escape the destination', async () => {
      const evil = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => {
          channel.write('D0755 0 top\n');
          channel.once('data', () => {
            channel.write('C0644 4 ../escaped.txt\n');
            channel.once('data', () => {
              channel.write('evil');
              channel.write(Buffer.from([0]));
            });
          });
        });
      };
      const c = await client(await server({ exec: evil }), { protocol: 'scp' });
      const dest = join(local, 'evil-dest');
      await expect(c.download('anything', dest, { recursive: true })).rejects.toMatchObject({
        code: ErrorCode.ScpProtocol,
      });
      expect(existsSync(join(local, 'escaped.txt'))).toBe(false);
    });

    it('rejects an unsafe name in the top level record', async () => {
      const evil = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => {
          channel.write('C0644 4 ../top.txt\n');
          channel.once('data', () => {
            channel.write('evil');
            channel.write(Buffer.from([0]));
          });
        });
      };
      const c = await client(await server({ exec: evil }), { protocol: 'scp' });
      await expect(c.download('anything', join(local, 'top-dest'))).rejects.toMatchObject({
        code: ErrorCode.ScpProtocol,
      });
      expect(existsSync(join(local, 'top-dest'))).toBe(false);
    });

    it('accepts the . that scp sends for a download of dir/.', async () => {
      const remoteDir = join(root, 'dot-src');
      await mkdir(remoteDir, { recursive: true });
      await writeFile(join(remoteDir, 'a.txt'), 'a');
      const c = await client(await server(), { protocol: 'scp' });
      const dest = join(local, 'dot-dest');
      await c.download(`${remoteDir}/.`, dest, { recursive: true });
      expect(await readFile(join(dest, 'a.txt'), 'utf8')).toBe('a');
    });

    it('fails when the server closes without sending anything', async () => {
      const silent = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => {
          channel.exit(0);
          channel.end();
        });
      };
      const c = await client(await server({ exec: silent }), { protocol: 'scp' });
      const err = await c.download('anything', join(local, 'nothing')).catch((e: unknown) => e);
      expect(isScpError(err)).toBe(true);
    });

    it('reports a ScpError when the server cuts off a file that the filter skips', async () => {
      const cutting = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => {
          channel.write('D0755 0 d\n');
          channel.once('data', () => {
            channel.write('C0644 100 skip.bin\n');
            channel.once('data', () => {
              channel.write('abc');
              channel.exit(1);
              channel.end();
            });
          });
        });
      };
      const c = await client(await server({ exec: cutting }), { protocol: 'scp' });
      const err = await c
        .download('d', join(local, 'cut'), { recursive: true, filter: () => false })
        .catch((e: unknown) => e);
      expect(isScpError(err)).toBe(true);
    });

    it('rejects a directory record when recursive was not requested', async () => {
      const evil = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => channel.write('D0755 0 surprise\n'));
      };
      const c = await client(await server({ exec: evil }), { protocol: 'scp' });
      await expect(c.download('file', join(local, 'nope'))).rejects.toMatchObject({
        code: ErrorCode.ScpProtocol,
      });
    });

    it('fails instead of hanging when the connection drops mid transfer', async () => {
      const dropping = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => {
          channel.write('C0644 1000000 big.bin\n');
          channel.once('data', () => {
            channel.write(randomBytes(1000));
            setTimeout(() => channel.destroy(), 20);
          });
        });
      };
      const c = await client(await server({ exec: dropping }), { protocol: 'scp' });
      const err = await c.download('big.bin', join(local, 'partial.bin')).catch((e: unknown) => e);
      expect(isScpError(err)).toBe(true);
    });
  });

  describe('lost connections', () => {
    /** Forwards to the harness and cuts the TCP connection after `limit` bytes from the client. */
    async function cuttingProxy(target: Harness, limit: number): Promise<Server> {
      const proxy = createServer((socket) => {
        const upstream = connectTcp(target.port, '127.0.0.1');
        let received = 0;
        socket.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > limit) {
            socket.destroy();
            upstream.destroy();
          }
        });
        socket.pipe(upstream).pipe(socket);
        socket.on('error', () => undefined);
        upstream.on('error', () => undefined);
      });
      await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
      return proxy;
    }

    for (const protocol of ['sftp', 'scp'] as const) {
      it(`fails instead of hanging when the connection drops during an upload over ${protocol}`, async () => {
        const target = await server();
        const proxy = await cuttingProxy(target, 256 * 1024);
        try {
          const c = await connect({
            ...target.connectOptions,
            port: (proxy.address() as AddressInfo).port,
            protocol,
          });
          const src = join(local, `drop-${protocol}.bin`);
          await writeFile(src, randomBytes(4 * 1024 * 1024));
          const err = await c.upload(src, join(root, `drop-${protocol}.bin`)).catch((e) => e);
          expect(isScpError(err)).toBe(true);
          await c.close();
        } finally {
          proxy.close();
        }
      });
    }
  });

  describe('permissions and times', () => {
    for (const protocol of ['sftp', 'scp'] as const) {
      it(`keeps file modes with preserve over ${protocol}`, async () => {
        const c = await client(await server(), { protocol });
        const src = join(local, `mode-${protocol}.sh`);
        await writeFile(src, '#!/bin/sh\n');
        await chmod(src, 0o751);
        const dest = join(root, `mode-${protocol}.sh`);
        await c.upload(src, dest, { preserve: true });
        expect((await stat(dest)).mode & 0o777).toBe(0o751);
      });

      it(`gives new copies the source permission bits without preserve over ${protocol}`, async () => {
        const umask = process.umask();
        const c = await client(await server(), { protocol });
        const src = join(local, `plain-${protocol}.sh`);
        await writeFile(src, '#!/bin/sh\n');
        await chmod(src, 0o751);
        const up = join(root, `plain-${protocol}.sh`);
        await c.upload(src, up);
        expect((await stat(up)).mode & 0o7777).toBe(0o751 & ~umask);

        const back = join(local, `plain-${protocol}-back.sh`);
        await c.download(up, back);
        expect((await stat(back)).mode & 0o7777).toBe(0o751 & ~umask);
      });

      it(`leaves the mode of existing files alone without preserve over ${protocol}`, async () => {
        const c = await client(await server(), { protocol });
        const src = join(local, `exists-${protocol}.sh`);
        await writeFile(src, 'new');
        await chmod(src, 0o755);
        const dest = join(root, `exists-${protocol}.sh`);
        await writeFile(dest, 'old');
        await chmod(dest, 0o600);
        await c.upload(src, dest);
        expect(await readFile(dest, 'utf8')).toBe('new');
        expect((await stat(dest)).mode & 0o777).toBe(0o600);
      });

      it(`drops setuid and setgid bits without preserve over ${protocol}`, async () => {
        const c = await client(await server(), { protocol });
        const src = join(local, `suid-${protocol}`);
        await writeFile(src, 'x');
        await chmod(src, 0o6755);
        const up = join(root, `suid-${protocol}`);
        await c.upload(src, up);
        expect((await stat(up)).mode & 0o7000).toBe(0);
        const back = join(local, `suid-${protocol}-back`);
        await c.download(src, back);
        expect((await stat(back)).mode & 0o7000).toBe(0);
      });

      it(`downloads a tree where two symlinks share a target over ${protocol}`, async () => {
        const c = await client(await server(), { protocol });
        const tree = join(root, `diamond-${protocol}`);
        await mkdir(join(tree, 'real'), { recursive: true });
        await writeFile(join(tree, 'real', 'f.txt'), 'hi');
        await symlink('real', join(tree, 'one'));
        await symlink('real', join(tree, 'two'));
        const back = join(local, `diamond-${protocol}`);
        const result = await c.download(tree, back, { recursive: true });
        expect(result.files).toBe(3);
        expect(await readFile(join(back, 'two', 'f.txt'), 'utf8')).toBe('hi');
      });
    }

    it('drops setuid bits a malicious SCP server sends', async () => {
      const evil = (_command: string, channel: ServerChannel) => {
        channel.once('data', () => {
          channel.write('C4755 2 tool\n');
          channel.once('data', () => {
            channel.write('hi');
            channel.write(Buffer.from([0]));
            channel.once('data', () => {
              channel.exit(0);
              channel.end();
            });
          });
        });
      };
      const c = await client(await server({ exec: evil }), { protocol: 'scp' });
      const dest = join(local, 'planted-tool');
      await c.download('/usr/bin/tool', dest);
      expect((await stat(dest)).mode & 0o7000).toBe(0);
    });
  });

  describe('RemoteFs (SFTP)', () => {
    it('lists, stats, creates, renames and removes', async () => {
      const c = await client(await server());
      const fs = c.fs!;
      const base = join(root, 'fs-ops');
      await fs.mkdir(join(base, 'a', 'b', 'c'), { recursive: true });
      await fs.mkdir(join(base, 'a', 'b', 'c'), { recursive: true });
      await c.writeFile(join(base, 'a', 'file.txt'), '12345');

      expect(await fs.exists(join(base, 'a'))).toBe('directory');
      expect(await fs.exists(join(base, 'a', 'file.txt'))).toBe('file');
      expect(await fs.exists(join(base, 'missing'))).toBe(false);

      const st = await fs.stat(join(base, 'a', 'file.txt'));
      expect(st).toMatchObject({ type: 'file', size: 5 });
      expect(st.mtime).toBeInstanceOf(Date);

      const entries = await fs.list(join(base, 'a'));
      expect(entries.map((e) => [e.name, e.type])).toEqual([
        ['b', 'directory'],
        ['file.txt', 'file'],
      ]);

      await fs.rename(join(base, 'a', 'file.txt'), join(base, 'moved.txt'));
      expect(await fs.exists(join(base, 'moved.txt'))).toBe('file');

      await expect(fs.rm(join(base, 'a'))).rejects.toMatchObject({
        code: ErrorCode.IsADirectory,
      });
      await fs.rm(join(base, 'a'), { recursive: true });
      await fs.rm(join(base, 'a'), { recursive: true, force: true });
      expect(await readdir(base)).toEqual(['moved.txt']);

      expect(await fs.realpath('.')).toBe(root);
    });

    it('lists hidden entries and relative paths correctly', async () => {
      const c = await client(await server());
      await mkdir(join(root, '.config', 'app'), { recursive: true });
      await writeFile(join(root, '.config', 'app', 'settings.json'), '{}');
      const entries = await c.fs!.list('.config/app');
      expect(entries.map((e) => e.name)).toEqual(['settings.json']);
      const back = join(local, 'dotconfig');
      await c.download('.config', back, { recursive: true });
      expect(await snapshot(back)).toEqual({ 'app/': null, 'app/settings.json': 'e30=' });
    });
  });

  describe('connection lifecycle', () => {
    it('maps a wrong password to ERR_AUTH_FAILED', async () => {
      const h = await server();
      await expect(connect({ ...h.connectOptions, password: 'wrong' })).rejects.toMatchObject({
        code: ErrorCode.AuthFailed,
      });
    });

    it('maps a refused connection to ERR_CONNECTION_FAILED', async () => {
      const h = await server();
      const port = h.port;
      await h.close();
      harnesses.splice(harnesses.indexOf(h), 1);
      await expect(
        connect({ host: '127.0.0.1', port, username: 'test', password: 'test' }),
      ).rejects.toMatchObject({ code: ErrorCode.ConnectionFailed });
    });

    it('rejects invalid options', async () => {
      await expect(
        // @ts-expect-error testing a runtime check
        connect({ host: 'localhost', protocol: 'ftp' }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidArgument });
    });

    it('closes idempotently and refuses work afterwards', async () => {
      const c = await connect((await server()).connectOptions);
      await c.close();
      await c.close();
      expect(c.closed).toBe(true);
      await expect(c.readFile('x')).rejects.toMatchObject({ code: ErrorCode.NotConnected });
    });

    it('supports Symbol.asyncDispose', async () => {
      const c = await connect((await server()).connectOptions);
      await c[Symbol.asyncDispose]();
      expect(c.closed).toBe(true);
    });

    it('aborts a pending connection', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        connect({ ...(await server()).connectOptions, signal: controller.signal }),
      ).rejects.toMatchObject({ code: ErrorCode.Aborted });
    });

    it('aborts while waiting for the SFTP subsystem', async () => {
      const controller = new AbortController();
      const started = Date.now();
      await expect(
        connect({
          ...(await server({ sftp: 'silent' })).connectOptions,
          protocol: 'sftp',
          readyTimeout: 10_000,
          signal: controller.signal,
          beforeConnect: (ssh) => ssh.once('ready', () => setTimeout(() => controller.abort(), 50)),
        }),
      ).rejects.toMatchObject({ code: ErrorCode.Aborted });
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  });

  describe('one shot helpers', () => {
    it('upload() and download() accept user@host:path targets', async () => {
      const h = await server();
      const src = join(local, 'oneshot');
      await makeTree(src);
      const target = `test@127.0.0.1:${join(root, 'oneshot')}`;
      const options = { port: h.port, password: 'test', recursive: true };
      await upload(src, target, options);
      const back = join(local, 'oneshot-back');
      await download(target, back, { ...options, protocol: 'scp' });
      expect(await snapshot(back)).toEqual(await snapshot(src));
    });
  });
});