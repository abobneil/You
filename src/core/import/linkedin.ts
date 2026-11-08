// LinkedIn: Settings → Data privacy → "Get a copy of your data". The zip holds CSV files;
// we read Profile, Positions, Education, Skills, Certifications, Languages, Honors, Email Addresses
// and PhoneNumbers. Connections are left out on purpose: hundreds of contacts aren't your life record.
import { readZip } from './archive';
import { fmtDate } from '../dates';
import { finishPhone } from '../formats';
import { col, csvObjects, looseDate, rowId } from './parse';
import type { ImportResult, ImportRow, Proposal } from './types';

export type Files = Record<string, string>;

/** Reads a LinkedIn zip into { "Positions.csv": text, … }, keeping only CSV files. */
export function unzipCsvs(data: ArrayBuffer | Uint8Array): Files {
  const out: Files = {};
  const entries = readZip(data instanceof Uint8Array ? data : new Uint8Array(data), name => /\.csv$/i.test(name));
  for (const [path, bytes] of Object.entries(entries)) out[path.split('/').pop()!] = new TextDecoder().decode(bytes);
  return out;
}

const file = (files: Files, name: string) => {
  const k = Object.keys(files).find(f => f.toLowerCase() === name.toLowerCase());
  return k ? files[k] : '';
};

const row = (group: string, label: string, sub: string, p: Proposal | Proposal[]): ImportRow =>
  ({ id: rowId('li'), group, label, sub, build: () => (Array.isArray(p) ? p : [p]) });

const range = (since: string, until: string) => [since, until].filter(Boolean).join(' – ') || '';
const keep = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));

const LEVELS: [RegExp, string][] = [[/native|bilingual/i, 'Native'], [/full professional|professional working/i, 'Fluent'], [/limited/i, 'Conversational'], [/elementary/i, 'Learning']];

export function linkedinRows(files: Files, at = ''): ImportResult {
  const rows: ImportRow[] = [];
  const notes: string[] = [];

  for (const r of csvObjects(file(files, 'Profile.csv'), ['First Name', 'Last Name'])) {
    const first = col(r, 'First Name'), last = col(r, 'Last Name');
    if (first || last) rows.push(row('About you', `${first} ${last}`.trim(), 'Full name',
      { area: 'about', kind: 'Full name', value: `${first} ${last}`.trim(), fields: keep({ first, last }) }));
    const born = looseDate(col(r, 'Birth Date'));
    if (/^\d{4}-\d{2}-\d{2}$/.test(born)) rows.push(row('About you', fmtDate(born), 'Birthday',
      { area: 'about', kind: 'Birthday', value: fmtDate(born), since: born }));
  }

  for (const r of csvObjects(file(files, 'Positions.csv'), ['Company Name', 'Title'])) {
    const title = col(r, 'Title'), employer = col(r, 'Company Name');
    const since = looseDate(col(r, 'Started On')), until = looseDate(col(r, 'Finished On'));
    if (!title && !employer) continue;
    rows.push(row('Jobs', title && employer ? `${title} at ${employer}` : title || employer, range(since, until || (since ? 'now' : '')), {
      area: 'work', kind: 'Job', value: title && employer ? `${title} at ${employer}` : title || employer, since,
      past: !!until, until, fields: keep({ title, employer, location: col(r, 'Location') }),
    }));
  }

  for (const r of csvObjects(file(files, 'Education.csv'), ['School Name'])) {
    const school = col(r, 'School Name'), degree = col(r, 'Degree Name');
    const since = looseDate(col(r, 'Start Date')), until = looseDate(col(r, 'End Date'));
    const value = degree && school ? `${degree}, ${school}` : degree || school;
    if (!value) continue;
    const finished = !!until && until <= new Date().toISOString().slice(0, 10);
    rows.push(row('Education', value, range(since, until), {
      area: 'work', kind: 'Education', value, since, past: finished, until: finished ? until : '',
      fields: keep({ school, degree, honors: col(r, 'Activities') }),
    }));
  }

  for (const r of csvObjects(file(files, 'Certifications.csv'), ['Name'])) {
    const name = col(r, 'Name');
    if (!name) continue;
    const expires = looseDate(col(r, 'Finished On'));
    rows.push(row('Certifications', name, col(r, 'Authority'), {
      area: 'work', kind: 'Certification', value: name, since: looseDate(col(r, 'Started On')),
      fields: keep({ issuer: col(r, 'Authority'), number: col(r, 'License Number').toUpperCase(), expires }),
    }));
  }

  for (const r of csvObjects(file(files, 'Honors.csv'), ['Title'])) {
    const title = col(r, 'Title');
    if (title) rows.push(row('Awards', title, col(r, 'Issued On'), {
      area: 'work', kind: 'Award', value: title, since: looseDate(col(r, 'Issued On')), fields: keep({ from: col(r, 'Issuer'), for: col(r, 'Description') }),
    }));
  }

  for (const r of csvObjects(file(files, 'Skills.csv'), ['Name'])) {
    const name = col(r, 'Name');
    if (name) rows.push(row('Skills', name, '', { area: 'work', kind: 'Skill', value: name }));
  }

  for (const r of csvObjects(file(files, 'Languages.csv'), ['Name'])) {
    const name = col(r, 'Name');
    if (!name) continue;
    const level = LEVELS.find(([re]) => re.test(col(r, 'Proficiency')))?.[1] ?? '';
    rows.push(row('Languages', name, level, { area: 'about', kind: 'Language', value: name, fields: keep({ level }) }));
  }

  for (const r of csvObjects(file(files, 'Email Addresses.csv'), ['Email Address'])) {
    const email = col(r, 'Email Address');
    if (email) rows.push(row('Contact info', email, 'Email', { area: 'about', kind: 'Email', value: email }));
  }

  for (const r of csvObjects(file(files, 'PhoneNumbers.csv'), ['Number'])) {
    const n = col(r, 'Number');
    if (!n) continue;
    const t = col(r, 'Type').toLowerCase();
    const tag = /mobile|cell/.test(t) ? 'cell' : /work/.test(t) ? 'work' : /home/.test(t) ? 'home' : 'other';
    const value = finishPhone(n);
    rows.push(row('Contact info', value, 'Phone', { area: 'about', kind: 'Phone', value, tag }));
  }

  if (!file(files, 'Positions.csv')) notes.push('This download has no work history (Positions.csv). On LinkedIn’s “Get a copy of your data” page, choose the larger data archive, not just Profile, then bring in that zip.');
  if (!rows.length) notes.push('Nothing usable was found. Choose the zip LinkedIn emailed you, or the CSV files inside it.');
  for (const r of rows) {
    const build = r.build;
    r.build = choice => build(choice).map(p => ({ ...p, sync: { source: 'linkedin', id: [p.kind, p.kind === 'Job' ? (p.fields?.employer ?? p.value).toLowerCase() : p.value, p.since ?? ''].join(':'), at: at || p.until || p.since || '' } }));
  }
  return { rows, notes };
}
