import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/shared/vitest.config.ts',
      'packages/fetcher/vitest.config.ts',
      'packages/server/vitest.config.ts',
      'packages/e2e/vitest.config.ts',
    ],
  },
});
