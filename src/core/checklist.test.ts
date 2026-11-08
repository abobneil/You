import { describe, it, expect } from 'vitest';
import { AREAS, kindOf } from './areas';
import { addCard, addLink, endCard, correctValue } from './cards';
import { emptyProfile, normalize } from './profile';
import type { AreaId } from './types';

// Appendix A: explicit field ids are a contract, not inferred from whatever fields happen to exist.
export const checklist: [AreaId, string, string[]][] = [
  ['about', 'Full name', ['type', 'since']],
  ['about', 'Birthday', ['place']],
  ['about', 'Citizenship', ['how']],
  ['about', 'Identity document', ['type', 'number', 'issuer', 'issued', 'expires']],
  ['about', 'Language', ['level']],
  ['health', 'Emergency contact', ['relationship', 'phone']],
  ['health', 'Condition', ['treatedBy']],
  ['health', 'Medication', ['dose', 'often', 'status']],
  ['health', 'Allergy', ['reaction', 'severity']],
  ['health', 'Immunization', ['dose']],
  ['health', 'Doctor', ['specialty', 'phone']],
  ['health', 'Health insurance', ['insurer', 'plan', 'member']],
  ['health', 'Procedure or hospital stay', ['what', 'where', 'date']],
  ['health', 'Measurement', ['type', 'amount', 'unit', 'date']],
  ['health', 'Care wishes', ['type', 'wish', 'document']],
  ['health', 'Family health history', ['condition']],
  ['work', 'Job', ['employer', 'title']],
  ['work', 'Education', ['school', 'degree', 'field']],
  ['work', 'Certification', ['issuer', 'number', 'expires']],
  ['work', 'Military service', ['branch', 'rank']],
  ['work', 'Volunteering', ['organization', 'role']],
  ['work', 'Skill', ['level']],
  ['money', 'Bank account', ['bank', 'type', 'account']],
  ['money', 'Retirement account', ['provider', 'type', 'account']],
  ['money', 'Loan or debt', ['lender', 'type', 'amount']],
  ['money', 'Credit card', ['issuer', 'number']],
  ['money', 'Insurance policy', ['insurer', 'type', 'account']],
  ['money', 'Income', ['source', 'amount']],
  ['money', 'Tax record', ['year', 'preparer', 'document']],
  ['home', 'Address', ['street', 'tenure']],
  ['home', 'Vehicle', ['year', 'make', 'model', 'vin', 'plate']],
  ['home', 'Possession', ['description', 'acquired']],
  ['home', 'Utility', ['provider', 'account']],
  ['home', 'Pet', ['species', 'birthday']],
  ['people', 'Partner', ['relationship']],
  ['people', 'Child', ['birthday']],
  ['people', 'Family member', ['relationship']],
  ['people', 'Family member', ['relationship']],
  ['people', 'Friend', ['met']],
  ['people', 'Important date', ['type', 'date']],
  ['people', 'Friend', ['phone', 'email', 'address']],
  ['interests', 'Book', ['author', 'read', 'rating']],
  ['interests', 'Movie or show', ['watched', 'rating']],
  ['interests', 'Music', ['artist']],
  ['interests', 'Hobby', ['often']],
  ['interests', 'Place visited', ['with']],
  ['goals', 'Goal', ['by', 'status']],
  ['goals', 'Milestone', ['date']],
  ['goals', 'Wishes for after death', ['funeral', 'bequests', 'will']],
  ['goals', 'Value', ['why']],
];

const sensitive = new Set(['number', 'member', 'account', 'vin']);
describe('Appendix A: all 50 minimum structured records', () => {
  checklist.forEach(([area, name, ids], i) => {
    it(`${i + 1}: ${area} / ${name}`, () => {
      const kind = kindOf(area, name);
      expect(AREAS.find(a => a.id === area)?.kinds.some(k => k.name === name)).toBe(true);
      for (const id of ids) {
        const field = kind.fields?.find(f => f.id === id);
        expect(field, `${name}.${id}`).toBeDefined();
        expect(field!.label.length).toBeGreaterThan(0);
        expect(field!.type ?? 'text').toMatch(/^(text|date)$/);
        if (['issued', 'expires', 'date', 'acquired', 'birthday', 'read', 'watched', 'by', 'since'].includes(id)) expect(field!.type).toBe('date');
        if (sensitive.has(id)) expect(field!.sensitive).toBe(true);
      }
      for (const precision of ['2001', '2001-02', '2001-02-03']) {
        const p = emptyProfile();
        const fields = Object.fromEntries(ids.map(id => [id, kind.fields!.find(f => f.id === id)!.type === 'date' ? precision : 'Example']));
        const c = addCard(p, { area, kind: name, value: 'Example', since: precision, fields });
        const person = addCard(p, { area: 'people', kind: 'Family member', value: 'Relative', since: '' });
        addLink(p, c.id, person.id, 'relative', '');
        expect(p.cards.filter(c => c.area === area)).toContain(c);
        endCard(p, c.id, '2020-04');
        expect(c.until).toBe('2020-04');
        expect(normalize(JSON.parse(JSON.stringify(p)))).toEqual(p);
        // No structured field, including sensitive ones, is compulsory.
        const light = emptyProfile();
        addCard(light, { area, kind: name, value: 'Only a name', since: '' });
        expect(normalize(JSON.parse(JSON.stringify(light)))).toEqual(light);
      }
    });
  });
  it('covers grouped examples and preserves custom and unknown future fields', () => {
    const p = emptyProfile();
    p.kinds = [{ area: 'home', name: 'Garden', fields: [{ id: 'planted', label: 'Planted', type: 'date' }] }];
    expect(kindOf('home', 'Garden', p).fields?.[0].type).toBe('date');
    for (const [area, name] of [['about', 'Former name'], ['about', 'Passport'], ['about', "Driver's license"], ['health', 'Blood type'], ['money', 'Investment'], ['home', 'Home insurance'], ['people', 'Pet'], ['interests', 'Podcast']] as const) {
      addCard(p, { area, kind: name, value: 'Example', since: '1990' });
    }
    const c = addCard(p, { area: 'goals', kind: 'Goal', value: 'Old goal', since: '2000' });
    correctValue(p, c.id, 'Renamed goal');
    expect(c.revisions[0].value).toBe('Old goal');
    const legacy = normalize({ name: 'Legacy', areas: { about: [{ label: 'Full name', value: 'Pat' }] } });
    expect(normalize(JSON.parse(JSON.stringify(legacy))).cards).toHaveLength(1);
    const future = { ...p, futureData: { version: 99 } };
    expect(normalize(JSON.parse(JSON.stringify(future)))).toEqual(future);
  });
});
