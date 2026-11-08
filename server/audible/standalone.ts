import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { handle } from './plugin.ts';

export const PORT = 49631;
export function helperServer(appUrl: string) {
  const app = new URL(appUrl);
  if (app.protocol !== 'https:' && !(['127.0.0.1', 'localhost'].includes(app.hostname) && app.protocol === 'http:')) throw new Error('Configure an HTTPS app URL.');
  const origins = [app.origin, 'http://127.0.0.1:4173'];
  return createServer((req, res) => {
    const host = req.headers.host;
    const origin = req.headers.origin;
    if (![ `127.0.0.1:${PORT}`, `localhost:${PORT}` ].includes(host ?? '') || !origin || !origins.includes(origin)) {
      res.writeHead(403); res.end(); return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      const headers = (req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(x => x.trim());
      if (!['GET', 'POST'].includes(req.headers['access-control-request-method'] ?? '') || headers.some(x => !['content-type', 'x-you-local'].includes(x))) {
        res.writeHead(403); res.end(); return;
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-You-Local');
      res.writeHead(204); res.end(); return;
    }
    if (!req.url?.startsWith('/__you/audible/')) { res.writeHead(404); res.end(); return; }
    void handle(req, res, { port: PORT, origins });
  });
}

export function launch(appUrl: string) {
  const server = helperServer(appUrl);
  server.on('error', () => { console.error('The helper could not start. Another copy may already be running.'); process.exitCode = 1; });
  server.listen(PORT, '127.0.0.1', () => {
    console.log('You Audible helper is running. Keep this window open; close it to stop.');
    const cmd = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFile(cmd, process.platform === 'win32' ? ['url.dll,FileProtocolHandler', appUrl] : [appUrl], { windowsHide: true }, () => {});
  });
}
