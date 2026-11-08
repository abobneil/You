// C4d / CAP3: re-importing a contact keeps hand edits, never duplicates, and offers real updates.
import { describe, expect, it } from 'vitest';
import { setField } from '../cards';
import { emptyProfile } from '../profile';
import { applyProposals, planFor } from './match';
import { contactRows, parseVcf } from './vcard';

const vcf = (org: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Pat Example\r\nN:Example;Pat;;;\r\nEMAIL;TYPE=HOME:pat@old.example\r\nTEL;TYPE=CELL:+1 555 0100\r\nORG:${org}\r\nBDAY:1980-02-03\r\nEND:VCARD\r\n`;
const proposals = (text: string) => contactRows(parseVcf(text)).rows[0].build('Friend');

it('matches the same contact after hand edits, and updates only what the person left alone', async () => {
  const p = { ...emptyProfile(), id: 'you' };
  applyProposals(p, proposals(vcf('Acme Co')), 'Contacts', '2026-11-01T00:00:00.000Z');
  const pat = p.cards.find(c => c.value === 'Pat Example')!;
  // By hand: correct the email, clear the phone.
  setField(p, pat.id, 'email', 'pat@corrected.example', '2026-11-02T00:00:00.000Z');
  setField(p, pat.id, 'phone', '', '2026-11-02T00:00:00.000Z');

  // The same export again: one Pat, nothing to do.
  await new Promise(r => setTimeout(r, 5));
  const same = proposals(vcf('Acme Co'));
  expect(planFor(p, same[0])).toBe('have');
  applyProposals(p, same, 'Contacts');
  expect(p.cards.filter(c => c.value === 'Pat Example')).toHaveLength(1);

  // A newer export with a changed organization: offered as an update, hand edits kept.
  await new Promise(r => setTimeout(r, 5));
  const newer = proposals(vcf('Globex Inc')).map(p => ({ ...p, useIncoming: true }));
  expect(planFor(p, newer[0])).toBe('update');
  applyProposals(p, newer, 'Contacts');
  expect(p.cards.filter(c => c.value === 'Pat Example')).toHaveLength(1);
  expect(pat.fields).toMatchObject({ organization: 'Globex Inc', email: 'pat@corrected.example' });
  expect(pat.fields?.phone ?? '').toBe('');
  expect(pat.revisions).toContainEqual(expect.objectContaining({ field: 'organization', value: 'Acme Co' }));
});

it('uses the contact UID and REV when the export has them', () => {
  const withUid = (org: string, rev: string) => vcf(org).replace('END:VCARD', `UID:abc-123\r\nREV:${rev}\r\nEND:VCARD`);
  const p = { ...emptyProfile(), id: 'you' };
  applyProposals(p, proposals(withUid('Acme Co', '20260101T000000Z')), 'Contacts');
  const changed = proposals(withUid('Acme Co', '20260301T000000Z').replace('pat@old.example', 'pat@new.example').replace('+1 555 0100', '+1 555 0199'));
  expect(planFor(p, changed[0])).toBe('update');
  // An older export than the one already applied changes nothing.
  expect(planFor(p, proposals(withUid('Old Co', '20250101T000000Z'))[0])).toBe('have');
});

describe('the person’s own contact', () => {
  it('defaults to "This is me" when the name matches the You, ignoring accents and case', async () => {
    const { contactRows, ME } = await import('./vcard');
    const own = parseVcf('BEGIN:VCARD\nVERSION:3.0\nFN:Renée Kim\nN:Kim;Renée;;;\nEND:VCARD\n');
    const sister = parseVcf('BEGIN:VCARD\nVERSION:3.0\nFN:Jo Kim\nN:Kim;Jo;;;\nEND:VCARD\n');
    const rows = contactRows([...own, ...sister], 'Kim', 'renee kim').rows;
    expect(rows[0].choice).toBe(ME);
    expect(rows[1].choice).toBe('Family member');
  });
});
