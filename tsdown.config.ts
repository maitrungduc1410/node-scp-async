import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      legacy: 'src/legacy/index.ts',
      scp2: 'src/scp2/index.ts',
    },
    format: ['esm', 'cjs'],
    platform: 'node',
    target: 'node20',
    dts: true,
    sourcemap: false,
    clean: true,
    outputOptions: { exports: 'named' },
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    dts: false,
    sourcemap: false,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
