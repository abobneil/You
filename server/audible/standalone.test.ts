import { expect, it } from 'vitest';
import { helperServer } from './standalone';
import { request } from 'node:http';
it('allows only the configured origin, excluding the development fallback', async () => {
 const server = helperServer('https://you.example'); await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
 const port = (server.address() as import('node:net').AddressInfo).port;
 const check = (origin: string) => new Promise<number>(resolve => { const req = request({hostname:'127.0.0.1',port,method:'OPTIONS',path:'/__you/audible/status',headers:{Host:'127.0.0.1:49631',Origin:origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'X-You-Local'}},res => {res.resume();resolve(res.statusCode!);});req.end(); });
 try { expect(await check('https://you.example')).toBe(204); expect(await check('http://127.0.0.1:4173')).toBe(403); } finally { await new Promise<void>(r=>server.close(()=>r())); }
});
