// Contacts from Google, iCloud and Outlook: vCard (.vcf) files, versions 2.1, 3.0 and 4.0.
// Also used for Android's contact picker, which gives the same shape.
import { phoneKey } from './match';
import { fmtDate } from '../dates';
import { FORMATS } from '../formats';
import type { FuzzyDate } from '../types';
import { looseDate, rowId, tidyCase } from './parse';
import type { ImportResult, ImportRow, Proposal } from './types';

export interface Contact {
  fn: string;
  name: { first: string; middle: string; last: string; suffix: string };
  tels: { value: string; types: string[] }[];
  emails: { value: string; types: string[] }[];
  addresses: { types: string[]; street: string; unit: string; city: string; state: string; zip: string; country: string }[];
  birthday: FuzzyDate;
  org: string;
  title: string;
  /** The contact's own id (UID), when the export has one. */
  uid?: string;
  /** When the contact was last changed (REV), as an ISO timestamp, when the export says. */
  rev?: string;
}

/** Undoes vCard escaping (\, \; \n). */
const unescape = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function decodeQP(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(s.charCodeAt(i));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Splits on unescaped `sep`. */
function splitEsc(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; }
    else if (s[i] === sep) { out.push(cur); cur = ''; }
    else cur += s[i];
  }
  out.push(cur);
  return out.map(unescape);
}

export function parseVcf(text: string): Contact[] {
  // Unfold: lines starting with a space or tab continue the previous one; QP soft breaks end in "=".
  const lines: string[] = [];
  for (const raw of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^[ \t]/.test(raw) && lines.length) lines[lines.length - 1] += raw.slice(1);
    else if (lines.length && /ENCODING=QUOTED-PRINTABLE/i.test(lines[lines.length - 1]) && lines[lines.length - 1].endsWith('=')) lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + raw;
    else lines.push(raw);
  }
  const contacts: Contact[] = [];
  let c: Contact | null = null;
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [rawName, ...params] = head.split(';');
    const name = rawName.replace(/^item\d+\./i, '').toUpperCase();
    if (name === 'BEGIN' && /vcard/i.test(value)) {
      c = { fn: '', name: { first: '', middle: '', last: '', suffix: '' }, tels: [], emails: [], addresses: [], birthday: '', org: '', title: '' };
      continue;
    }
    if (!c) continue;
    if (name === 'END') { if (c.fn || c.name.first || c.name.last || c.tels.length || c.emails.length) contacts.push(c); c = null; continue; }
    if (params.some(p => /ENCODING=QUOTED-PRINTABLE/i.test(p))) value = decodeQP(value);
    const types = params.flatMap(p => {
      const m = p.match(/^TYPE=(.*)$/i);
      return (m ? m[1] : /=/.test(p) ? '' : p).split(',').map(t => t.replace(/"/g, '').trim().toLowerCase()).filter(Boolean);
    });
    switch (name) {
      case 'FN': c.fn = unescape(value).trim(); break;
      case 'N': {
        const [last = '', first = '', middle = '', , suffix = ''] = splitEsc(value, ';');
        c.name = { first: first.trim(), middle: middle.trim(), last: last.trim(), suffix: suffix.trim() };
        break;
      }
      case 'TEL': if (value.trim()) c.tels.push({ value: unescape(value).replace(/^tel:/i, '').trim(), types }); break;
      case 'EMAIL': if (value.trim()) c.emails.push({ value: unescape(value).trim(), types }); break;
      case 'ADR': {
        const [, ext = '', street = '', city = '', state = '', zip = '', country = ''] = splitEsc(value, ';');
        if ([street, city, state, zip].some(x => x.trim()))
          c.addresses.push({ types, street: street.replace(/\n/g, ', ').trim(), unit: ext.trim(), city: city.trim(), state: state.trim(), zip: zip.trim(), country: country.trim() });
        break;
      }
      case 'BDAY': {
        const v = value.trim();
        // "--0829" means a birthday without a year; we can't place that on a timeline, so skip it.
        if (!v.startsWith('--')) c.birthday = looseDate(v.replace(/T.*$/, ''));
        break;
      }
      case 'ORG': c.org = splitEsc(value, ';')[0].trim(); break;
      case 'TITLE': c.title = unescape(value).trim(); break;
      case 'UID': if (value.trim()) c.uid = unescape(value).trim(); break;
      case 'REV': { const t = Date.parse(value.trim().replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')); if (!Number.isNaN(t)) c.rev = new Date(t).toISOString(); break; }
    }
  }
  return contacts;
}

const displayName = (c: Contact) =>
  c.fn || [c.name.first, c.name.middle, c.name.last, c.name.suffix].filter(Boolean).join(' ') || c.emails[0]?.value || c.tels[0]?.value || '';

/** Cell / Home / Work / Work cell / Fax / Other, from vCard TEL types. */
export function phoneTag(types: string[]): string {
  const t = new Set(types);
  if (t.has('fax')) return 'fax';
  if (t.has('work') && (t.has('cell') || t.has('mobile') || t.has('iphone'))) return 'workcell';
  if (t.has('cell') || t.has('mobile') || t.has('iphone')) return 'cell';
  if (t.has('work')) return 'work';
  if (t.has('home')) return 'home';
  return 'other';
}

const fmtPhone = (v: string) => FORMATS.phone.apply(v);
const fmtZip = (v: string) => FORMATS.zip.apply(v) || v;
const preferred = <T extends { types: string[] }>(list: T[], ...want: string[]) =>
  list.find(x => x.types.includes('pref')) ?? list.find(x => want.some(w => x.types.includes(w))) ?? list[0];

export const PERSON_KINDS = ['Friend', 'Family member', 'Partner', 'Child', 'Mentor'];
export const ME = 'me';

function addressFields(a: Contact['addresses'][number]) {
  return { street: a.street, unit: a.unit, city: a.city, state: a.state.length <= 3 ? a.state.toUpperCase() : a.state, zip: fmtZip(a.zip), country: a.country };
}
const oneLine = (a: Contact['addresses'][number]) => [a.street, a.unit, a.city, a.state, a.zip, a.country].filter(Boolean).join(', ');

/**
 * Which contact this is, across exports: its UID, or else its name with the first email and phone
 * as the file gave them. Lets a later import find the card even after details were edited by hand.
 */
export function contactKey(c: Contact): string {
  if (c.uid) return 'uid:' + c.uid;
  const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}@.+]+/gu, ' ').trim();
  return ['k', norm(displayName(c)), norm(c.emails[0]?.value ?? ''), (c.tels[0]?.value ?? '').replace(/[^\d+]/g, '')].join('|');
}

/** A contact as one People card. `at` is when this export was made (its REV), or else when it was imported. */
export function contactAsPerson(c: Contact, kind: string, at = ''): Proposal[] {
  const tel = preferred(c.tels, 'cell', 'mobile');
  const email = preferred(c.emails, 'home', 'internet');
  const adr = preferred(c.addresses, 'home');
  const fields: Record<string, string> = {};
  if (tel) fields.phone = fmtPhone(tel.value);
  if (email) fields.email = email.value;
  if (c.org) fields.organization = c.org;
  if (c.title) fields.title = c.title;
  c.tels.forEach((t, i) => { fields[`phone${i + 1}`] = `${t.types.join(', ')}: ${t.value}`; });
  c.emails.forEach((e, i) => { fields[`email${i + 1}`] = `${e.types.join(', ')}: ${e.value}`; });
  if (c.birthday) fields.birthday = c.birthday;
  if (adr) fields.address = oneLine(adr);
  return [{ area: 'people', kind, value: displayName(c), fields, sync: { source: 'vcard', id: contactKey(c), at: c.rev ?? at } }];
}

/** "This is me": a contact as your own About cards, plus your address and job. */
export function contactAsMe(c: Contact): Proposal[] {
  const out: Proposal[] = [];
  const full = [c.name.first, c.name.middle, c.name.last, c.name.suffix].filter(Boolean).join(' ') || c.fn;
  if (full) out.push({ area: 'about', kind: 'Full name', value: full,
    fields: Object.fromEntries(Object.entries({ first: c.name.first, middle: c.name.middle, last: c.name.last, suffix: c.name.suffix }).filter(([, v]) => v)) });
  for (const t of c.tels) out.push({ area: 'about', kind: 'Phone', value: fmtPhone(t.value), tag: phoneTag(t.types) });
  for (const e of c.emails) {
    const use = e.types.includes('work') ? 'Work' : e.types.includes('home') ? 'Personal' : '';
    out.push({ area: 'about', kind: 'Email', value: e.value, fields: use ? { use } : {} });
  }
  if (c.birthday) out.push({ area: 'about', kind: 'Birthday', value: fmtDate(c.birthday), since: c.birthday });
  const home = c.addresses.find(a => a.types.includes('home')) ?? c.addresses[0];
  if (home) { const f = addressFields(home); out.push({ area: 'home', kind: 'Address', value: [f.street, f.unit].filter(Boolean).join(' ') || f.city, fields: f }); }
  if (c.title || c.org) out.push({ area: 'work', kind: 'Job', value: c.title && c.org ? `${c.title} at ${c.org}` : c.title || c.org,
    fields: Object.fromEntries(Object.entries({ title: c.title, employer: c.org }).filter(([, v]) => v)) });
  const id = c.uid || c.emails[0]?.value.trim().toLowerCase() || (c.tels[0] && phoneKey(c.tels[0].value));
  return out.map(p => id ? { ...p, sync: { source: 'contacts-me', id: p.kind === 'Phone' ? id + '/tel/' + phoneKey(p.value) : p.kind === 'Email' ? id + '/mail/' + p.value.toLowerCase() : id, at: '1970-01-01T00:00:00.000Z' } } : p);
}

export function contactRows(contacts: Contact[]): ImportResult {
  const rows: ImportRow[] = contacts.map(c => ({
    id: rowId('vcf'),
    group: 'Contacts',
    label: tidyCase(displayName(c)),
    sub: [c.tels[0] && fmtPhone(c.tels[0].value), c.emails[0]?.value].filter(Boolean).join(' · '),
    options: [...PERSON_KINDS.map(k => ({ id: k, label: k })), { id: ME, label: 'This is me' }],
    choice: 'Friend',
    build: (choice = 'Friend') => (choice === ME ? contactAsMe(c) : contactAsPerson({ ...c, fn: tidyCase(displayName(c)) }, choice)),
  }));
  return { rows, notes: contacts.length ? [] : ['No contacts were found in that file.'] };
}
