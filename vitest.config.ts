import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    benchmark: { include: [] },
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'html', 'lcov'],
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'docker',
          include: ['test/docker/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 300_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'bench',
          include: [],
          benchmark: { include: ['bench/**/*.bench.ts'] },
          testTimeout: 600_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'external',
          include: ['test/external/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
