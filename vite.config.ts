import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths so the built site works from any static host or folder.
  base: './',
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'] },
});
