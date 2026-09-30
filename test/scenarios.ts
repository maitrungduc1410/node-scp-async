import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ActiveProtocol,
  type ConnectOptions,
  connect,
  ErrorCode,
  isScpError,
  type ScpClient,
  type TransferProgress,
} from '../src/index';

/** A server to run the portable scenarios against. */
export interface ScenarioTarget {
  connectOptions: ConnectOptions;
  /** A writable remote directory that does not exist yet. Its parent must exist. */
  remoteBase: string;
}

/** File names that break naive quoting or path handling. */
const ALL_TRICKY_NAMES = [
  'with space.txt',
  "it's quoted.txt",
  'double"quote.txt',
  '$(touch INJECTED).txt',
  '`touch INJECTED2`.txt',
  'semi;colon&amp.txt',
  '-dash-first.txt',
  '.env',
  'unicode-\u00e9\u4e2d\u6587.txt',
  '*glob?.txt',
];

/** NTFS cannot store `<>:"|?*`, so Windows hosts only get the names they can hold. */
export const TRICKY_NAMES =
  process.platform === 'win32' || process.env.NODE_SCP_TEST_REMOTE_OS === 'win32'
    ? ALL_TRICKY_NAMES.filter((name) => !/[<>:"|?*]/.test(name))
    : ALL_TRICKY_NAMES;

export async function makeTree(root: string): Promise<void> {
  await mkdir(join(root, 'nested', 'deeper'), { recursive: true });
  await mkdir(join(root, 'empty-dir'), { recursive: true });
  await mkdir(join(root, '.hidden-dir'), { recursive: true });
  await writeFile(join(root, 'a.txt'), 'hello a\n');
  await writeFile(join(root, 'empty.txt'), '');
  await writeFile(join(root, 'nested', 'b.bin'), randomBytes(200_000));
  await writeFile(join(root, 'nested', 'deeper', 'c.txt'), 'deep\n');
  await writeFile(join(root, '.hidden-dir', 'secret'), 'shh\n');
  for (const name of TRICKY_NAMES) await writeFile(join(root, name), `content of ${name}\n`);
}

/** Returns `{ relativePath: contents }` for every file and `{ relativePath/: null }` for dirs. */
export async function snapshot(root: string): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  async function walk(dir: string, rel: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        out[`${childRel}/`] = null;
        await walk(abs, childRel);
      } else {
        out[childRel] = (await readFile(abs)).toString('base64');
      }
    }
  }
  await walk(root, '');
  return out;
}

export function defineTransferScenarios(
  label: string,
  protocol: ActiveProtocol,
  getTarget: () => ScenarioTarget,
): void {
  describe(`${label} [${protocol}]`, () => {
    let client: ScpClient;
    let local: string;
    let base: string;
    let counter = 0;
    const remote = (name: string) => `${base}/${name}`;
    const fresh = (prefix: string) => `${prefix}-${++counter}`;

    beforeAll(async () => {
      const target = getTarget();
      base = target.remoteBase;
      local = await mkdtemp(join(tmpdir(), 'node-scp-scenario-'));
      client = await connect({ ...target.connectOptions, protocol });
      await mkdir(join(local, 'empty-base'));
      await client.upload(join(local, 'empty-base'), base, { recursive: true });
    });

    afterAll(async () => {
      if (client && !client.closed) {
        await client.fs?.rm(base, { recursive: true, force: true });
        await client.close();
      }
      if (local) await rm(local, { recursive: true, force: true });
    });

    it('uses the requested protocol', () => {
      expect(client.protocol).toBe(protocol);
      expect(client.fs === undefined).toBe(protocol === 'scp');
    });

    it('round trips a single binary file', async () => {
      const data = randomBytes(300_000);
      const src = join(local, fresh('single'));
      await writeFile(src, data);
      const dest = remote(fresh('single'));
      const up = await client.upload(src, dest);
      expect(up).toEqual({ files: 1, directories: 0, bytes: data.length });
      const back = join(local, fresh('single-back'), 'file.bin');
      const down = await client.download(dest, back);
      expect(down.files).toBe(1);
      expect((await readFile(back)).equals(data)).toBe(true);
    });

    it('round trips a read only file', async () => {
      const src = join(local, fresh('readonly'));
      await writeFile(src, 'locked');
      await chmod(src, 0o444);
      const dest = remote(fresh('readonly'));
      await client.upload(src, dest);
      const back = join(local, fresh('readonly-back'));
      await client.download(dest, back);
      expect(await readFile(back, 'utf8')).toBe('locked');
      expect((await stat(back)).mode & 0o777 & ~0o044).toBe(0o400);
    });

    it('round trips a directory tree with tricky names', async () => {
      const src = join(local, fresh('tree'));
      await makeTree(src);
      const dest = remote(fresh('tree'));
      const up = await client.upload(src, dest, { recursive: true });
      expect(up.files).toBe(5 + TRICKY_NAMES.length);
      const back = join(local, fresh('tree-back'));
      await client.download(dest, back, { recursive: true });
      expect(await snapshot(back)).toEqual(await snapshot(src));
    });

    it('does not execute shell syntax found in file names', async () => {
      const src = join(local, fresh('inject'));
      await mkdir(src);
      await writeFile(join(src, '$(touch INJECTED)'), 'x');
      const dest = remote(fresh('inject dir $(touch INJECTED3)'));
      await client.upload(src, dest, { recursive: true });
      const back = join(local, fresh('inject-back'));
      await client.download(dest, back, { recursive: true });
      expect(Object.keys(await snapshot(back))).toEqual(['$(touch INJECTED)']);
    });

    it('applies filters on upload and on download', async () => {
      const src = join(local, fresh('filter'));
      await makeTree(src);
      const dest = remote(fresh('filter'));
      await client.upload(src, dest, {
        recursive: true,
        filter: (path) => !path.startsWith('nested') && path !== 'a.txt',
      });
      const back = join(local, fresh('filter-back'));
      await client.download(dest, back, {
        recursive: true,
        filter: (path, entry) => entry.type === 'directory' || !path.endsWith('.env'),
      });
      const keys = Object.keys(await snapshot(back));
      expect(keys).not.toContain('a.txt');
      expect(keys.some((k) => k.startsWith('nested'))).toBe(false);
      expect(keys).not.toContain('.env');
      expect(keys).toContain('empty.txt');
      expect(keys).toContain('.hidden-dir/secret');
    });

    it('reports progress up to the total', async () => {
      const src = join(local, fresh('progress'));
      await makeTree(src);
      const events: TransferProgress[] = [];
      const result = await client.upload(src, remote(fresh('progress')), {
        recursive: true,
        onProgress: (p) => events.push({ ...p }),
      });
      const last = events[events.length - 1]!;
      expect(last.transferred).toBe(result.bytes);
      expect(last.total).toBe(result.bytes);
      expect(last.filesCompleted).toBe(result.files);
      expect(last.filesTotal).toBe(result.files);
    });

    it('preserves modification times with preserve: true', async () => {
      const src = join(local, fresh('times'));
      await writeFile(src, 'old file');
      const past = new Date('2020-01-02T03:04:05Z');
      await utimes(src, past, past);
      const dest = remote(fresh('times'));
      await client.upload(src, dest, { preserve: true });
      const back = join(local, fresh('times-back'));
      await client.download(dest, back, { preserve: true });
      expect(Math.round((await stat(back)).mtimeMs / 1000)).toBe(past.getTime() / 1000);
    });

    it('writes and reads strings, buffers and streams', async () => {
      const text = remote(fresh('text'));
      await client.writeFile(text, 'hello\nworld');
      expect((await client.readFile(text)).toString()).toBe('hello\nworld');

      const bytes = randomBytes(70_000);
      const bin = remote(fresh('bin'));
      await client.writeFile(bin, bytes);
      expect((await client.readFile(bin)).equals(bytes)).toBe(true);

      const streamed = remote(fresh('stream'));
      await client.writeFile(streamed, Readable.from([Buffer.from('a'), Buffer.from('bc')]));
      expect((await client.readFile(streamed)).toString()).toBe('abc');

      const sized = remote(fresh('sized'));
      await client.writeFile(sized, Readable.from([Buffer.from('xyz')]), { size: 3 });
      expect((await client.readFile(sized)).toString()).toBe('xyz');
    });

    it('checks a stream against its declared size', async () => {
      const longer = remote(fresh('longer'));
      await expect(
        client.writeFile(longer, Readable.from([Buffer.from('abc'), Buffer.from('def')]), {
          size: 4,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidArgument });
      const shorter = remote(fresh('shorter'));
      await expect(
        client.writeFile(shorter, Readable.from([Buffer.from('ab')]), { size: 4 }),
      ).rejects.toMatchObject({ code: ErrorCode.InvalidArgument });
    });

    it('wraps errors from a failing source stream', async () => {
      const failing = new Readable({
        read() {
          this.destroy(new Error('boom'));
        },
      });
      const err = await client
        .writeFile(remote(fresh('failing')), failing)
        .catch((e: unknown) => e);
      expect(isScpError(err)).toBe(true);
      expect((err as Error).message).toContain('boom');
    });

    it('handles hidden files such as .env', async () => {
      const src = join(local, fresh('dotenv'));
      await mkdir(src);
      await writeFile(join(src, '.env'), 'KEY=value\n');
      const dest = remote(fresh('dotenv'));
      await client.upload(join(src, '.env'), `${dest}.env`);
      expect((await client.readFile(`${dest}.env`)).toString()).toBe('KEY=value\n');
    });

    it('fails with ERR_NOT_FOUND for a missing remote file', async () => {
      await expect(
        client.download(remote('does-not-exist'), join(local, fresh('missing'))),
      ).rejects.toMatchObject({ code: ErrorCode.NotFound });
      await expect(client.readFile(remote('does-not-exist'))).rejects.toMatchObject({
        code: ErrorCode.NotFound,
      });
    });

    it('fails with ERR_NOT_FOUND when the remote parent does not exist', async () => {
      const src = join(local, fresh('orphan'));
      await writeFile(src, 'x');
      await expect(client.upload(src, remote('no/such/parent/file.txt'))).rejects.toMatchObject({
        code: ErrorCode.NotFound,
      });
    });

    it('requires recursive for directories', async () => {
      const src = join(local, fresh('needs-r'));
      await makeTree(src);
      await expect(client.upload(src, remote(fresh('needs-r')))).rejects.toMatchObject({
        code: ErrorCode.IsADirectory,
      });
      const dest = remote(fresh('needs-r'));
      await client.upload(src, dest, { recursive: true });
      await expect(client.download(dest, join(local, fresh('needs-r-back')))).rejects.toMatchObject(
        { code: ErrorCode.IsADirectory },
      );
    });

    it('stops with ERR_ABORTED when the signal is aborted', async () => {
      const src = join(local, fresh('abort'));
      await makeTree(src);
      const controller = new AbortController();
      controller.abort(new Error('stop'));
      await expect(
        client.upload(src, remote(fresh('abort')), {
          recursive: true,
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: ErrorCode.Aborted });
    });

    it('still works after errors', async () => {
      await client.readFile(remote('missing-again')).catch(() => {});
      const file = remote(fresh('after-error'));
      await client.writeFile(file, 'ok');
      expect((await client.readFile(file)).toString()).toBe('ok');
    });
  });
}
