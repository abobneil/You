// "Bring in your data": every import source in one place. Files are read on this device;
// only the VIN lookup goes over the network, and it asks first.
import { unzipSync } from 'fflate';
import { isAamva, licenseRows, parseAamva } from '../../core/import/aamva';
import { healthRows, parseHealth } from '../../core/import/health';
import { linkedinRows, unzipCsvs, type Files } from '../../core/import/linkedin';
import { mediaRows } from '../../core/import/media';
import { audibleRows } from '../../core/import/audible';
import { audibleStatus, connectAudible, disconnectAudible, syncAudible, type AudibleStatus } from './audibleLive';
import { streamingRows, streamingZip } from '../../core/import/streaming';
import { profile } from '../../state';
import type { ImportResult } from '../../core/import/types';
import { contactRows, parseVcf, type Contact } from '../../core/import/vcard';
import { esc } from '../dom';
import { openComposer } from '../composer';
import { openSheet, sheetTop } from '../sheet';
import { openReview } from './review';
import { canUseCamera, readPhoto, scanCamera } from './scan';

import type { SourceId } from './sources';

interface Source {
  id: SourceId;
  title: string;
  desc: string;
  icon: string;
  how: string;
  actions: { label: string; run: () => void; primary?: boolean }[];
}

const goTo = (area: string) => { location.hash = '#' + area; };
const show = (source: string, result: ImportResult) => openReview(source, result, goTo);

/** Opens a file chooser and hands over the chosen files. */
function pick(accept: string, multiple: boolean, then: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.addEventListener('change', () => { if (input.files?.length) then([...input.files]); });
  input.click();
}

const failed = (source: string, what: string) => show(source, { rows: [], notes: [what] });

// ---------- each source ----------
async function importContacts(files: File[]) {
  const contacts = (await Promise.all(files.map(f => f.text()))).flatMap(parseVcf);
  show('Contacts', contactRows(contacts));
}

/** Android Chrome's contact picker: no file needed, and only the contacts you pick are shared. */
const nav = navigator as Navigator & { contacts?: { select(props: string[], o: { multiple: boolean }): Promise<any[]> } };
const canPickContacts = () => !!nav.contacts && 'ContactsManager' in window;
async function pickPhoneContacts() {
  try {
    const picked = await nav.contacts!.select(['name', 'email', 'tel', 'address'], { multiple: true });
    const contacts: Contact[] = picked.map(p => {
      const full = p.name?.[0] ?? '';
      const parts = full.split(' ');
      const a = p.address?.[0];
      return { fn: full, name: { first: parts[0] ?? '', middle: parts.length > 2 ? parts.slice(1, -1).join(' ') : '', last: parts.length > 1 ? parts[parts.length - 1] : '', suffix: '' },
        tels: (p.tel ?? []).map((v: string) => ({ value: v, types: ['cell'] })), emails: (p.email ?? []).map((v: string) => ({ value: v, types: [] })),
        addresses: a ? [{ types: ['home'], street: (a.addressLine ?? []).join(', '), unit: '', city: a.city ?? '', state: a.region ?? '', zip: a.postalCode ?? '', country: a.country ?? '' }] : [],
        birthday: '', org: '', title: '' };
    });
    if (contacts.length) show('Contacts', contactRows(contacts));
  } catch { /* the person closed the picker */ }
}

async function importLinkedin(files: File[]) {
  const all: Files = {};
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) Object.assign(all, unzipCsvs(await f.arrayBuffer()));
    else all[f.name] = await f.text();
  }
  show('LinkedIn', linkedinRows(all));
}

const LICENSE_FORMATS = ['PDF417'] as const;
function licenseFromText(text: string) {
  const l = parseAamva(text);
  if (!l) return failed('Driver’s license', 'That barcode isn’t a driver’s license barcode. Use the wide barcode on the back of the license.');
  show('Driver’s license', licenseRows(l));
}
async function licenseFromPhoto(files: File[]) {
  try {
    const texts = await readPhoto(files[0], [...LICENSE_FORMATS]);
    const hit = texts.find(isAamva);
    if (hit) licenseFromText(hit);
    else failed('Driver’s license', 'No license barcode was found in that photo. Try a sharper, closer photo of the wide barcode on the back, in good light.');
  } catch { failed('Driver’s license', 'That photo couldn’t be read.'); }
}
async function licenseFromCamera() {
  const text = await scanCamera({ title: 'Scan your license', hint: 'Hold the back of your license up to the camera so the wide barcode fills the frame. Hold still for a moment.',
    formats: [...LICENSE_FORMATS], accept: isAamva });
  if (text) licenseFromText(text);
}

async function importHealth(files: File[]) {
  const items = (await Promise.all(files.map(async f => {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: e => /\.(xml|json|ndjson)$/i.test(e.name) });
      return Object.values(entries).flatMap(b => parseHealth(new TextDecoder().decode(b)));
    }
    return parseHealth(await f.text());
  }))).flat();
  show('Health records', healthRows(items));
}

async function importMedia(files: File[]) {
  for (const f of files) {
    let text = '';
    if (/\.zip$/i.test(f.name)) {
      // Letterboxd sends a zip; its diary has the dates you watched things.
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: e => /(^|\/)(diary|watched|ratings)\.csv$/i.test(e.name) });
      const pickName = ['diary.csv', 'watched.csv', 'ratings.csv'].map(n => Object.keys(entries).find(k => k.toLowerCase().endsWith(n))).find(Boolean);
      text = pickName ? new TextDecoder().decode(entries[pickName]) : '';
    } else text = await f.text();
    const r = mediaRows(text);
    show(r.source || 'Books & movies', r);
  }
}

/** Streaming history: loose files, or the zips the services send. */
async function importStreaming(files: File[]) {
  const texts: Record<string, string> = {};
  try {
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) Object.assign(texts, streamingZip(new Uint8Array(await f.arrayBuffer())));
      else texts[f.name] = await f.text();
    }
  } catch { return failed('Streaming', 'That file couldn’t be opened. Choose the zip or the history file the service sent you.'); }
  if (!Object.keys(texts).length) return failed('Streaming', 'No viewing or listening history was found in that zip. Check that you chose the export from Netflix, Spotify, Apple or Google Takeout.');
  const r = streamingRows(texts, profile.name);
  show(r.source || 'Streaming', r);
}

// ---------- the screen ----------
const ICONS = {
  contacts: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 8h4M19 6v4"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
  license: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16a3 3 0 0 1 6 0M14 10h4M14 13h4"/>',
  vehicle: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v2H3z"/><circle cx="7.5" cy="13.5" r=".8"/><circle cx="16.5" cy="13.5" r=".8"/>',
  health: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
  streaming: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 8.5v5l4-2.5z"/><path d="M8 20h8"/>',
  media: '<path d="M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"/>',
};

function sources(audible: AudibleStatus | null): Source[] {
  return [
    { id: 'contacts', title: 'Contacts', desc: 'People from Google or iCloud, or pick them on your phone. Mark one as you.', icon: ICONS.contacts,
      how: '<b>Google:</b> contacts.google.com → Export → vCard. <b>iPhone / iCloud:</b> icloud.com/contacts → select contacts → ⚙ → Export vCard.',
      actions: [{ label: 'Choose .vcf file', primary: true, run: () => pick('.vcf,text/vcard,text/x-vcard', true, importContacts) },
        ...(canPickContacts() ? [{ label: 'Pick from this phone', run: pickPhoneContacts }] : [])] },
    { id: 'linkedin', title: 'LinkedIn', desc: 'Your jobs with their dates, education, skills, certifications and languages.', icon: ICONS.linkedin,
      how: 'LinkedIn → Settings & Privacy → Data privacy → <b>Get a copy of your data</b>. Choose the <b>larger data archive</b>, since picking only Profile leaves out your jobs. LinkedIn emails a zip, usually within minutes; choose that zip here.',
      actions: [{ label: 'Choose zip or CSV files', primary: true, run: () => pick('.zip,.csv', true, importLinkedin) }] },
    { id: 'license', title: 'Driver’s license', desc: 'Your name, birthday, license details and address, from the barcode on the back.', icon: ICONS.license,
      how: 'The wide barcode on the back of every US and Canadian license holds the details printed on the front. It’s read on this device.',
      actions: [...(canUseCamera() ? [{ label: 'Scan with camera', primary: true, run: licenseFromCamera }] : []),
        { label: 'Use a photo of the barcode', primary: !canUseCamera(), run: () => pick('image/*', false, licenseFromPhoto) }] },
    { id: 'vehicle', title: 'Vehicle', desc: 'Year, make, model, trim and fuel from the VIN.', icon: ICONS.vehicle,
      how: 'The VIN is on your registration, insurance card, or the driver’s side of the dashboard. Looking it up asks NHTSA, the US government’s free vehicle database.',
      actions: [{ label: 'Add a vehicle', primary: true, run: () => { goTo('home'); openComposer('home', { kind: 'Vehicle' }); } }] },
    { id: 'health', title: 'Health records', desc: 'Allergies, medications, conditions and immunizations from your patient portal.', icon: ICONS.health,
      how: 'In MyChart or your portal, look for <b>Download my record</b>, <b>Health Summary</b> or <b>Share my record</b>, and save the C-CDA (XML) or FHIR file. US providers are required to offer one.',
      actions: [{ label: 'Choose XML or JSON file', primary: true, run: () => pick('.xml,.json,.ndjson,.zip,text/xml,application/json', true, importHealth) }] },
    { id: 'streaming', title: 'Streaming', desc: 'The shows, movies, music and podcasts you’ve played, with when you started and how much.', icon: ICONS.streaming,
      how: '<b>Netflix:</b> Account → Profiles → pick yours → Viewing activity → <b>Download all</b>. For every profile at once: Account → Security → Download your personal information (the zip arrives within 30 days). '
        + '<b>Spotify:</b> Account → Privacy settings → Download your data. “Account data” covers the past year and takes about 5 days; “Extended streaming history” covers everything and takes up to 30. Choose the zip. '
        + '<b>Apple Music:</b> privacy.apple.com → Request a copy of your data → <b>Apple Media Services information</b>. Choose the zip. '
        + '<b>YouTube Music:</b> takeout.google.com → select only YouTube and YouTube Music → change the history format to <b>JSON</b>. Choose the zip. '
        + 'Prime Video, Disney+, Hulu and Max don’t offer a history download yet; add those by hand.',
      actions: [{ label: 'Choose zip, CSV or JSON', primary: true, run: () => pick('.zip,.csv,.json,text/csv,application/json,application/zip', true, importStreaming) }] },
    { id: 'media', title: 'Books & movies', desc: 'What you’ve read and watched, with ratings and dates.', icon: ICONS.media,
      how: '<b>Goodreads:</b> My Books → Import and export → Export library. <b>Letterboxd:</b> Settings → Data → Export your data (choose the zip). <b>IMDb:</b> Your ratings → ⋯ → Export.',
      actions: [{ label: 'Choose CSV or zip', primary: true, run: () => pick('.csv,.zip', true, importMedia) }] },
    audibleSource(audible),
  ];
}

/**
 * Audible (US). While You runs on this computer it connects to the account directly: sign in to
 * Amazon once, then "Sync" reads the library whenever you like. Otherwise it takes the file that
 * `npm run audible -- export` writes. Either way, everything goes through the review list.
 */
function audibleSource(live: AudibleStatus | null): Source {
  const file = { label: 'Choose Audible JSON', primary: !live?.connected && !live?.supported, run: () => pick('.json,application/json', false, async files => {
    try { show('Audible', audibleRows(await files[0].text())); }
    catch { failed('Audible', 'That file could not be read. Choose your Audible library export.'); }
  }) };
  const actions: Source['actions'] = live?.connected
    ? [{ label: 'Sync from Audible', primary: true, run: () => syncAudible(show) }, { ...file, label: 'Choose a file instead' },
      { label: 'Disconnect', run: async () => { const err = await disconnectAudible(); if (err) failed('Audible', err); else openImportHub(['audible']); } }]
    : live?.supported ? [{ label: 'Connect Audible', primary: true, run: () => connectAudible(show, live.kept) }, { ...file, label: 'Choose a file instead' }]
    : [file];
  const how = live?.supported
    ? '<b>Connect</b> signs in to Amazon on Amazon’s own page and registers this computer as an Audible device, the way the Audible app does. '
      + `The connection stays on the computer running You, ${esc(live.kept)}. After that, <b>Sync</b> reads your library, listening status and ownership whenever you like, `
      + 'and refreshes cards you imported before without touching details you changed. This uses Audible’s private app interface, so Audible may change it without notice.'
    : 'Connecting your Audible account works when You runs on your own computer (<b>npm run dev</b>). Here, choose a library file exported with <b>npm run audible -- export</b>.';
  return { id: 'audible', title: 'Audible', icon: ICONS.media, how, actions,
    desc: live?.connected ? 'Connected on this computer. Sync your library, listening status and ownership.' : 'Your library, listening status and ownership, from your Audible account.' };
}

export async function openImportHub(only?: SourceId[]) {
  const audible = !only || only.includes('audible') ? await audibleStatus() : null;
  const list = sources(audible).filter(s => !only || only.includes(s.id));
  const runners: Record<string, () => void> = {};
  openSheet(`${sheetTop('Bring in your data')}
    <h3 class="sh-title">Start with what you already have</h3>
    <p class="hint">Files are read right here on this device and never uploaded. You’ll review everything before it’s added.</p>
    <div class="sources">${list.map(s => `<div class="source">
      <svg viewBox="0 0 24 24" aria-hidden="true">${s.icon}</svg>
      <div class="src-main">
        <b>${esc(s.title)}</b><small>${esc(s.desc)}</small>
        <details><summary>How to get it</summary><p>${s.how}</p></details>
        <div class="src-actions">${s.actions.map((a, i) => { runners[`${s.id}-${i}`] = a.run;
          return `<button type="button" class="btn${a.primary ? ' primary' : ''}" data-act="run" data-k="${s.id}-${i}">${esc(a.label)}</button>`; }).join('')}</div>
      </div></div>`).join('')}</div>
    ${only ? `<div class="btns"><button class="link-btn" type="button" data-act="everything">See all sources</button></div>` : ''}`,
  {
    run: b => runners[b.dataset.k!]?.(),
    everything: () => openImportHub(),
  });
}
