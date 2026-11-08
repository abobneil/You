import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { handle } from './plugin.ts';

export const PORT = 49631;
export function helperServer(appUrl: string) {
  const app = new URL(appUrl);
  if (app.protocol !== 'https:' && !(['127.0.0.1', 'localhost'].includes(app.hostname) && app.protocol === 'http:')) throw new Error('Configure an HTTPS app URL.');
  const origins = [app.origin]; // only the one app address configured or pasted
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

/** The app address if it's one the helper may trust (HTTPS, or plain HTTP on this computer), else null. */
export function appAddress(text: string): URL | null {
  let u: URL;
  try { u = new URL(text.trim()); } catch { return null; }
  if (u.protocol === 'https:' && u.hostname) return u;
  if (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname)) return u;
  return null;
}

/**
 * Asks for the You app address at startup. Nothing is trusted by default: an empty answer asks again,
 * anything that isn't a usable address gets a plain message and asks again, and a usable one is shown
 * back with a yes/no question before the helper will answer it.
 */
export async function pairAddress(ask: (question: string) => Promise<string>, say: (line: string) => void): Promise<string> {
  for (;;) {
    const answer = (await ask('Paste the You app address shown in your browser, then press Enter: ')).trim();
    if (!answer) { say('Nothing was pasted. Copy the address from your browser’s address bar (it starts with https://) and paste it here.'); continue; }
    const u = appAddress(answer);
    if (!u) {
      say(/^\w+:\/\//.test(answer) || /^[\w.-]+\.[a-z]{2,}/i.test(answer)
        ? `“${answer.slice(0, 80)}” can’t be used. The address must start with https:// (or be http://127.0.0.1 or http://localhost on this computer).`
        : `“${answer.slice(0, 80)}” isn’t a web address. Copy the address from your browser’s address bar and paste it here.`);
      continue;
    }
    say(`Address: ${u.origin}`);
    const ok = (await ask('Allow this address to use your Audible connection? (y/N) ')).trim().toLowerCase();
    if (ok === 'y' || ok === 'yes') return u.origin;
    say('Not allowed. Nothing was changed.');
  }
}
