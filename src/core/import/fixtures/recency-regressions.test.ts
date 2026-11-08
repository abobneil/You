import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { zipSync, strToU8 } from 'fflate';
import { emptyProfile } from '../../profile';
import { applyProposals, needsTimeReview } from '../match';
import { contactRows, parseVcf } from '../vcard';
import { linkedinRows, unzipCsvs } from '../linkedin';
import { mediaRows } from '../media';
import { healthRows, parseHealth } from '../health';
import { streamingRows, streamingZip } from '../streaming';
import { audibleRows } from '../audible';
(globalThis as any).DOMParser = DOMParser;
const variants = ['vcard-3.0','vcard-4.0','linkedin-full-zip','linkedin-positions','linkedin-education','linkedin-profile','linkedin-skills','goodreads','letterboxd','letterboxd-zip','imdb','ccda','fhir-bundle','fhir-ndjson','netflix','netflix-zip','spotify-account','spotify-extended','apple-nested','youtube-music','audible-export','audible-sync'];
it.each(variants)('%s: parsed source applies, repeats, and advances accepted snapshots without loss', name => {
 const f=JSON.parse(readFileSync(new URL('./'+name+'.json',import.meta.url),'utf8'));
 const expected=JSON.parse(readFileSync(new URL('./'+name+'.expected.json',import.meta.url),'utf8'));
 const zip=(files:Record<string,string>)=>zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])));
 const result= f.parser==='contacts'?contactRows(parseVcf(f.input)):
 f.parser==='linkedin'?linkedinRows(f.archive?unzipCsvs(zip(f.input)):f.input):
 f.parser==='media'?mediaRows(f.archive?unzipCsvs(zip({'diary.csv':f.input}))['diary.csv']:f.input):
 f.parser==='health'?healthRows(parseHealth(f.input)):
 f.parser==='audible'?audibleRows(f.input):streamingRows(f.archive?streamingZip(f.nested?zipSync({'nested.zip':zip(f.input)}):zip(f.input)):f.input);
 const ps=result.rows.flatMap(r=>r.build(r.choice));
 expect(ps).toHaveLength(expected.cards.length);
 const profile=emptyProfile();applyProposals(profile,ps,name);
 expect(profile.cards).toHaveLength(ps.length);
 const before=JSON.stringify(profile);applyProposals(profile,ps,name);expect(JSON.stringify(profile)).toBe(before);
 for(const original of ps) {
  if(!original.sync) continue;
  for(const n of [1,2,3]) {
   const p={...original,fields:{...original.fields,regression:'accepted'+n},sync:{...original.sync,at:''}};
   const card=profile.cards.find(c=>c.imports?.[p.sync.source]?.id===p.sync.id)!;
   expect(needsTimeReview(card,p)).toBe(true);
   applyProposals(profile,[p],name);expect(card.fields?.regression).not.toBe('accepted'+n);
   applyProposals(profile,[{...p,useIncoming:true}],name);expect(card.fields?.regression).toBe('accepted'+n);
   if(n>1) expect(card.revisions.map(r=>r.value)).toContain('accepted'+(n-1));
  }
 }
});
it('Goodreads misleading later life date cannot roll an accepted rating backwards',()=>{
 const csv=(rating:number,date:string)=>`Book Id,Title,Author,My Rating,Exclusive Shelf,Date Read\n1,Book,Writer,${rating},read,${date}`;
 const rows=(rating:number,date:string)=>mediaRows(csv(rating,date)).rows.flatMap(r=>r.build());
 const profile=emptyProfile();applyProposals(profile,rows(5,'2024/01/01'),'Goodreads');
 const older=rows(4,'2025/01/01');expect(older[0].sync?.at).toBe('');expect(needsTimeReview(profile.cards[0],older[0])).toBe(true);
 applyProposals(profile,older,'Goodreads');expect(profile.cards[0].fields?.sourceRating).toBe('5/5');
 applyProposals(profile,older.map(p=>({...p,useIncoming:true})),'Goodreads');
 applyProposals(profile,rows(3,'2025/01/01').map(p=>({...p,useIncoming:true})),'Goodreads');
 expect(profile.cards[0].fields?.sourceRating).toBe('3/5');
 expect(profile.cards[0].revisions.map(r=>r.value)).toContain('5/5');
});

it('grader contacts v1 â†’ explicitly accepted v2 â†’ third phone update does not stall',()=>{
 const load=(name:string)=>contactRows(parseVcf(readFileSync(new URL('./area-c/'+name,import.meta.url),'utf8'))).rows.flatMap(r=>r.build(r.choice));
 const profile=emptyProfile();applyProposals(profile,load('contacts-v1.vcf'),'Contacts');
 const second=load('contacts-v2.vcf');applyProposals(profile,second.map(p=>({...p,useIncoming:true})),'Contacts');
 const p=second.find(p=>p.fields?.phone)!;
 applyProposals(profile,[{...p,fields:{...p.fields,phone:'+1 555 8888'},useIncoming:true}],'Contacts');
 expect(profile.cards.find(c=>c.imports?.[p.sync!.source]?.id===p.sync!.id)?.fields?.phone).toBe('+1 555 8888');
});
it('LinkedIn parsed same-start title sequence Maker â†’ Senior Maker â†’ Lead Maker',()=>{
 const profile=emptyProfile();
 for(const title of ['Maker','Senior Maker','Lead Maker']) {
  const ps=linkedinRows({'Positions.csv':`Company Name,Title,Started On,Finished On\nFable,${title},Jan 2020,`}).rows.flatMap(r=>r.build());
  expect(ps).toHaveLength(1);expect(ps[0].sync?.at).toBe('');
  applyProposals(profile,ps.map(p=>({...p,useIncoming:true})),'LinkedIn');
 }
 expect(profile.cards).toHaveLength(1);expect(profile.cards[0].value).toContain('Lead Maker');
 expect(profile.cards[0].revisions.map(r=>r.value).join()).toContain('Senior Maker');
});

it('FHIR effective dates are life dates; only meta.lastUpdated supplies recency',()=>{
 const resource=(meta?:object)=>JSON.stringify({resourceType:'MedicationStatement',id:'med1',status:'active',meta,medicationCodeableConcept:{text:'Example'},effectivePeriod:{start:'2018-05',end:'2024-06'},authoredOn:'2025-01-01'});
 const undated=healthRows(parseHealth(resource())).rows.flatMap(r=>r.build());
 expect(undated[0].sync?.at).toBe('');expect(undated[0].since).toBe('2018-05');
 const dated=healthRows(parseHealth(resource({lastUpdated:'2026-01-01T00:00:00Z'}))).rows.flatMap(r=>r.build());
 expect(dated[0].sync?.at).toBe('2026-01-01T00:00:00Z');
});
it('accepting an undated change advances fields but never rolls a known source clock back',()=>{
 const profile=emptyProfile();const p={area:'work' as const,kind:'Job',value:'Maker',fields:{location:'A'},sync:{source:'test',id:'1',at:'2024'}};
 applyProposals(profile,[p],'test');
 applyProposals(profile,[{...p,fields:{location:'B'},sync:{...p.sync,at:''},useIncoming:true}],'test');
 expect(profile.cards[0].imports?.test.at).toBe('2024');
 applyProposals(profile,[{...p,fields:{location:'C'},sync:{...p.sync,at:'2025'}}],'test');
 expect(profile.cards[0].fields?.location).toBe('C');
 expect(profile.cards[0].revisions.map(r=>r.value)).toEqual(expect.arrayContaining(['A','B']));
});
