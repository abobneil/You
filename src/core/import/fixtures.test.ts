/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { emptyProfile, normalize } from '../profile';
import { addCard, setField } from '../cards';
import { contactRows, parseVcf } from './vcard';
import { linkedinRows, unzipCsvs } from './linkedin';
import { mediaRows } from './media';
import { streamingRows, streamingZip } from './streaming';
import { healthRows, parseHealth } from './health';
import { audibleRows } from './audible';
import { licenseRows, parseAamva } from './aamva';
import { applyProposals, findMatch, matchKey } from './match';
import { lookupVin, readVinResponse } from './vin';
import type { ImportResult, Proposal } from './types';
(globalThis as any).DOMParser = DOMParser;
const root = new URL('./fixtures/', import.meta.url);
const names = readdirSync(root).filter(n => n.endsWith('.json') && !n.endsWith('.expected.json'));
function parse(f: any): ImportResult {
  const zip = (files: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(files).map(([k,v]) => [k, strToU8(v)])));
  switch (f.parser) {
    case 'vin': { const info=readVinResponse(f.input); return info ? {rows:[{id:'vin',group:'Vehicle',label:'Vehicle',build:()=>[{area:'home',kind:'Vehicle',value:[info.year,info.make,info.model].join(' '),fields:{...info}}]}]} : {rows:[],notes:['Incomplete NHTSA response; manual input kept.']}; }
    case 'contacts': return contactRows(parseVcf(f.input));
    case 'linkedin': return linkedinRows(f.archive ? unzipCsvs(zip(f.input)) : f.input);
    case 'media': return mediaRows(f.archive ? unzipCsvs(zip({'diary.csv':f.input}))['diary.csv'] : f.input);
    case 'streaming': return streamingRows(f.archive ? streamingZip(f.nested ? zipSync({'nested.zip':zip(f.input)}) : zip(f.input)) : f.input);
    case 'health': return healthRows(parseHealth(f.input));
    case 'audible': return audibleRows(f.input);
    case 'licence': { const l = parseAamva(f.input); return l ? licenseRows(l) : {rows:[], notes:['Wrong code']}; }
    default: throw Error(f.parser);
  }
}
describe('inspectable synthetic source fixtures', () => {
  for (const name of names) it(name, () => {
    const f = JSON.parse(readFileSync(new URL(name, root), 'utf8'));
    const expected = JSON.parse(readFileSync(new URL(name.replace('.json','.expected.json'), root), 'utf8'));
    const result = parse(f);
    const ps = result.rows.flatMap(r => r.build(r.choice));
    expect(ps).toHaveLength(expected.cards.length);
    ps.forEach((p, i) => expect(p).toMatchObject(expected.cards[i]));
    const profile = emptyProfile();
    addCard(profile, {area:'goals',kind:'Goal',value:'Keep a synthetic record',since:'2020'});
    applyProposals(profile, ps, f.parser, '2026-11-01T00:00:00Z');
    const before = JSON.stringify(profile);
    applyProposals(profile, ps, f.parser, '2026-11-01T00:00:00Z');
    expect(JSON.stringify(profile)).toBe(before);
    const reopened = normalize(JSON.parse(before));
    expect(reopened.cards).toEqual(profile.cards);
    profile.cards.slice(1).forEach((c, i) => {
      expect(c.source?.from).toBe(f.parser);
      const {past, ...rest} = expected.cards[i];
      expect(c).toMatchObject(rest); if (past) expect(c.status).toBe('past');
    });
    if (!ps.length) expect(result.notes?.length).toBeGreaterThan(0);
  });
});
it('keeps international identities, Unicode titles, authors and explicit person decisions distinct', () => {
  expect(matchKey({area:'about',kind:'Phone',value:'+44 2071234567'})).not.toBe(matchKey({area:'about',kind:'Phone',value:'+1 2071234567'}));
  const p = emptyProfile();
  const c = addCard(p,{area:'people',kind:'Friend',value:'Élo 林',since:'',fields:{email:'elo@example.invalid'}});
  expect(findMatch(p,{area:'people',kind:'Friend',value:'Élo 林'})).toBeUndefined();
  expect(findMatch(p,{area:'people',kind:'Friend',value:'Another spelling',fields:{email:'ELO@example.invalid'}})?.id).toBe(c.id);
  expect(findMatch(p,{area:'people',kind:'Friend',value:'Élo 林',matchId:c.id})?.id).toBe(c.id);
  applyProposals(p,[{area:'interests',kind:'Book',value:'月',fields:{author:'One'}},{area:'interests',kind:'Book',value:'月',fields:{author:'Two'}}],'Fixture');
  expect(p.cards).toHaveLength(3);
});
it('snapshot sequence preserves revisions, corrections, clears and missing cards', () => {
  const p = emptyProfile();
  const proposal = (at: string, fields: Record<string,string>): Proposal => ({area:'interests',kind:'Book',value:'Fable',fields,sync:{source:'Fixture',id:'1',at}});
  const old = proposal('2020-01-01',{author:'Original',status:'Unknown',edition:'First'});
  applyProposals(p,[old,{...old,value:'Missing later',sync:{...old.sync!,id:'2'}}],'Fixture');
  const c=p.cards[0]; setField(p,c.id,'author','My correction'); setField(p,c.id,'edition','');
  applyProposals(p,[proposal('2022-01-01',{author:'Changed',status:'Read',edition:'Second'})],'Fixture');
  expect(c.fields).toMatchObject({author:'My correction',status:'Read'}); expect(c.fields?.edition).toBeUndefined();
  expect(c.revisions).toContainEqual(expect.objectContaining({field:'status',value:'Unknown'}));
  const before=JSON.stringify(p); applyProposals(p,[old],'Fixture'); expect(JSON.stringify(p)).toBe(before);
  expect(p.cards).toHaveLength(2);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('VIN rejects invalid input without a request, maps a fixture and aborts at ten seconds', async () => {
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({Results:[{ModelYear:'2020',Make:'FABLE',Model:'Moon',Trim:'X',FuelTypePrimary:'Electric'}]})});
  vi.stubGlobal('fetch',fetcher);
  expect(await lookupVin('invalid')).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  expect(await lookupVin('1FA00000000000001')).toEqual({year:'2020',make:'Fable',model:'Moon',trim:'X',fuel:'Electric'});
  vi.useFakeTimers();
  fetcher.mockImplementation((_url:any,o:any)=>new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  const pending=expect(lookupVin('1FA00000000000001')).rejects.toThrow('aborted');
  await vi.advanceTimersByTimeAsync(10000); await pending;
});
