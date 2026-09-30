/**
 * Compares node-scp with ssh2-sftp-client and node-ssh. By default it runs against the in
 * process test server (fast to start, but server and client share one CPU). For real numbers
 * point it at a server:
 *
 *   NODE_SCP_BENCH_HOST=10.0.0.5 NODE_SCP_BENCH_USER=test NODE_SCP_BENCH_PASSWORD=test \
 *   NODE_SCP_BENCH_DIR=/tmp/bench pnpm bench
 */
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeSSH } from 'node-ssh';
import SftpClient from 'ssh2-sftp-client';
import { afterAll, test } from 'vitest';
import { connect, type ScpClient } from '../src/index';
import { type Harness, hasScpBinary, sftpServerPath, startHarness } from '../test/harness/server';

const env = process.env;
let harness: Harness | undefined;
let remoteDir: string;
let config: { host: string; port: number; username: string; password: string };

if (env.NODE_SCP_BENCH_HOST) {
  config = {
    host: env.NODE_SCP_BENCH_HOST,
    port: Number(env.NODE_SCP_BENCH_PORT ?? 22),
    username: env.NODE_SCP_BENCH_USER ?? 'test',
    password: env.NODE_SCP_BENCH_PASSWORD ?? '',
  };
  remoteDir = env.NODE_SCP_BENCH_DIR ?? '/tmp/node-scp-bench';
} else {
  if (!sftpServerPath || !hasScpBinary) {
    throw new Error('The in process benchmark needs sftp-server and scp installed locally');
  }
  remoteDir = await mkdtemp(join(tmpdir(), 'node-scp-bench-remote-'));
  harness = await startHarness({ root: remoteDir });
  config = { host: '127.0.0.1', port: harness.port, username: 'test', password: 'test' };
}

const local = await mkdtemp(join(tmpdir(), 'node-scp-bench-local-'));
const bigFile = join(local, 'big.bin');
await writeFile(bigFile, randomBytes(16 * 1024 * 1024));
const smallDir = join(local, 'small');
for (let d = 0; d < 10; d++) {
  await mkdir(join(smallDir, `dir-${d}`), { recursive: true });
  for (let f = 0; f < 20; f++) {
    await writeFile(join(smallDir, `dir-${d}`, `file-${f}.txt`), randomBytes(4096));
  }
}

const scpSftp: ScpClient = await connect({ ...config, protocol: 'sftp' });
const scpScp: ScpClient = await connect({ ...config, protocol: 'scp' });
const sftpClient = new SftpClient();
await sftpClient.connect(config);
const nodeSsh = new NodeSSH();
await nodeSsh.connect(config);
await scpSftp.fs!.mkdir(remoteDir, { recursive: true });

let n = 0;
const target = (name: string) => `${remoteDir}/${name}-${++n}`;
const options = { time: 3000, iterations: 3 };

afterAll(async () => {
  await Promise.all([scpSftp.close(), scpScp.close(), sftpClient.end()]);
  nodeSsh.dispose();
  await harness?.close();
});

test('upload one 16 MiB file', async ({ bench }) => {
  await bench.compare(
    bench('node-scp (sftp)', async () => {
      await scpSftp.upload(bigFile, target('big'));
    }),
    bench('node-scp (scp)', async () => {
      await scpScp.upload(bigFile, target('big'));
    }),
    bench('ssh2-sftp-client fastPut', async () => {
      await sftpClient.fastPut(bigFile, target('big'));
    }),
    bench('node-ssh putFile', async () => {
      await nodeSsh.putFile(bigFile, target('big'));
    }),
    options,
  );
});

test('upload 200 files of 4 KiB in 10 directories', async ({ bench }) => {
  await bench.compare(
    bench('node-scp (sftp, concurrency 4)', async () => {
      await scpSftp.upload(smallDir, target('small'), { recursive: true });
    }),
    bench('node-scp (scp, one stream)', async () => {
      await scpScp.upload(smallDir, target('small'), { recursive: true });
    }),
    bench('ssh2-sftp-client uploadDir', async () => {
      await sftpClient.uploadDir(smallDir, target('small'));
    }),
    bench('node-ssh putDirectory', async () => {
      await nodeSsh.putDirectory(smallDir, target('small'), { concurrency: 4 });
    }),
    options,
  );
});
