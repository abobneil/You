// The only network code. Talks to Amazon (sign-in/registration) and Audible's API, nothing else.
//
// Some networks close TLS connections to api.audible.com before any HTTP happens. Audible's DNS
// points that name at a CloudFront distribution, which answers fine when asked directly with the
// original Host header. "auto" tries the normal route first and switches to that one only if the
// connection itself fails. Certificates are always verified; nothing about the machine is changed.
import { promises as dns } from 'node:dns';
import { request } from 'node:https';
import type { KeyObject } from 'node:crypto';
import { loadKey, signedHeaders, type AudibleAuth } from './auth.ts';
import { HttpError, NetworkError, type Client, type Params } from './library.ts';

const API_HOST = 'api.audible.com';
const CLOUDFRONT = /^d[a-z0-9]+\.cloudfront\.net$/;
export type Route = 'auto' | 'direct' | 'cloudfront';

interface Raw { status: number; body: string }

/** One HTTPS request. `connectHost` lets the request go to a CDN name while keeping Host. */
function send(method: string, host: string, path: string, headers: Record<string, string>, body = '', connectHost = host, timeoutMs = 30_000): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = request({ method, host: connectHost, servername: connectHost, path, headers: { ...headers, Host: host }, timeout: timeoutMs }, res => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', () => reject(new NetworkError('The response was cut off')));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    // Errors here can carry socket details but never response content; keep only a generic message.
    req.on('error', () => reject(new NetworkError(`Couldn’t connect to ${host}`)));
    if (body) req.write(body);
    req.end();
  });
}

/** Audible's published CloudFront name for api.audible.com, verified to look like one. */
export async function cloudfrontHost(resolveCname: (h: string) => Promise<string[]> = dns.resolveCname): Promise<string> {
  let name = API_HOST;
  for (let hop = 0; hop < 5; hop++) {
    let next: string[];
    try { next = await resolveCname(name); } catch { break; }
    if (!next.length) break;
    name = next[0].replace(/\.$/, '').toLowerCase();
    if (CLOUDFRONT.test(name)) return name;
  }
  throw new NetworkError('Audible’s DNS didn’t point to the expected CloudFront address');
}

/** POST JSON or a form to Amazon's auth API. */
export async function postAmazon(path: string, payload: unknown, form = false): Promise<{ status: number; json: any }> {
  const body = form ? new URLSearchParams(payload as Record<string, string>).toString() : JSON.stringify(payload);
  const res = await send('POST', 'api.amazon.com', path, {
    'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json', Accept: 'application/json',
    'Content-Length': String(Buffer.byteLength(body)),
  }, body);
  let json: any = null;
  try { json = JSON.parse(res.body); } catch { /* left null */ }
  return { status: res.status, json };
}

/** A signed, read-only Audible API client. */
export class AudibleClient implements Client {
  private key: KeyObject;
  private adp: string;
  route: Route;
  private cdn?: string;

  constructor(auth: AudibleAuth, route: Route = 'auto') {
    if (!auth.adp_token || !auth.device_private_key) throw new Error('The saved Audible connection is incomplete; connect again.');
    this.key = loadKey(auth.device_private_key);
    this.adp = auth.adp_token;
    this.route = route;
  }

  async get(path: string, params: Params = {}): Promise<unknown> {
    const query = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)])).toString();
    const full = `/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
    const res = await this.withRoute(connectHost => send('GET', API_HOST, full, {
      Accept: 'application/json', 'Accept-Charset': 'utf-8', 'Content-Type': 'application/json',
      ...signedHeaders('GET', full, '', this.adp, this.key),
    }, '', connectHost));
    if (res.status < 200 || res.status >= 300) throw new HttpError(res.status);
    try { return JSON.parse(res.body); } catch { throw new HttpError(res.status); }
  }

  /** Tries the normal route; if the connection itself fails, uses the CloudFront route from then on. */
  private async withRoute(go: (connectHost: string) => Promise<Raw>): Promise<Raw> {
    if (this.route === 'cloudfront') return go(this.cdn ??= await cloudfrontHost());
    try {
      return await go(API_HOST);
    } catch (e) {
      if (this.route === 'direct' || !(e instanceof NetworkError)) throw e;
      this.cdn = await cloudfrontHost();
      this.route = 'cloudfront';
      return go(this.cdn);
    }
  }
}
