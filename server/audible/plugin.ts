// While You runs on this computer (npm run dev / npm run preview), the page can connect to Audible
// through these local endpoints. A published copy of You is plain static files and has none of
// this; the page then offers the file import instead.
//
// Requests must come from You itself: a localhost Host header (no DNS rebinding), a same-origin
// fetch, and a custom header that cross-site pages can't send without a CORS preflight, which is
// never granted. Responses never contain credentials.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { disconnect, exportLibrary, finishSignIn, safeMessage, startSignIn, status } from './service.ts';

const BASE = '/__you/audible/';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function allowed(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site'];
  return LOCAL.test(req.headers.host ?? '') && req.headers['x-you-local'] === '1' && (!site || site === 'same-origin');
}

function reply(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit = 16_384): Promise<any> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (!allowed(req)) return reply(res, 403, { error: 'Not allowed.' });
  const action = (req.url ?? '').slice(BASE.length).split('?')[0];
  try {
    if (req.method === 'GET' && action === 'status') return reply(res, 200, await status());
    if (req.method !== 'POST') return reply(res, 405, { error: 'Not allowed.' });
    const body = await readJson(req);
    switch (action) {
      case 'sign-in': return reply(res, 200, { url: await startSignIn() });
      case 'finish': await finishSignIn(String(body.redirect ?? '')); return reply(res, 200, { ok: true });
      case 'export': return reply(res, 200, await exportLibrary({ activeOnly: !!body.activeOnly }));
      case 'disconnect': await disconnect(); return reply(res, 200, { ok: true });
      default: return reply(res, 404, { error: 'Unknown action.' });
    }
  } catch (e) {
    return reply(res, 400, { error: safeMessage(e) });
  }
}

export function youAudible(): Plugin {
  // Returns nothing: a function returned from configureServer would run as a late hook.
  const mount = (server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => unknown } }): void => {
    server.middlewares.use(BASE, (req, res) => {
      // connect strips the mount path; put it back so `handle` sees the full URL.
      req.url = BASE + (req.url ?? '').replace(/^\//, '');
      void handle(req, res);
    });
  };
  return { name: 'you-audible', configureServer: mount, configurePreviewServer: mount };
}
