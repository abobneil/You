// Local API boundary shared by the Vite integration and standalone loopback helper.
// Vite is same-origin only; standalone grants exact configured app-origin CORS.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { disconnect, exportLibrary, finishSignIn, safeMessage, startSignIn, status } from './service.ts';

const BASE = '/__you/audible/';
export interface Policy { origins?: string[]; port?: number }
export function allowed(req: IncomingMessage, policy: Policy = {}): boolean {
  const port = policy.port ?? req.socket.localPort;
  const host = req.headers.host ?? '';
  if (!port || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) return false;
  const origin = req.headers.origin;
  const expected = policy.origins ?? [`http://${host}`];
  if (origin ? !expected.includes(origin) : req.method !== 'GET') return false;
  const site = req.headers['sec-fetch-site'];
  // Remote static apps necessarily produce cross-site fetch metadata. Only the standalone
  // server grants this exception, after checking an exact configured Origin and preflight.
  const remote = !!policy.origins && !!origin && expected.includes(origin);
  if (site ? site !== 'same-origin' && !(remote && (site === 'cross-site' || site === 'same-site')) : req.method !== 'GET') return false;
  return req.headers['x-you-local'] === '1';
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

export async function handle(req: IncomingMessage, res: ServerResponse, policy: Policy = {}) {
  if (!allowed(req, policy)) return reply(res, 403, { error: 'Not allowed.' });
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
    console.warn('[you/audible] request failed; credentials and provider diagnostics withheld.');
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
