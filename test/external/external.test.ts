import { readFileSync } from 'node:fs';
import { describe } from 'vitest';
import type { ActiveProtocol, ConnectOptions, RemoteOs } from '../../src/index';
import { defineTransferScenarios } from '../scenarios';

/**
 * Runs the portable scenarios against any reachable server, for example a router, a Windows
 * OpenSSH host or a container you started yourself:
 *
 *   NODE_SCP_TEST_HOST=192.168.1.1 NODE_SCP_TEST_USER=root NODE_SCP_TEST_PASSWORD=secret \
 *   NODE_SCP_TEST_PROTOCOLS=scp pnpm test:external
 */
const env = process.env;
const host = env.NODE_SCP_TEST_HOST;

function options(): ConnectOptions {
  const result: ConnectOptions = {
    host: host!,
    port: Number(env.NODE_SCP_TEST_PORT ?? 22),
    username: env.NODE_SCP_TEST_USER ?? 'test',
    readyTimeout: 20_000,
  };
  if (env.NODE_SCP_TEST_PASSWORD) result.password = env.NODE_SCP_TEST_PASSWORD;
  if (env.NODE_SCP_TEST_KEY) result.privateKey = readFileSync(env.NODE_SCP_TEST_KEY);
  if (env.NODE_SCP_TEST_REMOTE_OS) result.remoteOs = env.NODE_SCP_TEST_REMOTE_OS as RemoteOs;
  return result;
}

const protocols = (env.NODE_SCP_TEST_PROTOCOLS ?? 'sftp,scp')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean) as ActiveProtocol[];
const base = env.NODE_SCP_TEST_REMOTE_BASE ?? `node-scp-test-${Date.now()}`;

describe.skipIf(!host)(`external server ${host ?? '(NODE_SCP_TEST_HOST not set)'}`, () => {
  for (const protocol of protocols) {
    defineTransferScenarios(`external ${host}`, protocol, () => ({
      connectOptions: options(),
      remoteBase: `${base}-${protocol}`,
    }));
  }
});
