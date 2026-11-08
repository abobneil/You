import { expect, it } from 'vitest';
import { emptyProfile } from '../../profile';
import { setField } from '../../cards';
import { applyProposals, needsTimeReview } from '../match';
import { healthRows, parseHealth } from '../health';
import { linkedinRows, unzipCsvs } from '../linkedin';
import { readFileSync } from 'node:fs';
import type { Proposal } from '../types';
const sources = ['vcard','contacts-me','linkedin','goodreads','letterboxd','imdb','health','Netflix','Spotify','Apple Music','YouTube Music','audible'];
// Deterministic property-style sequences: every permutation of repeat/older/newer/manual/clear.
it.each(sources)('%s retains accepted values and a monotonic source snapshot', source => {
  const permutations = (xs: number[]): number[][] => xs.length ? xs.flatMap((x,i) => permutations(xs.filter((_,j) => i !== j)).map(rest => [x,...rest])) : [[]];
  for (const sequence of permutations([0,1,2,3,4])) {
    const profile = emptyProfile();
    const proposal = (n: number): Proposal => ({ area:'work',kind:'Job',value:'Role',fields:{location:'place'+n},past:n===2,until:n===2?'2019-03':'',sync:{source,id:'one',at:'202'+n} });
    applyProposals(profile,[proposal(1)],source);
    const card = profile.cards[0]; const accepted = new Set(['place1']); let newest = '2021';
    for (const operation of sequence) {
      if (operation >= 3) { const v = operation === 3 ? 'manual' : ''; setField(profile,card.id,'location',v); accepted.add(v); }
      else { const p = proposal(operation); applyProposals(profile,[p],source); newest = [newest,p.sync!.at].sort().at(-1)!; accepted.add(card.fields?.location ?? ''); }
      expect(card.imports?.[source].at).toBe(newest);
      const retained = [card.fields?.location ?? '',...card.revisions.filter(r=>r.field==='location').map(r=>r.value)];
      for (const value of accepted) if (value) expect(retained).toContain(value);
    }
  }
});
it('replays the cap archive without losing an accepted end date and matches title renames', () => {
  const profile = emptyProfile();
  const load = (name:string) => linkedinRows(unzipCsvs(new Uint8Array(readFileSync(new URL('./area-c/'+name,import.meta.url))))).rows.flatMap(r=>r.build());
  applyProposals(profile,load('linkedin-v1.zip'),'linkedin');
  applyProposals(profile,load('linkedin-v2.zip').map(p=>({...p,useIncoming:true})),'linkedin');
  const ended = profile.cards.find(c=>c.until==='2024-06');
  expect(ended?.status).toBe('past');
  applyProposals(profile,load('linkedin-v1.zip'),'linkedin');
  expect(ended?.until).toBe('2024-06');
  const p = load('linkedin-v2.zip').find(p=>p.until==='2024-06')!;
  applyProposals(profile,[{...p,value:'Renamed role',useIncoming:true,sync:{...p.sync!,at:'2027'}}],'linkedin');
  expect(ended?.value).toBe('Renamed role');
  expect(ended?.revisions.some(r=>r.value.includes('Helper'))).toBe(true);
});
it('requires explicit acceptance for undated differences',()=>{
 const profile=emptyProfile(); const p:Proposal={area:'people',kind:'Friend',value:'Pat',fields:{phone:'123'},sync:{source:'vcard',id:'pat',at:''}};
 applyProposals(profile,[p],'vcard'); const next={...p,fields:{phone:'456'}};
 expect(needsTimeReview(profile.cards[0],next)).toBe(true);
 applyProposals(profile,[next],'vcard');expect(profile.cards[0].fields?.phone).toBe('123');
 applyProposals(profile,[{...next,useIncoming:true}],'vcard');expect(profile.cards[0].fields?.phone).toBe('456');
});

it('ends stopped FHIR medication with source time and preserves omission reasons',()=>{
 const resource=(status:string,time:string)=>JSON.stringify({resourceType:'MedicationStatement',id:'med1',meta:{lastUpdated:time},status,medicationCodeableConcept:{text:'Example'},effectivePeriod:{start:'2018-05',...(status==='completed'?{end:'2024-06'}:{})}});
 const profile=emptyProfile();
 const load=(status:string,time:string)=>healthRows(parseHealth(resource(status,time))).rows.flatMap(r=>r.build());
 applyProposals(profile,load('active','2020-01-01'),'health');
 applyProposals(profile,load('completed','2024-07-01'),'health');
 expect(profile.cards[0]).toMatchObject({status:'past',until:'2024-06'});
 applyProposals(profile,load('active','2020-01-01'),'health');
 expect(profile.cards[0].until).toBe('2024-06');
 expect(healthRows(parseHealth(resource('not-taken','2024-07-01'))).notes?.join()).toContain('skipped');
});

// Explicit acceptance advances the baseline independently of the source clock.
it.each(sources)('%s: accepted undated/equal snapshots never stall subsequent updates', source => {
 for (const at of ['', '2024']) {
  const profile = emptyProfile();
  const make = (n:number, time=at):Proposal => ({area:'work',kind:'Job',value:['Maker','Senior Maker','Lead Maker','Principal Maker'][n],since:['2018-05','2017-03','2016','2015'][n],fields:{location:'place'+n},sync:{source,id:'stable',at:time}});
  applyProposals(profile,[make(0)],source);
  for (const n of [1,2,3]) {
   const p=make(n,n===3?'2027':at); const c=profile.cards[0];
   if(n<3) { expect(needsTimeReview(c,p)).toBe(true); applyProposals(profile,[p],source); expect(c.value).toBe(make(n-1).value); }
   applyProposals(profile,[{...p,useIncoming:needsTimeReview(c,p)}],source);
   expect(c.value).toBe(p.value);expect(c.since).toBe(p.since);expect(c.fields?.location).toBe('place'+n);
   expect(c.imports?.[source].fields.$value).toBe(p.value);
   for(let i=0;i<n;i++) expect(c.revisions.map(r=>r.value)).toContain(make(i).value);
  }
  const c=profile.cards[0];setField(profile,c.id,'location','');
  applyProposals(profile,[{...make(3,'2028'),fields:{location:'incoming'}}],source);
  expect(c.fields?.location ?? '').toBe('');
 }
});
