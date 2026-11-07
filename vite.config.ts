import { defineConfig } from 'vitest/config';
import { youAudible } from './server/audible/plugin.ts';

export default defineConfig({
  // Relative paths so the built site works from any static host or folder.
  base: './',
  build: { target: 'es2022' },
  // Lets You connect to Audible while it runs on this computer (dev and preview only).
  plugins: [youAudible()],
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
