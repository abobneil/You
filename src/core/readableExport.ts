import { zip, strToU8 } from 'fflate';
import { kindOf } from './areas';
import { linksOf } from './cards';
import { maskValue } from './formats';
import { overlap } from './life';
import { sha256Hex, isViewableImage, sniff, type Keepsake } from './keepsakes';
import type { Card, Profile } from './types';
import { esc } from '../ui/dom';

export interface ReadableOptions {
  from?: string; to?: string; includeFiles?: boolean; sensitive?: boolean;
  signal?: AbortSignal; progress?: (done: number, total: number) => void;
}
export type KeepsakeReader = (youId: string, keepsake: Keepsake) => Promise<Uint8Array>;
const safe = (s: string) => s.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^\.+$/, '-').trim() || 'file';
const slug = (s: string) => safe(s).slice(0, 80);
const check = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
/** Pure in-memory export: never writes a plaintext working copy or touches browser storage. */
export async function buildReadable(p: Profile, options: ReadableOptions, read: KeepsakeReader) {
  const { signal } = options;
  check(signal);
  const period = options.from === 'unknown' ? 'Date unknown' : options.from ? options.from === (options.to || options.from) ? options.from : `${options.from} to ${options.to}` : 'Everything';
  // Snapshot before asynchronous reads, so edits cannot change the package mid-export.
  const snapshot: Profile = structuredClone(p);
  function redact(c: Card): Card {
    const kind = kindOf(c.area, c.kind);
    const hide = (key?: string) => !options.sensitive && (key ? !!kind.fields?.find(f => f.id === key)?.sensitive || /^(number|account|member|policy|vin|ssn|password)$/i.test(key) : !!kind.sensitive);
    if (hide()) c.value = maskValue(c.value);
    for (const key of Object.keys(c.fields || {})) if (hide(key)) c.fields![key] = maskValue(c.fields![key]);
    for (const r of c.revisions) if (hide(r.field)) r.value = maskValue(r.value);
    // Source snapshots can repeat identifiers in arbitrary importer-specific fields.
    if (!options.sensitive && c.imports) for (const source of Object.values(c.imports)) for (const key of Object.keys(source.fields)) {
      if (hide(key) || kind.sensitive) source.fields[key] = maskValue(source.fields[key]);
    }
    return c;
  }
  snapshot.cards = snapshot.cards.map(redact);
  const entries = snapshot.cards.flatMap(card => {
    const match = options.from === 'unknown' ? (!card.since ? 'possible' : 'none') : options.from ? overlap(card, options.from, options.to || options.from) : 'definite';
    return match === 'none' ? [] : [{ card, overlap: match }];
  }).sort((a, b) => (a.card.since || '9999').localeCompare(b.card.since || '9999') || a.card.id.localeCompare(b.card.id));
  const files: Record<string, Uint8Array> = {};
  const paths = new Map<string, string>();
  const total = entries.reduce((n, e) => n + (e.card.keepsakes?.length || 0), 0);
  let done = 0;
  options.progress?.(done, total);
  for (let i = 0; i < entries.length; i++) {
    const c = entries[i].card;
    for (let j = 0; j < (c.keepsakes?.length || 0); j++) {
      const k = c.keepsakes![j];
      check(signal);
      if (options.includeFiles !== false) {
        const bytes = await read(p.id || '', k);
        check(signal);
        if (await sha256Hex(bytes) !== k.sha256) throw new Error(`The file “${k.name}” did not match its saved fingerprint. No copy was made.`);
        let path = `files/${slug(c.value)}-${i + 1}/${safe(k.name)}`;
        if (files[path]) path = `files/${slug(c.value)}-${i + 1}/${j + 1}-${safe(k.name)}`;
        files[path] = bytes;
        paths.set(`${c.id}:${k.id}`, path);
      }
      options.progress?.(++done, total);
    }
    if (i % 25 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  const text = (label: string, value: unknown) => `<p><b>${esc(label)}:</b> ${esc(value)}</p>`;
  let year = '';
  const body = entries.map(({ card: c, overlap: match }) => {
    const y = c.since.slice(0, 4) || 'Date unknown';
    const heading = y !== year ? `<h2>${esc(y)}</h2>` : ''; year = y;
    return heading + `<article><h3>${esc(c.value)}</h3>${text('Area / kind', `${c.area} / ${c.kind}${c.tag ? ' / ' + c.tag : ''}`)}${text('Dates as entered', `${c.since || 'Date unknown'}${c.until ? ' — ' + c.until : ''}${match === 'possible' ? ' · possibly overlaps this period' : ''}`)}${text('Status', c.status === 'active' ? 'Current' : `History · ${c.replacedBy ? 'replaced by ' + (snapshot.cards.find(x => x.id === c.replacedBy)?.value || c.replacedBy) : 'ended'}`)}${Object.entries(c.fields || {}).map(([k, v]) => text(k, v)).join('')}${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}${c.revisions.length ? '<h4>Earlier wording</h4>' + c.revisions.map(r => text(`${r.field || 'Value'} · ${r.at}`, r.value)).join('') : ''}${linksOf(snapshot, c.id).map(l => text('Link', `${l.label ? l.label + ' · ' : ''}${l.other.kind} · ${l.other.value}`)).join('')}${text('Source', c.source ? `${c.source.from} · ${c.source.at}` : 'Entered by hand')}${text('Recorded', c.recordedAt)}${c.imports ? text('Import metadata', JSON.stringify(c.imports)) : ''}${(c.keepsakes || []).map(k => {
      const path = paths.get(`${c.id}:${k.id}`);
      const href = path?.split('/').map(encodeURIComponent).join('/');
      return `<section>${text('Keepsake', `${k.name} · ${k.size} bytes${k.removedAt ? ' · removed ' + k.removedAt : ''}${k.replacedBy ? ' · replaced by ' + k.replacedBy : ''}`)}${k.alt ? text('Description', k.alt) : ''}${href ? `<a href="${esc(href)}">Original file</a>${isViewableImage(k.type) && sniff(files[path!]) === k.type ? `<p><img src="${esc(href)}" alt="${esc(k.alt || k.name)}"></p>` : ''}` : '<p>File not included.</p>'}</section>`;
    }).join('')}</article>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width"><title>${esc(p.name)} · ${esc(period)}</title><style>body{font:18px/1.6 system-ui,sans-serif;color:#000;background:#fff;max-width:48em;margin:2em auto;padding:0 1em}article{border-bottom:1px solid #aaa;padding:1em 0;overflow-wrap:anywhere}p{margin:.4em 0}.note{white-space:pre-wrap;margin:1em 0}img{max-width:240px;max-height:240px}a{color:#000}@media print{body{margin:0;max-width:none}h2,h3{break-after:avoid}img{max-width:180px}}</style></head><body><h1>${esc(p.name)} · ${esc(period)}</h1><p>This copy is NOT encrypted. Keep it somewhere private.</p>${body || '<p>Nothing recorded for this period.</p>'}</body></html>`;
  const ids = new Set(entries.map(e => e.card.id));
  files['index.html'] = strToU8(html);
  files['record.json'] = strToU8(JSON.stringify({ format: 'you-readable', version: 1, name: p.name, period: { label: period, from: options.from || null, to: options.to || options.from || null }, sensitiveIncluded: !!options.sensitive, filesIncluded: options.includeFiles !== false, cards: entries.map(e => ({ ...e.card, overlap: e.overlap, readableLinks: linksOf(snapshot, e.card.id).map(l => ({ id: l.other.id, kind: l.other.kind, value: l.other.value, label: l.label })), keepsakes: e.card.keepsakes?.map(k => ({ ...k, path: paths.get(`${e.card.id}:${k.id}`) || null })) })), links: snapshot.links.filter(l => ids.has(l.a) && ids.has(l.b)) }, null, 2));
  check(signal);
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const abort = () => { terminate(); reject(new DOMException('Cancelled', 'AbortError')); };
    const terminate = zip(files, { level: 0 }, (err, data) => { signal?.removeEventListener('abort', abort); err ? reject(err) : resolve(data); });
    signal?.addEventListener('abort', abort, { once: true });
  });
  check(signal);
  return { bytes, name: `${safe(p.name)} ${safe(period)} (readable).zip` };
}
