import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe } from 'vitest';
import { type Harness, hasScpBinary, sftpServerPath, startHarness } from '../harness/server';
import { defineTransferScenarios } from '../scenarios';

describe.skipIf(!sftpServerPath || !hasScpBinary)('harness server', () => {
  let harness: Harness;
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'node-scp-root-'));
    harness = await startHarness({ root });
  });

  afterAll(async () => {
    await harness?.close();
    await rm(root, { recursive: true, force: true });
  });

  for (const protocol of ['sftp', 'scp'] as const) {
    defineTransferScenarios('harness', protocol, () => ({
      connectOptions: harness.connectOptions,
      remoteBase: join(root, `base-${protocol}`),
    }));
  }
});
