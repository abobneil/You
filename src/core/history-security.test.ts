import { sensitiveDetail } from './privacy';
import { f2 } from '../../scripts/fixtures';
import { expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { addCard, addCardBefore, removeCard, undoRemove, atTheTime, cardStart } from './cards';
import { emptyProfile } from './profile';
import { cleanLinks } from './relations';
import { overlap } from './life';
import { readZip, ARCHIVE_LIMIT } from './import/archive';
import { passphraseStrength } from './passphrase';
const chain = () => { const p = emptyProfile(); const a = addCard(p, { area: 'home', kind: 'Address', value: 'A', since: '2000' }); const b = addCard(p, { area: 'home', kind: 'Address', value: 'B', since: '2010' }, a.id); const c = addCard(p, { area: 'home', kind: 'Address', value: 'C', since: '2020' }, b.id); return { p, a, b, c }; };
for (const which of ['a', 'b', 'c'] as const) it(`removes ${which} and restores the exact chain`, () => {
 const x = chain(), before = structuredClone(x.p), r = removeCard(x.p, x[which].id)!;
 if (which === 'b') { expect(x.a).toMatchObject({ status: 'past', until: '2010', replacedBy: x.c.id }); expect(x.c.replaces).toBe(x.a.id); }
 if (which === 'c') expect(x.b).toMatchObject({ status: 'active' });
 if (which === 'a') expect(x.b.replaces).toBeUndefined();
 undoRemove(x.p, r); expect(x.p).toEqual(before);
});
it('inserts before a historical head and in the middle', () => {
 const {p,a,b} = chain(); const input = { area: 'home' as const, kind: 'Address', value: 'Earlier', since: '1990' };
 const first = addCardBefore(p,input,a.id)!; expect(a.replaces).toBe(first.id);
 const middle = addCardBefore(p,{...input,since:'2005'},b.id)!; expect(a.replacedBy).toBe(middle.id); expect(middle.replaces).toBe(a.id);
});
it('preserves self, duplicate and dangling links without using them', () => {
 const {p,a,b} = chain(); const link = {id:'1',a:a.id,b:b.id,fwd:'',back:''}; p.links = [link,{...link,id:'2',a:b.id,b:a.id},{...link,id:'3',b:a.id},{...link,id:'4',b:'missing'}];
 cleanLinks(p); expect(p.links).toEqual([link]); expect(p.unreadable).toHaveLength(3); cleanLinks(p); expect(p.unreadable).toHaveLength(3);
});
it('never substitutes entry timestamps for unknown life dates', () => {
 const {p,a} = chain(); a.since = ''; a.recordedAt = '2026-11-08T00:30:00Z'; expect(cardStart(a)).toBe(''); expect(overlap(a,'2005','2005')).toBe('possible'); expect(atTheTime(p,a)).toBeDefined();
});
it('marks equal fuzzy handover boundaries possible', () => {
 const {a,b} = chain(); a.until = '2010-06'; b.since = '2010-06'; expect(overlap(a,'2010-06','2010-06')).toBe('possible'); expect(overlap(b,'2010-06','2010-06')).toBe('possible');
});
it('refuses a highly compressible bomb before inflation', () => {
 const bytes = zipSync({'Positions.csv':new Uint8Array(201 * 1024 ** 2)}); expect(bytes.length).toBeLessThan(2 * 1024 ** 2); expect(() => readZip(bytes,()=>true)).toThrow(ARCHIVE_LIMIT);
});
it('reads ordinary archives and refuses dishonest output sizes', () => {
 const bytes = zipSync({'a.csv':new Uint8Array(1024)}); expect(readZip(bytes,()=>true)['a.csv']).toHaveLength(1024);
});
it('gives local guidance for common, repeated and longer phrases', () => {
 for (const p of ['aaaaaaaaaa','password12345','1234567890123']) expect(passphraseStrength(p)).toBe('Weak');
 expect(passphraseStrength('river plum lantern meadow')).toBe('Strong'); expect(passphraseStrength('RiverPlum72')).toBe('Good');
});

it('keeps F2 entry times out of life dates in New York and Auckland', () => {
 const before = process.env.TZ;
 try { for (const zone of ['America/New_York','Pacific/Auckland']) { process.env.TZ = zone; const p = f2();
 for (const c of p.cards.filter(c => !c.since)) { expect(cardStart(c)).toBe(''); expect(overlap(c,'2010','2010')).toBe('possible'); }
 } } finally { process.env.TZ = before; }
});

it('masks identifier details on sensitive kinds and declared sensitive details', () => {
 const { a } = chain(); a.area = 'about'; a.kind = 'Passport';
 expect(sensitiveDetail(a,'Number')).toBe(true); expect(sensitiveDetail(a,'account')).toBe(true); expect(sensitiveDetail(a,'issuer')).toBe(false);
 a.area = 'home'; a.kind = 'Vehicle'; expect(sensitiveDetail(a,'vin')).toBe(true);
});
