import { defineConfig } from 'vitest/config';
import { offlineShell } from './docs/offline';
import { youAudible } from './server/audible/plugin.ts';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self' https://vpic.nhtsa.dot.gov http://127.0.0.1:49631; worker-src 'self' blob:; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; manifest-src 'self'";

export default defineConfig({
  // Relative paths so the built site works from any static host or folder.
  base: './',
  build: { target: 'es2022' },
  // Lets You connect to Audible while it runs on this computer (dev and preview only).
  plugins: [youAudible(), offlineShell(), {
    // Under `npm run dev`, /downloads/* (the Audible helper) would otherwise fall back to the app page,
    // which then saves as a broken .exe. Serve the files `npm run build` made, or say plainly they're missing.
    name: 'dev-downloads',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/downloads/', (req, res) => {
        const file = join('dist', 'downloads', basename(decodeURIComponent((req.url || '').split('?')[0])));
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('The Audible helper is made by "npm run build". Run it once, then download again.');
          return;
        }
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', String(statSync(file).size));
        res.setHeader('Content-Disposition', `attachment; filename="${basename(file)}"`);
        createReadStream(file).pipe(res);
      });
    },
  }, {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml: { order: 'pre', handler: () => [{
      tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend',
    }] },
  }],
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'docs/**/*.test.ts'] },
});

