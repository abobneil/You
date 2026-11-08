import { describe, it, expect } from 'vitest';
import { fileNameFor } from '../storage/fileFormat';
import { lifeDateProblem } from './dates';
import { parseVcf, contactAsMe } from './import/vcard';
import { applyProposals, planFor } from './import/match';
import { emptyProfile } from './profile';
describe('everyday use regressions', () => {
 it('keeps names readable across scripts and avoids occupied names', () => {
  expect(fileNameFor('Ángeles')).toBe('angeles.you.json');
  expect(fileNameFor('王小明')).toBe('王小明.you.json');
  expect(fileNameFor('🌷')).toBe('you.you.json');
  expect(fileNameFor('Alex Kim', ['alex-kim.you.json', 'alex-kim-2.you.json'])).toBe('alex-kim-3.you.json');
 });
 it('checks life dates without blocking future goals', () => {
  const now = new Date(2026, 10, 8);
  expect(lifeDateProblem('3020', false, now)).toContain('future');
  expect(lifeDateProblem('1849', true, now)).toContain('1850');
  expect(lifeDateProblem('3020', true, now)).toBe('');
  expect(lifeDateProblem('2027', false, now)).toBe('');
 });
 it('remembers a contact imported as me even when their name changes', () => {
  const contacts = parseVcf('BEGIN:VCARD\nVERSION:3.0\nUID:me-1\nFN:Alex Kim\nEMAIL:alex@example.com\nEND:VCARD');
  const p = emptyProfile();
  applyProposals(p, contactAsMe(contacts[0]), 'Contacts');
  contacts[0].fn = 'Alex Morgan Kim';
  const next = contactAsMe(contacts[0]);
  expect(next[0].sync?.id).toBe('me-1');
  expect(next.some(c => planFor(p, c) === 'update')).toBe(true); // Same-time differences require review.
 });
 it('uses normalized email and phone when contacts have no UID', () => {
  const c = parseVcf('BEGIN:VCARD\nFN:Alex\nEMAIL:ALEX@EXAMPLE.COM\nEND:VCARD')[0];
  expect(contactAsMe(c)[0].sync?.id).toBe('alex@example.com');
  c.emails = []; c.tels = [{ value: '(919) 449-8524', types: [] }];
  expect(contactAsMe(c)[0].sync?.id).toBe('+19194498524');
 });
 it('keeps several phone numbers when importing myself', () => {
  const c = parseVcf('BEGIN:VCARD\nUID:alex\nFN:Alex\nTEL:+19194498524\nTEL:+19194498525\nEND:VCARD')[0];
  const p = emptyProfile();
  applyProposals(p, contactAsMe(c), 'Contacts');
  expect(p.cards.filter(c => c.kind === 'Phone')).toHaveLength(2);
  expect(contactAsMe(c).every(c => planFor(p, c) === 'have')).toBe(true);
 });
});
