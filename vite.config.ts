import { defineConfig } from 'vitest/config';
import { youAudible } from './server/audible/plugin.ts';

const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://vpic.nhtsa.dot.gov; worker-src 'self' blob:; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; manifest-src 'self'";

export default defineConfig({
  // Relative paths so the built site works from any static host or folder.
  base: './',
  build: { target: 'es2022' },
  // Lets You connect to Audible while it runs on this computer (dev and preview only).
  plugins: [youAudible(), {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml: { order: 'pre', handler: () => [{
      tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend',
    }] },
  }],
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
