import { DOMParser as XmlDOMParser } from '@xmldom/xmldom';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { addCard } from '../cards';
import { emptyProfile } from '../profile';
import { licenseRows, parseAamva } from './aamva';
import { healthRows, parseHealth } from './health';
import { linkedinRows, unzipCsvs } from './linkedin';
import { applyProposals, matchKey, planFor } from './match';
import { mediaRows } from './media';
import { csvObjects, looseDate, parseCsv, tidyCase } from './parse';
import { contactAsMe, contactRows, parseVcf, phoneTag } from './vcard';
import { readVinResponse } from './vin';

const NOW = '2026-11-06T12:00:00.000Z';
// Browsers have DOMParser built in; tests run in Node, so use a standards-based XML parser.
(globalThis as any).DOMParser ??= XmlDOMParser;

describe('parsing helpers', () => {
  it('CSV with quotes, commas, newlines and a BOM', () => {
    expect(parseCsv('﻿a,b\n"x, y","he said ""hi""\nthere"\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"\nthere']]);
  });
  it('skips notes above the header', () => {
    expect(csvObjects('Notes:\n"Some text"\n\nName,Year\nAlien,1979', ['Name'])).toEqual([{ Name: 'Alien', Year: '1979' }]);
  });
  it('reads the date styles exports use', () => {
    expect(looseDate('Jan 2018')).toBe('2018-01');
    expect(looseDate('2018')).toBe('2018');
    expect(looseDate('2021/03/14')).toBe('2021-03-14');
    expect(looseDate('Mar 15, 2021')).toBe('2021-03-15');
    expect(looseDate('15 Mar 2021')).toBe('2021-03-15');
    expect(looseDate('3/15/21')).toBe('2021-03-15');
    expect(looseDate('20180314')).toBe('2018-03-14');
    expect(looseDate('2018-03-14T10:00:00Z')).toBe('2018-03-14');
    expect(looseDate('soon')).toBe('');
  });
  it('tidies ALL CAPS', () => {
    expect(tidyCase('FOX RUN DR')).toBe('Fox Run Dr');
    expect(tidyCase('McDonald')).toBe('McDonald');
  });
});

const VCF = `BEGIN:VCARD
VERSION:3.0
N:Chester;Neil;Alexander;;
FN:Neil Alexander Chester
item1.TEL;TYPE=CELL,VOICE,pref:+1 919 449 8524
TEL;TYPE=WORK:919.555.0100
EMAIL;TYPE=INTERNET,HOME:neil@example.com
EMAIL;TYPE=INTERNET,WORK:neil@work.example
ADR;TYPE=HOME:;;225 Fox Run Dr.;Raleigh;NC;27601;United States
BDAY:1989-08-29
ORG:Acme Corp;
TITLE:Designer
END:VCARD
BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Ren=C3=A9e;Marie;;;
TEL;CELL:(919) 555-0199
BDAY:--0412
END:VCARD`;

describe('contacts (vCard)', () => {
  const [neil, renee] = parseVcf(VCF);
  it('reads names, phones, emails, addresses and birthdays', () => {
    expect(neil.name).toEqual({ first: 'Neil', middle: 'Alexander', last: 'Chester', suffix: '' });
    expect(neil.tels.map(t => phoneTag(t.types))).toEqual(['cell', 'work']);
    expect(neil.addresses[0]).toMatchObject({ street: '225 Fox Run Dr.', city: 'Raleigh', state: 'NC', zip: '27601' });
    expect(neil.birthday).toBe('1989-08-29');
    expect(renee.name.last).toBe('Renée'); // quoted-printable decoded
    expect(renee.birthday).toBe(''); // no year, so not placed on the timeline
  });
  it('a contact becomes one People card', () => {
    const { rows } = contactRows([renee]);
    const [p] = rows[0].build('Family member');
    expect(p).toMatchObject({ area: 'people', kind: 'Family member', fields: { phone: '(919) 555-0199' } });
  });
  it('"This is me" becomes your own cards', () => {
    const me = contactAsMe(neil);
    expect(me.map(p => `${p.area}/${p.kind}`)).toEqual(['about/Full name', 'about/Phone', 'about/Phone', 'about/Email', 'about/Email', 'about/Birthday', 'home/Address', 'work/Job']);
    expect(me[1]).toMatchObject({ value: '+1 (919) 449-8524', tag: 'cell' });
    expect(me[3]).toMatchObject({ value: 'neil@example.com', fields: { use: 'Personal' } });
    expect(me[5]).toMatchObject({ value: 'Aug 29, 1989', since: '1989-08-29' });
    expect(me[7]).toMatchObject({ value: 'Designer at Acme Corp' });
  });
});

describe('LinkedIn', () => {
  const files = {
    'Profile.csv': 'First Name,Last Name,Headline\nNeil,Chester,Designer',
    'Positions.csv': 'Company Name,Title,Description,Location,Started On,Finished On\nAcme Corp,Designer,,Raleigh,Sep 2022,\nInitech,Intern,"Copied, pasted",Durham,Jun 2018,Aug 2018',
    'Education.csv': 'School Name,Start Date,End Date,Notes,Degree Name,Activities\nNC State,2008,2012,,Bachelor of Science,',
    'Skills.csv': 'Name\nFigma\nTypeScript',
    'Languages.csv': 'Name,Proficiency\nSpanish,Limited working proficiency',
    'PhoneNumbers.csv': 'Extension,Number,Type\n,9194498524,Mobile',
  };
  it('jobs keep their dates; finished ones go into history', () => {
    const { rows } = linkedinRows(files);
    const jobs = rows.filter(r => r.group === 'Jobs').map(r => r.build()[0]);
    expect(jobs[0]).toMatchObject({ value: 'Designer at Acme Corp', since: '2022-09', past: false, fields: { location: 'Raleigh' } });
    expect(jobs[1]).toMatchObject({ value: 'Intern at Initech', since: '2018-06', until: '2018-08', past: true });
  });
  it('reads education, skills, languages and phones', () => {
    const groups = linkedinRows(files).rows.map(r => r.group);
    expect(groups).toEqual(['About you', 'Jobs', 'Jobs', 'Education', 'Skills', 'Skills', 'Languages', 'Contact info']);
    const lang = linkedinRows(files).rows.find(r => r.group === 'Languages')!.build()[0];
    expect(lang.fields).toEqual({ level: 'Conversational' });
  });
  it('reads the birthday and says when work history is missing', () => {
    const { rows, notes } = linkedinRows({ 'Profile.csv': 'First Name,Last Name,Birth Date\nNeil,Chester,"Aug 29, 1989"' });
    expect(rows.map(r => r.sub)).toEqual(['Full name', 'Birthday']);
    expect(rows[1].build()[0]).toMatchObject({ kind: 'Birthday', since: '1989-08-29' });
    expect(notes?.join(' ')).toMatch(/Positions\.csv/);
    expect(linkedinRows(files).notes).toEqual([]);
  });
  it('reads the zip LinkedIn sends', () => {
    const zip = zipSync({ 'Basic_LinkedInDataExport/Positions.csv': strToU8(files['Positions.csv']), 'Basic_LinkedInDataExport/Rich_Media.txt': strToU8('x') });
    const unzipped = unzipCsvs(zip);
    expect(Object.keys(unzipped)).toEqual(['Positions.csv']);
    expect(linkedinRows(unzipped).rows).toHaveLength(2);
  });
});

describe("driver's license barcode", () => {
  const raw = '@\n\x1e\rANSI 636004090002DL00410278ZN03190008DLDAQ123456789\nDCSCHESTER\nDACNEIL\nDADALEXANDER\nDBB08291989\nDBA08292030\nDBD07152022\nDAG225 FOX RUN DR\nDAIRALEIGH\nDAJNC\nDAK276010000  \nDCAC\nDCBNONE\nDCGUSA\n';
  it('reads names, dates, number and address', () => {
    const l = parseAamva(raw)!;
    expect(l).toMatchObject({ first: 'Neil', middle: 'Alexander', last: 'Chester', birthday: '1989-08-29', expires: '2030-08-29', issued: '2022-07-15',
      number: '123456789', state: 'NC', licenseClass: 'C', restrictions: '', street: '225 Fox Run Dr', city: 'Raleigh', zip: '27601' });
  });
  it('becomes your name, birthday, license and address', () => {
    const rows = licenseRows(parseAamva(raw)!).rows.flatMap(r => r.build());
    expect(rows.map(p => p.kind)).toEqual(['Full name', 'Birthday', "Driver's license", 'Address']);
    expect(rows[2]).toMatchObject({ value: '123456789', fields: { state: 'NC', class: 'C', expires: '2030-08-29' } });
  });
  it('ignores barcodes that are not licenses', () => {
    expect(parseAamva('https://example.com')).toBeNull();
  });
});

describe('health records', () => {
  it('FHIR bundles', () => {
    const bundle = { resourceType: 'Bundle', entry: [
      { resource: { resourceType: 'AllergyIntolerance', code: { text: 'Penicillin' }, criticality: 'high', reaction: [{ manifestation: [{ text: 'Hives' }] }], recordedDate: '2009-05-01' } },
      { resource: { resourceType: 'MedicationRequest', status: 'active', medicationCodeableConcept: { coding: [{ display: 'Lisinopril 10 mg' }] }, authoredOn: '2022-01-10', dosageInstruction: [{ text: 'Once daily' }] } },
      { resource: { resourceType: 'MedicationRequest', status: 'active', medicationCodeableConcept: { text: 'Lisinopril 10 mg' }, authoredOn: '2023-01-10' } },
      { resource: { resourceType: 'Condition', code: { text: 'Hypertension' }, clinicalStatus: { coding: [{ code: 'active' }] }, onsetDateTime: '2021-11' } },
      { resource: { resourceType: 'Immunization', vaccineCode: { text: 'COVID-19 vaccine' }, occurrenceDateTime: '2021-04-02', protocolApplied: [{ doseNumberPositiveInt: 2 }] } },
    ] };
    const items = parseHealth(JSON.stringify(bundle));
    expect(items.map(i => `${i.kind}:${i.name}`)).toEqual(['Allergy:Penicillin', 'Medication:Lisinopril 10 mg', 'Medication:Lisinopril 10 mg', 'Condition:Hypertension', 'Immunization:COVID-19 vaccine']);
    expect(items[0].fields).toMatchObject({ reaction: 'Hives', severity: 'Severe' });
    expect(items[1].since).toBe('2022-01-10'); // earliest of the duplicates
    const rows = healthRows(items).rows.map(r => r.build()[0]);
    expect(rows[4]).toMatchObject({ kind: 'Immunization', since: '2021-04-02', fields: { dose: 'Dose 2' } });
  });

  it('C-CDA documents', () => {
    const xml = `<?xml version="1.0"?><ClinicalDocument xmlns="urn:hl7-org:v3"><component><structuredBody>
      <component><section><code code="48765-2"/><entry><act><entryRelationship><observation>
        <participant><participantRole><playingEntity><code displayName="Penicillin"/></playingEntity></participantRole></participant>
        <effectiveTime><low value="20090501"/></effectiveTime></observation></entryRelationship></act></entry></section></component>
      <component><section><code code="10160-0"/><entry><substanceAdministration><statusCode code="active"/>
        <effectiveTime><low value="20220110"/></effectiveTime><doseQuantity value="10" unit="mg"/>
        <consumable><manufacturedProduct><manufacturedMaterial><code displayName="Lisinopril"/></manufacturedMaterial></manufacturedProduct></consumable>
      </substanceAdministration></entry></section></component>
      <component><section><code code="11450-4"/><entry><act><entryRelationship><observation><code code="64572001"/>
        <effectiveTime><low value="20150301"/><high value="20160101"/></effectiveTime><value displayName="Asthma"/>
      </observation></entryRelationship></act></entry></section></component>
    </structuredBody></component></ClinicalDocument>`;
    const items = parseHealth(xml);
    expect(items.map(i => `${i.kind}:${i.name}`)).toEqual(['Allergy:Penicillin', 'Medication:Lisinopril', 'Condition:Asthma']);
    expect(items[1]).toMatchObject({ since: '2022-01-10', active: true, fields: { dose: '10 mg' } });
    expect(items[2]).toMatchObject({ since: '2015-03-01', until: '2016-01-01', active: false });
  });
});

describe('books and movies', () => {
  it('Goodreads', () => {
    const r = mediaRows('Book Id,Title,Author,My Rating,Exclusive Shelf,Date Read,Date Added\n1,East of Eden,John Steinbeck,5,read,2019/07/04,2019/01/01');
    expect(r.source).toBe('Goodreads');
    expect(r.rows[0].build()[0]).toMatchObject({ kind: 'Book', value: 'East of Eden', since: '2019-07-04', fields: { author: 'John Steinbeck', status: 'Read', rating: '★★★★★' } });
  });
  it('Letterboxd and IMDb', () => {
    expect(mediaRows('Date,Name,Year,Letterboxd URI,Rating\n2023-02-01,Alien,1979,https://boxd.it/x,4.5').rows[0].build()[0])
      .toMatchObject({ kind: 'Movie or show', value: 'Alien', since: '2023-02-01', fields: { year: '1979', rating: '★★★★★' } });
    expect(mediaRows('Const,Your Rating,Date Rated,Title,Title Type,Year\ntt1,8,2022-05-01,Severance,tvSeries,2022').rows[0].build()[0])
      .toMatchObject({ value: 'Severance', fields: { type: 'Show', rating: '★★★★' } });
  });
  it('explains unknown files', () => {
    expect(mediaRows('a,b\n1,2').notes?.[0]).toMatch(/wasn’t recognized/);
  });
});

describe('VIN lookup answer', () => {
  it('reads year, make, model, trim and fuel', () => {
    expect(readVinResponse({ Results: [{ ModelYear: '2020', Make: 'KIA', Model: 'Niro', Trim: 'EX Premium', FuelTypePrimary: 'Gasoline', ElectrificationLevel: 'PHEV (Plug-in Hybrid Electric Vehicle)' }] }))
      .toEqual({ year: '2020', make: 'Kia', model: 'Niro', trim: 'EX Premium', fuel: 'Plug-in hybrid' });
    expect(readVinResponse({ Results: [{ Make: '' }] })).toBeNull();
  });
});

describe('matching and adding', () => {
  it('matches phones by digits, emails by case, people across kinds', () => {
    expect(matchKey({ area: 'about', kind: 'Phone', value: '+1 (919) 449-8524' })).toBe(matchKey({ area: 'about', kind: 'Phone', value: '919.449.8524' }));
    expect(matchKey({ area: 'about', kind: 'Email', value: 'Neil@Example.com' })).toBe(matchKey({ area: 'about', kind: 'Email', value: 'neil@example.com' }));
    expect(matchKey({ area: 'people', kind: 'Friend', value: 'Sam Rivera' })).toBe(matchKey({ area: 'people', kind: 'Family member', value: 'sam rivera' }));
  });

  it('adds new cards, fills in missing details, and skips what you already have', () => {
    const p = emptyProfile();
    const phone = addCard(p, { area: 'about', kind: 'Phone', value: '(919) 449-8524', since: '' });
    const proposals = [
      { area: 'about' as const, kind: 'Phone', value: '919-449-8524', tag: 'cell' },
      { area: 'work' as const, kind: 'Job', value: 'Intern at Initech', since: '2018-06', past: true, until: '2018-08' },
    ];
    expect(planFor(p, proposals[0])).toBe('fill');
    expect(planFor(p, proposals[1])).toBe('new');
    expect(applyProposals(p, proposals, 'LinkedIn', NOW)).toEqual({ added: 1, filled: 1, updated: 0, merged: 0 });
    expect(phone.tag).toBe('cell');
    const job = p.cards.find(c => c.kind === 'Job')!;
    expect(job).toMatchObject({ status: 'past', since: '2018-06', until: '2018-08', source: { from: 'LinkedIn', at: NOW } });
    expect(planFor(p, proposals[0])).toBe('have');
    expect(applyProposals(p, proposals, 'LinkedIn', NOW)).toEqual({ added: 0, filled: 0, updated: 0, merged: 0 });
  });
});
