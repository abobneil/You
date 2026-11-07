// Connecting to Audible the way the Audible iPhone app does: an Amazon sign-in with PKCE, then a
// device registration that returns a device key. Every API request is then signed with that key.
// Matches the pinned Python client (audible 0.13.1) so connections made by either keep working.
import { createHash, createPrivateKey, randomBytes, randomInt, sign, type KeyObject } from 'node:crypto';

export const DEVICE_TYPE = 'A2CZJZGLK2JJVM';
export const APP_VERSION = '4.60';
export const OS_VERSION = '26.2';
export const SOFTWARE_VERSION = '46000856';
const US = { countryCode: 'us', domain: 'com', marketplaceId: 'AF2M0KC94RCEA' };

/** What registration returns, stored as-is (same keys as the Python client's to_dict). */
export interface AudibleAuth {
  adp_token: string;
  device_private_key: string;
  access_token?: string | null;
  refresh_token?: string | null;
  expires?: number | null;
  website_cookies?: Record<string, string> | null;
  store_authentication_cookie?: unknown;
  device_info?: unknown;
  customer_info?: unknown;
  locale_code?: string | null;
  with_username?: boolean;
  activation_bytes?: string | null;
}

/** Sign-in started but not finished: the PKCE verifier (base64 of its ASCII) and device serial. */
export interface Pending { verifier: string; serial: string; created_at: number }

export class UserError extends Error { override name = 'UserError'; }

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 32 random bytes, base64url without padding, as the PKCE verifier. */
export const createVerifier = () => b64url(randomBytes(32));
export const challengeFor = (verifier: string) => b64url(createHash('sha256').update(verifier, 'ascii').digest());

export function deviceSerial(): string {
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 40 }, () => abc[randomInt(abc.length)]).join('');
}

export const clientId = (serial: string) => Buffer.from(`${serial}#${DEVICE_TYPE}`, 'utf8').toString('hex');

/** The Amazon sign-in page for a new device. The password and MFA are only ever typed there. */
export function signInUrl(verifier: string, serial: string): string {
  const params = new URLSearchParams({
    'openid.oa2.response_type': 'code',
    'openid.oa2.code_challenge_method': 'S256',
    'openid.oa2.code_challenge': challengeFor(verifier),
    'openid.return_to': `https://www.amazon.${US.domain}/ap/maplanding`,
    'openid.assoc_handle': `amzn_audible_ios_${US.countryCode}`,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    pageId: 'amzn_audible_ios',
    accountStatusPolicy: 'P1',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.mode': 'checkid_setup',
    'openid.ns.oa2': 'http://www.amazon.com/ap/ext/oauth/2',
    'openid.oa2.client_id': `device:${clientId(serial)}`,
    'openid.ns.pape': 'http://specs.openid.net/extensions/pape/1.0',
    marketPlaceId: US.marketplaceId,
    'openid.oa2.scope': 'device_auth_access',
    forceMobileLayout: 'true',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.pape.max_auth_age': '0',
  });
  return `https://www.amazon.${US.domain}/ap/signin?${params}`;
}

/** The one-time code from the address Amazon ends on. Anything else is refused. */
export function codeFromRedirect(redirect: string): string {
  let url: URL;
  try { url = new URL(redirect.trim()); } catch { throw new UserError('That isn’t a web address. Copy the whole address from the address bar.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.amazon.com' || url.pathname !== '/ap/maplanding') {
    throw new UserError('Expected the address Amazon ends on, starting with https://www.amazon.com/ap/maplanding');
  }
  const codes = url.searchParams.getAll('openid.oa2.authorization_code');
  if (codes.length !== 1 || !codes[0]) throw new UserError('That address has no sign-in code. Sign in again and copy the address of the last page.');
  return codes[0];
}

/** The body registration posts. Kept separate so it can be checked without the network. */
export function registrationBody(code: string, verifier: string, serial: string) {
  return {
    requested_token_type: ['bearer', 'mac_dms', 'website_cookies', 'store_authentication_cookie'],
    cookies: { website_cookies: [], domain: `.amazon.${US.domain}` },
    registration_data: {
      domain: 'Device', app_version: APP_VERSION, device_serial: serial, device_type: DEVICE_TYPE,
      device_name: '%FIRST_NAME%%FIRST_NAME_POSSESSIVE_STRING%%DUPE_STRATEGY_1ST%Audible for iPhone',
      os_version: OS_VERSION, software_version: SOFTWARE_VERSION, device_model: 'iPhone', app_name: 'Audible',
    },
    auth_data: { client_id: clientId(serial), authorization_code: code, code_verifier: verifier, code_algorithm: 'SHA-256', client_domain: 'DeviceLegacy' },
    requested_extensions: ['device_info', 'customer_info'],
  };
}

/** Turns registration's response into what we store. Throws without echoing the response. */
export function readRegistration(json: any, now = Date.now()): AudibleAuth {
  const ok = json?.response?.success;
  const tokens = ok?.tokens;
  if (!tokens?.mac_dms?.adp_token || !tokens?.mac_dms?.device_private_key) {
    throw new UserError('Amazon didn’t register the device. The sign-in code may have expired or been used; start again.');
  }
  const cookies = Array.isArray(tokens.website_cookies)
    ? Object.fromEntries(tokens.website_cookies.map((c: any) => [c.Name, String(c.Value).replace(/"/g, '')])) : null;
  return {
    website_cookies: cookies,
    adp_token: tokens.mac_dms.adp_token,
    access_token: tokens.bearer?.access_token ?? null,
    refresh_token: tokens.bearer?.refresh_token ?? null,
    device_private_key: tokens.mac_dms.device_private_key,
    store_authentication_cookie: tokens.store_authentication_cookie ?? null,
    device_info: ok.extensions?.device_info ?? null,
    customer_info: ok.extensions?.customer_info ?? null,
    expires: tokens.bearer?.expires_in ? now / 1000 + Number(tokens.bearer.expires_in) : null,
    locale_code: 'us', with_username: false, activation_bytes: null,
  };
}

/** Python's datetime.isoformat() + "Z", which is what the reference client signs. */
export function signingDate(d: Date): string {
  return `${d.toISOString().slice(0, 23)}000+00:00Z`;
}

export const loadKey = (pem: string): KeyObject => createPrivateKey(pem);

/** Headers that authenticate one request: RSA/SHA-256 over method, path+query, date, body and ADP token. */
export function signedHeaders(method: string, pathAndQuery: string, body: string, adpToken: string, key: KeyObject, now = new Date()) {
  const date = signingDate(now);
  const data = `${method}\n${pathAndQuery}\n${date}\n${body}\n${adpToken}`;
  const signature = sign('sha256', Buffer.from(data, 'utf8'), key).toString('base64');
  return { 'x-adp-token': adpToken, 'x-adp-alg': 'SHA256withRSA:1.0', 'x-adp-signature': `${signature}:${date}` };
}
