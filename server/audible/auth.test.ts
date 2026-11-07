import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { challengeFor, clientId, codeFromRedirect, createVerifier, deviceSerial, readRegistration, registrationBody, signedHeaders, signingDate, signInUrl } from './auth.ts';
import { cloudfrontHost } from './http.ts';

describe('Audible sign-in', () => {
  it('makes PKCE values the way Amazon expects', () => {
    const v = createVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Value from the Python client (audible 0.13.1): create_s256_code_challenge.
    expect(challengeFor('dBjftJeZ4CVP-mJ92K9qAzCovRhOPSWmGOyLM4tjWXk')).toBe('liXcDhiTEW4PpyloDMoS7wK2fspPHYBjvCCUnB3wTlo');
    expect(deviceSerial()).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(clientId('abc')).toBe(Buffer.from('abc#A2CZJZGLK2JJVM').toString('hex'));
  });

  it('builds exactly the sign-in address the Python client builds', () => {
    // build_oauth_url('us', 'com', 'AF2M0KC94RCEA', b'testverifier…', 'SERIAL…1234') from audible 0.13.1.
    const python = 'https://www.amazon.com/ap/signin?openid.oa2.response_type=code&openid.oa2.code_challenge_method=S256&openid.oa2.code_challenge=_OddNLcmYuqVgfJRCWk_UPtTdoMEU48xwNjBrgIWZ0s&openid.return_to=https%3A%2F%2Fwww.amazon.com%2Fap%2Fmaplanding&openid.assoc_handle=amzn_audible_ios_us&openid.identity=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&pageId=amzn_audible_ios&accountStatusPolicy=P1&openid.claimed_id=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0%2Fidentifier_select&openid.mode=checkid_setup&openid.ns.oa2=http%3A%2F%2Fwww.amazon.com%2Fap%2Fext%2Foauth%2F2&openid.oa2.client_id=device%3A53455249414c53455249414c53455249414c53455249414c53455249414c53455249414c31323334234132435a4a5a474c4b324a4a564d&openid.ns.pape=http%3A%2F%2Fspecs.openid.net%2Fextensions%2Fpape%2F1.0&marketPlaceId=AF2M0KC94RCEA&openid.oa2.scope=device_auth_access&forceMobileLayout=true&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.pape.max_auth_age=0';
    expect(signInUrl('testverifierABCDEFGHIJKLMNOPQRSTUVWXYZ0123456', 'SERIALSERIALSERIALSERIALSERIALSERIAL1234')).toBe(python);
  });

  it('builds the iPhone-app sign-in address', () => {
    const url = new URL(signInUrl('verifier', 'SERIAL'));
    expect(url.origin + url.pathname).toBe('https://www.amazon.com/ap/signin');
    expect(url.searchParams.get('openid.oa2.client_id')).toBe(`device:${clientId('SERIAL')}`);
    expect(url.searchParams.get('openid.return_to')).toBe('https://www.amazon.com/ap/maplanding');
    expect(url.searchParams.get('openid.assoc_handle')).toBe('amzn_audible_ios_us');
    expect(url.searchParams.get('marketPlaceId')).toBe('AF2M0KC94RCEA');
    expect(url.searchParams.get('openid.oa2.code_challenge')).toBe(challengeFor('verifier'));
  });

  it('takes the code only from Amazon’s landing address', () => {
    expect(codeFromRedirect('https://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=ABC&x=1')).toBe('ABC');
    expect(() => codeFromRedirect('https://evil.example/ap/maplanding?openid.oa2.authorization_code=ABC')).toThrow(/maplanding/);
    expect(() => codeFromRedirect('http://www.amazon.com/ap/maplanding?openid.oa2.authorization_code=ABC')).toThrow();
    expect(() => codeFromRedirect('https://www.amazon.com/ap/maplanding')).toThrow(/no sign-in code/);
    expect(() => codeFromRedirect('not a url')).toThrow(/web address/);
  });

  it('registers as an Audible iPhone device and keeps what the Python client kept', () => {
    const body = registrationBody('CODE', 'VERIFIER', 'SERIAL');
    expect(body.auth_data).toMatchObject({ authorization_code: 'CODE', code_verifier: 'VERIFIER', client_domain: 'DeviceLegacy', client_id: clientId('SERIAL') });
    expect(body.registration_data).toMatchObject({ device_type: 'A2CZJZGLK2JJVM', device_serial: 'SERIAL', app_name: 'Audible' });
    const auth = readRegistration({ response: { success: {
      tokens: { mac_dms: { adp_token: 'ADP', device_private_key: 'KEY' }, bearer: { access_token: 'AT', refresh_token: 'RT', expires_in: '3600' },
        website_cookies: [{ Name: 'session-id', Value: '"1"' }] },
      extensions: { device_info: { device_name: 'x' }, customer_info: { name: 'y' } } } } }, 1_000_000);
    expect(auth).toMatchObject({ adp_token: 'ADP', device_private_key: 'KEY', refresh_token: 'RT', expires: 4600, locale_code: 'us', website_cookies: { 'session-id': '1' } });
    expect(() => readRegistration({ response: { error: {} } })).toThrow(/didn’t register/);
  });
});

describe('signed requests', () => {
  it('signs method, path, date, body and ADP token with RSA/SHA-256', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const now = new Date('2026-11-07T15:41:55.793Z');
    const h = signedHeaders('GET', '/1.0/library?page=1', '', 'ADP', privateKey, now);
    expect(h['x-adp-alg']).toBe('SHA256withRSA:1.0');
    expect(h['x-adp-token']).toBe('ADP');
    const [sig, date] = [h['x-adp-signature'].slice(0, h['x-adp-signature'].indexOf(':')), h['x-adp-signature'].slice(h['x-adp-signature'].indexOf(':') + 1)];
    expect(date).toBe('2026-11-07T15:41:55.793000+00:00Z');
    expect(signingDate(now)).toBe(date);
    const data = Buffer.from(`GET\n/1.0/library?page=1\n${date}\n\nADP`);
    expect(verify('sha256', data, createPublicKey(privateKey), Buffer.from(sig, 'base64'))).toBe(true);
  });

  it('finds Audible’s CloudFront name through the DNS chain, and refuses anything else', async () => {
    expect(await cloudfrontHost(async h => (h === 'api.audible.com' ? ['d1abc.cloudfront.net.'] : []))).toBe('d1abc.cloudfront.net');
    expect(await cloudfrontHost(async h => (h === 'api.audible.com' ? ['api.audible.com.edgekey.net'] : ['d9xyz.cloudfront.net']))).toBe('d9xyz.cloudfront.net');
    await expect(cloudfrontHost(async () => ['evil.example.com'])).rejects.toThrow(/CloudFront/);
  });
});
