import { decode, readText } from '../storage/fileFormat';
import { WrongPassphrase } from './crypto';

const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export interface AccessPlan { recipient: string; fileName: string; location: string; origin: string; printPassphrase?: boolean; passphrase?: string }
/** The plan's content (no page wrapper or styles), for printing inside the app with app.css's print rules. */
export function planBody(p: AccessPlan): string {
  const line = p.printPassphrase && p.passphrase ? escape(p.passphrase) : '________________________________';
  return `<h1>Plan for someone you trust</h1><p>Keep this sheet somewhere private. Anyone with the passphrase and the file can read everything.</p><p>For: ${escape(p.recipient)}</p><p>You is a private record of a person's life. No account is needed.</p><p>File: ${escape(p.fileName)}</p><p>Where it is kept: ${escape(p.location)}</p><p>Passphrase: ${line}</p><p>Write it here, or tell them where it's kept.</p><h2>How to open it</h2><ol><li>Go to ${escape(p.origin)} or any copy of You.</li><li>Choose “or load your data” and pick the file.</li><li>Type the passphrase.</li></ol><p>A technical helper can read the file without You: see docs/FORMAT.md at ${escape(p.origin)}/FORMAT.md</p>`;
}
/** The plan as a standalone page (the download). It carries its own styles and a strict policy. */
export function buildPlan(p: AccessPlan): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width"><title>Your private access plan</title><style>body{font:18px/1.5 system-ui;color:#000;background:#fff;max-width:42rem;margin:2rem auto;padding:1rem;overflow-wrap:anywhere}h1{font-size:26px}p{white-space:pre-wrap}@media print{body{margin:0}}</style><body>${planBody(p)}</body></html>`;
}
/** Pure read-only check: no session, storage, or save dependencies. */
export async function checkFile(text: string, passphrase: string): Promise<{ ok: true; cards: number; lastSaved: string | null } | { ok: false; message: string }> {
  try {
    const read = readText(text);
    if (read.kind !== 'locked') return { ok: false, message: 'This file is not passphrase-protected. Choose an encrypted .you.json file.' };
    const { profile } = await decode(passphrase, read.env);
    return { ok: true, cards: profile.cards.length, lastSaved: profile.updatedAt || null };
  } catch (e) {
    return { ok: false, message: e instanceof WrongPassphrase ? 'That passphrase didn’t work. Try again.' : 'That file could not be checked. Choose a You file and try again.' };
  }
}
