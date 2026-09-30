import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../../src/cli/main';
import legacyDefault, { Client as LegacyClient } from '../../src/legacy/index';
import { Client as Scp2Client, scp } from '../../src/scp2/index';
import { type Harness, hasScpBinary, sftpServerPath, startHarness } from '../harness/server';
import { makeTree, snapshot } from '../scenarios';

const canRun = Boolean(sftpServerPath) && hasScpBinary;

function io(env: Record<string, string | undefined> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s), isTTY: false },
      env: { HOME: '/nonexistent', ...env },
    },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

describe.skipIf(!canRun)('compatibility layers and CLI', () => {
  let root: string;
  let local: string;
  let full: Harness;
  let scpOnly: Harness;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'node-scp-croot-'));
    local = await mkdtemp(join(tmpdir(), 'node-scp-clocal-'));
    full = await startHarness({ root });
    scpOnly = await startHarness({ root, sftp: 'none' });
  });

  afterAll(async () => {
    await full?.close();
    await scpOnly?.close();
    await rm(root, { recursive: true, force: true });
    await rm(local, { recursive: true, force: true });
  });

  describe('node-scp/legacy', () => {
    const opened: Array<{ close(): unknown }> = [];
    afterEach(async () => {
      await Promise.all(opened.splice(0).map((c) => c.close()));
    });

    async function legacy(extra: Record<string, unknown> = {}) {
      const client = await LegacyClient({ ...full.connectOptions, ...extra });
      opened.push(client);
      return client;
    }

    it('keeps the default export and the 0.x file API', async () => {
      expect(legacyDefault).toBe(LegacyClient);
      const c = await legacy();
      const base = join(root, 'legacy');
      await c.mkdir(join(base, 'a', 'b'), {}, { recursive: true });
      await c.writeFile(join(base, 'a', 'f.txt'), 'hello');
      await c.appendFile(join(base, 'a', 'f.txt'), ' world');
      expect((await c.readFile(join(base, 'a', 'f.txt'))).toString()).toBe('hello world');
      expect(await c.exists(join(base, 'a'))).toBe('d');
      expect(await c.exists(join(base, 'a', 'f.txt'))).toBe('-');
      expect(await c.exists(join(base, 'nope'))).toBe(false);

      await c.chmod(join(base, 'a', 'f.txt'), 0o600);
      expect((await c.stat(join(base, 'a', 'f.txt'))).mode & 0o777).toBe(0o600);
      await c.utimes(join(base, 'a', 'f.txt'), 1_600_000_000, 1_600_000_000);
      expect((await stat(join(base, 'a', 'f.txt'))).mtimeMs).toBe(1_600_000_000_000);

      // ssh2 only swaps symlink arguments for servers announcing OpenSSH, the harness does not.
      await symlink(join(base, 'a', 'f.txt'), join(base, 'link'));
      expect(await c.readlink(join(base, 'link'))).toBe(join(base, 'a', 'f.txt'));
      expect((await c.lstat(join(base, 'link'))).isSymbolicLink()).toBe(true);

      const list = await c.list(base);
      expect(list.map((e) => [e.name, e.type]).sort()).toEqual([
        ['a', 'd'],
        ['link', 'l'],
      ]);
      const inner = await c.list(join(base, 'a'), '*.txt');
      expect(inner).toHaveLength(1);
      expect(inner[0]).toMatchObject({
        name: 'f.txt',
        type: '-',
        size: 11,
        rights: { user: 'rw', group: '', other: '' },
      });

      await c.rename(join(base, 'a', 'f.txt'), join(base, 'g.txt'));
      expect(await c.realPath(base)).toBe(base);
      await c.emptyDir(join(base, 'a'));
      await c.rmdir(base);
      expect(existsSync(base)).toBe(false);
    });

    it('uploadDir, downloadDir, uploadFile and downloadFile', async () => {
      const c = await legacy();
      const src = join(local, 'legacy-src');
      await makeTree(src);
      const remote = join(root, 'legacy-dir');
      await c.uploadDir(src, remote);
      await c.uploadDir(src, remote);
      const downloads: unknown[] = [];
      c.on('download', (d) => downloads.push(d));
      const back = join(local, 'legacy-back');
      const message = await c.downloadDir(remote, back);
      expect(message).toBe(`${remote} downloaded to ${back}`);
      expect(await snapshot(back)).toEqual(await snapshot(src));
      expect(downloads.length).toBeGreaterThan(0);

      await c.uploadFile(join(src, 'a.txt'), join(root, 'legacy-one.txt'));
      await c.downloadFile(join(root, 'legacy-one.txt'), join(local, 'legacy-one.txt'));
      expect(await readFile(join(local, 'legacy-one.txt'), 'utf8')).toBe(
        await readFile(join(src, 'a.txt'), 'utf8'),
      );
      await expect(c.downloadDir(join(root, 'missing'), back)).rejects.toThrow(/No such directory/);
    });

    it('forwards events given in options and closes without crashing', async () => {
      const seen: string[] = [];
      const c = await legacy({
        events: {
          connect: () => seen.push('connect'),
          ready: () => seen.push('ready'),
          handshake: () => seen.push('handshake'),
          close: () => seen.push('close'),
        },
      });
      await c.close();
      expect(seen).toEqual(expect.arrayContaining(['connect', 'handshake', 'ready', 'close']));
      await expect(c.stat('/')).rejects.toMatchObject({ code: 'ERR_NOT_CONNECTED' });
    });

    it('rejects with the raw ssh2 error on bad credentials', async () => {
      const err = await LegacyClient({ ...full.connectOptions, password: 'bad' }).catch(
        (e: unknown) => e as Error & { level?: string },
      );
      expect(err).toBeInstanceOf(Error);
      expect((err as { level?: string }).level).toBe('client-authentication');
    });
  });

  describe('node-scp/scp2', () => {
    const remoteOf = (h: Harness, path: string) => `test:test@127.0.0.1:${h.port}:${path}`;

    for (const [label, getHarness] of [
      ['SFTP', () => full],
      ['SCP only', () => scpOnly],
    ] as const) {
      it(`uploads files, directories and globs over ${label}`, async () => {
        const h = getHarness();
        const src = join(local, `scp2-${label}`);
        await makeTree(src);
        const base = join(root, `scp2-${label.replace(' ', '-')}`);

        await scp(join(src, 'a.txt'), remoteOf(h, `${base}/one/`));
        expect(await readFile(join(base, 'one', 'a.txt'), 'utf8')).toBe(
          await readFile(join(src, 'a.txt'), 'utf8'),
        );

        await new Promise<void>((resolve, reject) =>
          scp(src, remoteOf(h, `${base}/tree`), (err) => (err ? reject(err) : resolve())),
        );
        expect(await snapshot(join(base, 'tree'))).toEqual(await snapshot(src));

        await scp(`${src}/nested/**/*.txt`, {
          host: '127.0.0.1',
          port: h.port,
          username: 'test',
          password: 'test',
          path: `${base}/glob`,
        });
        expect(existsSync(join(base, 'glob', 'deeper', 'c.txt'))).toBe(true);
        expect(existsSync(join(base, 'glob', 'b.bin'))).toBe(false);

        const dest = join(local, `scp2-down-${label}`);
        await mkdir(dest, { recursive: true });
        await scp(remoteOf(h, join(base, 'one', 'a.txt')), `${dest}/`);
        expect(await readFile(join(dest, 'a.txt'), 'utf8')).toBe(
          await readFile(join(src, 'a.txt'), 'utf8'),
        );
      });
    }

    it('supports the Client API with defaults, mkdir and write', async () => {
      const client = new Scp2Client({ port: full.port });
      client.defaults({ host: '127.0.0.1', username: 'test', password: 'test' });
      const events: string[] = [];
      client.on('mkdir', () => events.push('mkdir'));
      client.on('write', () => events.push('write'));
      const dir = join(root, 'scp2-client', 'x', 'y');
      await client.mkdir(dir);
      await new Promise<void>((resolve, reject) =>
        client.write({ destination: join(dir, 'w.txt'), content: 'written' }, (err) =>
          err ? reject(err) : resolve(),
        ),
      );
      client.close();
      expect(await readFile(join(dir, 'w.txt'), 'utf8')).toBe('written');
      expect(events).toEqual(['mkdir', 'write']);
    });

    it('parses scp2 remote strings', () => {
      const client = new Scp2Client();
      expect(client.parse('admin:p@ss:w0rd@example.com:2222:/home/admin/')).toMatchObject({
        username: 'admin',
        password: 'p@ss:w0rd',
        host: 'example.com',
        port: 2222,
        path: '/home/admin/',
      });
      expect(client.parse('deploy@10.0.0.1:relative/dir')).toMatchObject({
        username: 'deploy',
        host: '10.0.0.1',
        path: 'relative/dir',
      });
      expect(client.parse('just/a/local/path')).toEqual({});
    });
  });

  describe('CLI', () => {
    const target = (_h: Harness, path: string) => `test@127.0.0.1:${path}`;
    const common = (h: Harness) => ['-P', String(h.port), '-q'];
    const env = { NODE_SCP_PASSWORD: 'test' };

    it('prints help and version', async () => {
      const help = io();
      expect(await main(['--help'], help.io)).toBe(0);
      expect(help.out()).toContain('Usage: node-scp');
      const version = io();
      expect(await main(['-V'], version.io)).toBe(0);
      expect(version.out()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('reports usage errors with exit code 2', async () => {
      const t = io(env);
      expect(await main(['only-one'], t.io)).toBe(2);
      expect(t.err()).toContain('Expected at least one source and a target');
      const both = io(env);
      expect(await main(['a@b:x', 'c@d:y'], both.io)).toBe(2);
      const bad = io(env);
      expect(await main(['--nope', 'a', 'b@c:'], bad.io)).toBe(2);
    });

    for (const [label, getHarness] of [
      ['SFTP', () => full],
      ['SCP only', () => scpOnly],
    ] as const) {
      it(`uploads into directories and downloads back over ${label}`, async () => {
        const h = getHarness();
        const src = join(local, `cli-${label}`);
        await makeTree(src);
        await mkdir(join(src, 'node_modules', 'dep'), { recursive: true });
        await writeFile(join(src, 'node_modules', 'dep', 'index.js'), 'x');
        await writeFile(join(src, 'debug.map'), 'map');
        const base = join(root, `cli-${label.replace(' ', '-')}`);
        await mkdir(base, { recursive: true });

        const up = io(env);
        const code = await main(
          [
            ...common(h),
            '-r',
            '--exclude',
            'node_modules',
            '--exclude',
            '*.map',
            src,
            target(h, `${base}/`),
          ],
          up.io,
        );
        expect(up.err()).toBe('');
        expect(code).toBe(0);
        const uploaded = join(base, `cli-${label}`);
        expect(existsSync(join(uploaded, 'node_modules'))).toBe(false);
        expect(existsSync(join(uploaded, 'debug.map'))).toBe(false);
        expect(existsSync(join(uploaded, 'nested', 'deeper', 'c.txt'))).toBe(true);

        const multi = io(env);
        expect(
          await main(
            [...common(h), join(src, 'a.txt'), join(src, 'empty.txt'), target(h, `${base}/many`)],
            multi.io,
          ),
        ).toBe(0);
        expect(existsSync(join(base, 'many', 'a.txt'))).toBe(true);
        expect(existsSync(join(base, 'many', 'empty.txt'))).toBe(true);

        const back = join(local, `cli-back-${label}`);
        const down = io(env);
        expect(await main([...common(h), '-r', target(h, uploaded), back], down.io)).toBe(0);
        expect(existsSync(join(back, 'nested', 'deeper', 'c.txt'))).toBe(true);
      });
    }

    it('prints a summary and warns about unverified host keys', async () => {
      const t = io(env);
      await writeFile(join(local, 'summary.txt'), 'abc');
      expect(
        await main(
          ['-P', String(full.port), join(local, 'summary.txt'), target(full, join(root, 's.txt'))],
          t.io,
        ),
      ).toBe(0);
      expect(t.err()).toMatch(/host key SHA256:\S+ was not verified/);
      expect(t.err()).toMatch(/Uploaded 1 file \(3 B\) in \d+\.\ds over sftp/);
    });

    it('warns about an unverified host key before authenticating', async () => {
      const t = io({ NODE_SCP_PASSWORD: 'bad' });
      expect(
        await main(
          ['-P', String(full.port), join(local, 'summary.txt'), target(full, join(root, 'x.txt'))],
          t.io,
        ),
      ).toBe(1);
      expect(t.err()).toMatch(/host key SHA256:\S+ was not verified[\s\S]*ERR_AUTH_FAILED/);
    });

    it('pins the host key with --fingerprint', async () => {
      const probe = io(env);
      await main(
        ['-P', String(full.port), join(local, 'summary.txt'), target(full, join(root, 's.txt'))],
        probe.io,
      );
      const fp = /host key (SHA256:\S+)/.exec(probe.err())![1]!;

      const ok = io(env);
      expect(
        await main(
          [
            ...common(full),
            '--fingerprint',
            fp,
            join(local, 'summary.txt'),
            target(full, join(root, 's2.txt')),
          ],
          ok.io,
        ),
      ).toBe(0);

      const wrong = io(env);
      expect(
        await main(
          [
            ...common(full),
            '--fingerprint',
            'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            join(local, 'summary.txt'),
            target(full, join(root, 's3.txt')),
          ],
          wrong.io,
        ),
      ).toBe(1);
      expect(wrong.err()).toContain('Host key mismatch');
      expect(existsSync(join(root, 's3.txt'))).toBe(false);
    });

    it('exits 1 with the error code on failures', async () => {
      const t = io(env);
      expect(
        await main([...common(full), target(full, join(root, 'missing.txt')), local], t.io),
      ).toBe(1);
      expect(t.err()).toContain('(ERR_NOT_FOUND)');
    });

    it('follows local symlinks when uploading', async () => {
      const dir = join(local, 'with-link');
      await mkdir(dir, { recursive: true });
      await writeFile(join(local, 'real.txt'), 'real');
      await symlink(join(local, 'real.txt'), join(dir, 'link.txt')).catch(() => undefined);
      const t = io(env);
      expect(
        await main([...common(full), '-r', dir, target(full, join(root, 'linked'))], t.io),
      ).toBe(0);
      expect(await readFile(join(root, 'linked', 'link.txt'), 'utf8')).toBe('real');
    });
  });
});
