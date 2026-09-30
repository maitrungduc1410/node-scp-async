import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CreatedProxy, ToxiProxyContainer } from '@testcontainers/toxiproxy';
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ConnectOptions, connect, ErrorCode, isScpError } from '../../src/index';
import { defineTransferScenarios } from '../scenarios';

/**
 * Real servers in containers: OpenSSH in three modes and Dropbear. Needs Docker, run with
 * `pnpm test:docker`.
 */
const dockerDir = fileURLToPath(new URL('../../docker', import.meta.url));
const OPENSSH_IMAGE = 'node-scp-test-openssh';

interface Servers {
  network: StartedNetwork;
  full: StartedTestContainer;
  sftpOnly: StartedTestContainer;
  noSftp: StartedTestContainer;
  dropbear: StartedTestContainer;
  toxiproxy: Awaited<ReturnType<ToxiProxyContainer['start']>>;
}

let servers: Servers;

function options(container: StartedTestContainer, extra: Partial<ConnectOptions> = {}) {
  return {
    host: container.getHost(),
    port: container.getMappedPort(22),
    username: 'test',
    password: 'test',
    readyTimeout: 20_000,
    ...extra,
  } satisfies ConnectOptions;
}

beforeAll(async () => {
  const [, dropbearImage] = await Promise.all([
    GenericContainer.fromDockerfile(join(dockerDir, 'openssh')).build(OPENSSH_IMAGE, {
      deleteOnExit: false,
    }),
    GenericContainer.fromDockerfile(join(dockerDir, 'dropbear')).build('node-scp-test-dropbear', {
      deleteOnExit: false,
    }),
  ]);
  const network = await new Network().start();
  // One GenericContainer per server: its with* methods mutate shared create options, so
  // reusing one would give every server the last MODE.
  const sshd = (mode: string) =>
    new GenericContainer(OPENSSH_IMAGE)
      .withEnvironment({ MODE: mode })
      .withExposedPorts(22)
      .withWaitStrategy(Wait.forLogMessage(/Server listening/));
  const [full, sftpOnly, noSftp, dropbear] = await Promise.all([
    sshd('full').withNetwork(network).withNetworkAliases('openssh').start(),
    sshd('sftp-only').start(),
    sshd('no-sftp').start(),
    dropbearImage.withExposedPorts(22).withWaitStrategy(Wait.forListeningPorts()).start(),
  ]);
  const toxiproxy = await new ToxiProxyContainer('ghcr.io/shopify/toxiproxy:2.12.0')
    .withNetwork(network)
    .start();
  servers = { network, full, sftpOnly, noSftp, dropbear, toxiproxy };
});

afterAll(async () => {
  if (!servers) return;
  await Promise.all([
    servers.full.stop(),
    servers.sftpOnly.stop(),
    servers.noSftp.stop(),
    servers.dropbear.stop(),
    servers.toxiproxy.stop(),
  ]);
  await servers.network.stop();
});

describe('OpenSSH, full', () => {
  for (const protocol of ['sftp', 'scp'] as const) {
    defineTransferScenarios('openssh', protocol, () => ({
      connectOptions: options(servers.full),
      remoteBase: `node-scp-${protocol}`,
    }));
  }
});

describe('OpenSSH, SFTP only', () => {
  defineTransferScenarios('openssh sftp-only', 'sftp', () => ({
    connectOptions: options(servers.sftpOnly),
    remoteBase: 'node-scp-sftp-only',
  }));

  it('auto picks SFTP and scp mode says why it cannot work', async () => {
    const auto = await connect(options(servers.sftpOnly));
    expect(auto.protocol).toBe('sftp');
    await auto.close();
    const scp = await connect(options(servers.sftpOnly, { protocol: 'scp' }));
    const err = await scp.writeFile('x.txt', 'x').catch((e: unknown) => e);
    expect(isScpError(err, ErrorCode.ScpUnavailable)).toBe(true);
    await scp.close();
  });
});

describe('OpenSSH, SCP only', () => {
  defineTransferScenarios('openssh no-sftp', 'scp', () => ({
    connectOptions: options(servers.noSftp),
    remoteBase: 'node-scp-no-sftp',
  }));

  it('auto falls back to SCP', async () => {
    const client = await connect(options(servers.noSftp));
    expect(client.protocol).toBe('scp');
    await client.close();
  });
});

describe('Dropbear', () => {
  defineTransferScenarios('dropbear', 'scp', () => ({
    connectOptions: options(servers.dropbear),
    remoteBase: 'node-scp-dropbear',
  }));

  it('auto falls back to SCP', async () => {
    const client = await connect(options(servers.dropbear));
    expect(client.protocol).toBe('scp');
    await client.close();
  });
});

describe('unreliable networks (Toxiproxy)', () => {
  let proxy: CreatedProxy;
  let local: string;
  let payload: string;

  beforeAll(async () => {
    proxy = await servers.toxiproxy.createProxy({ name: 'openssh', upstream: 'openssh:22' });
    local = await mkdtemp(join(tmpdir(), 'node-scp-toxic-'));
    payload = join(local, 'payload.bin');
    await writeFile(payload, randomBytes(2 * 1024 * 1024));
  });

  afterAll(async () => {
    await rm(local, { recursive: true, force: true });
  });

  const through = (extra: Partial<ConnectOptions> = {}) => ({
    host: proxy.host,
    port: proxy.port,
    username: 'test',
    password: 'test',
    readyTimeout: 20_000,
    ...extra,
  });

  for (const protocol of ['sftp', 'scp'] as const) {
    it(`completes over a slow, high latency link [${protocol}]`, async () => {
      const latency = await proxy.instance.addToxic<{ latency: number; jitter: number }>({
        name: 'latency',
        type: 'latency',
        stream: 'downstream',
        toxicity: 1,
        attributes: { latency: 150, jitter: 50 },
      });
      try {
        const client = await connect(through({ protocol }));
        const result = await client.upload(payload, `toxic-${protocol}.bin`);
        expect(result.bytes).toBe(2 * 1024 * 1024);
        await client.close();
      } finally {
        await latency.remove();
      }
    });

    it(`fails instead of hanging when the peer resets mid transfer [${protocol}]`, async () => {
      const client = await connect(through({ protocol }));
      const bandwidth = await proxy.instance.addToxic<{ rate: number }>({
        name: 'bandwidth',
        type: 'bandwidth',
        stream: 'upstream',
        toxicity: 1,
        attributes: { rate: 64 },
      });
      try {
        const pending = client.upload(payload, `reset-${protocol}.bin`);
        await new Promise((r) => setTimeout(r, 1000));
        const reset = await proxy.instance.addToxic<{ timeout: number }>({
          name: 'reset',
          type: 'reset_peer',
          stream: 'upstream',
          toxicity: 1,
          attributes: { timeout: 0 },
        });
        const err = await pending.catch((e: unknown) => e);
        expect(isScpError(err)).toBe(true);
        await reset.remove();
      } finally {
        await bandwidth.remove().catch(() => undefined);
        await client.close();
      }
    });

    it(`aborts a throttled transfer promptly [${protocol}]`, async () => {
      const client = await connect(through({ protocol }));
      const bandwidth = await proxy.instance.addToxic<{ rate: number }>({
        name: 'bandwidth',
        type: 'bandwidth',
        stream: 'upstream',
        toxicity: 1,
        attributes: { rate: 32 },
      });
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 500);
        const started = Date.now();
        await expect(
          client.upload(payload, `abort-${protocol}.bin`, { signal: controller.signal }),
        ).rejects.toMatchObject({ code: ErrorCode.Aborted });
        expect(Date.now() - started).toBeLessThan(5000);
      } finally {
        await bandwidth.remove();
        await client.close();
      }
    });
  }
});