import { expect, it } from 'vitest';
import { helperServer } from './standalone';
import { request } from 'node:http';
it('allows only the configured origin, excluding the development fallback', async () => {
 const server = helperServer('https://you.example'); await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
 const port = (server.address() as import('node:net').AddressInfo).port;
 const check = (origin: string) => new Promise<number>(resolve => { const req = request({hostname:'127.0.0.1',port,method:'OPTIONS',path:'/__you/audible/status',headers:{Host:'127.0.0.1:49631',Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'X-You-Local'}},res => {res.resume();resolve(res.statusCode!);});req.end(); });
 try { expect(await check('https://you.example')).toBe(204); expect(await check('http://127.0.0.1:4173')).toBe(403); } finally { await new Promise<void>(r=>server.close(()=>r())); }
});

import { appAddress, pairAddress } from './standalone';
it('pairing never trusts an empty answer, explains junk, and asks before allowing an address', async () => {
  const run = async (answers: string[]) => {
    const said: string[] = [], asked: string[] = [];
    const url = await pairAddress(async q => { asked.push(q); const a = answers.shift(); if (a === undefined) throw new Error('ran out'); return a; }, l => said.push(l));
    return { url, said, asked };
  };
  const r = await run(['', 'not an address', 'ftp://x.example', 'http://evil.example', 'https://you.example/app', 'n', 'https://you.example/app', 'y']);
  expect(r.url).toBe('https://you.example');
  expect(r.said[0]).toMatch(/Nothing was pasted/);
  expect(r.said[1]).toMatch(/isn’t a web address/);
  expect(r.said[2]).toMatch(/must start with https/);
  expect(r.said[3]).toMatch(/must start with https/);
  expect(r.said).toContain('Address: https://you.example');
  expect(r.asked.filter(q => q.includes('(y/N)'))).toHaveLength(2);
  expect(r.said.join('\n')).not.toMatch(/at \w+ \(|Error/);
  await expect(run([''])).rejects.toThrow('ran out'); // empty never falls back to a default
  expect(appAddress('http://127.0.0.1:4173')?.origin).toBe('http://127.0.0.1:4173');
});
