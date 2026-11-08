// Photos and files on a card: the quiet "+ Photo or file" control, thumbnails, and the viewer.
// Pictures are shown only through <img> from blob: URLs of the decrypted bytes (never data:, never an
// iframe), and every URL is revoked when the sheet closes. PDFs and HEIC are offered back as the
// original file with "Save a copy"; they are never rendered in the page.
import { addKeepsake, keepsakeOf, removedKeepsakes, removeKeepsake, replaceKeepsake, restoreKeepsake, setKeepsakeAlt, shownKeepsakes } from '../core/cards';
import { fmtISO } from '../core/dates';
import { checkSize, isViewableImage, LIMIT_TEXT, type Keepsake } from '../core/keepsakes';
import type { Card } from '../core/types';
import { profile, save } from '../state';
import { keepFile, readKeepsake } from '../storage/keepsakeAccess';
import { esc } from './dom';
import { onSheetClose, openSheet, sheetBody, sheetTop } from './sheet';

/** What the file picker offers. On iPhone this brings up Photo Library, Take Photo and Choose File. */
const ACCEPT = 'image/*,application/pdf,.heic,.heif';

// ---------- Blob URLs for pictures, alive only while the sheet is open ----------
const urls = new Map<string, Promise<string | null>>();
onSheetClose(() => {
  for (const u of urls.values()) u.then(x => x && URL.revokeObjectURL(x));
  urls.clear();
});

function pictureUrl(k: Keepsake): Promise<string | null> {
  if (!profile.id || !isViewableImage(k.type)) return Promise.resolve(null);
  let u = urls.get(k.id);
  if (!u) {
    u = readKeepsake(profile.id, k).then(b => URL.createObjectURL(new Blob([b as BlobPart], { type: k.type })), () => null);
    urls.set(k.id, u);
  }
  return u;
}

/** Fills in every <img data-ks-img> under `root` once its bytes are decrypted. */
export function showPictures(root: HTMLElement, list: Keepsake[]) {
  root.querySelectorAll<HTMLImageElement>('img[data-ks-img]').forEach(img => {
    const k = list.find(x => x.id === img.dataset.ksImg);
    if (!k) return;
    pictureUrl(k).then(u => {
      if (u) img.src = u;
      else img.replaceWith(Object.assign(document.createElement('span'), { className: 'ks-ext', textContent: 'Can’t be read' }));
    });
  });
}

export const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
const typeLabel = (k: Keepsake) => (k.type === 'application/pdf' ? 'PDF' : k.type === 'image/heic' ? 'HEIC photo' : 'Photo');
const altOf = (k: Keepsake) => k.alt || `${typeLabel(k)}: ${k.name}`;

/** The inside of a thumbnail: a picture, or a tile with the file's name and size. */
function thumbInner(k: Keepsake) {
  return isViewableImage(k.type)
    ? `<img data-ks-img="${esc(k.id)}" alt="">`
    : `<span class="ks-ext">${esc(typeLabel(k))}</span><span class="ks-name">${esc(k.name)}</span><small>${esc(fmtSize(k.size))}</small>`;
}

/** The "+ Photo or file" control with its stated limit, any thumbnails, and a message line. */
export function attachHtml(thumbs: string, msg = '', msgHtml = '') {
  return `<div class="ks">
    ${thumbs ? `<div class="ks-thumbs">${thumbs}</div>` : ''}
    <div class="ks-add-row"><button class="chip" type="button" data-act="ks-add">+ Photo or file</button><span class="hint">${esc(LIMIT_TEXT)}</span></div>
    <p class="ks-msg" role="status" aria-live="polite">${msgHtml || esc(msg)}</p>
  </div>`;
}

/** Opens the system picker. Resolves with the chosen files (empty if cancelled). */
export function pickFiles(multiple = true): Promise<File[]> {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: ACCEPT, multiple, hidden: true });
  sheetBody.append(input);
  return new Promise(resolve => {
    const done = () => { resolve([...(input.files ?? [])]); input.remove(); };
    input.addEventListener('change', done, { once: true });
    input.addEventListener('cancel', done, { once: true });
    input.click();
  });
}

/** Checks, encrypts and stores each file. Refused files change nothing and come back as plain reasons. */
export async function keepFiles(files: File[]): Promise<{ added: Keepsake[]; reasons: string[] }> {
  const added: Keepsake[] = [], reasons: string[] = [];
  for (const f of files) {
    const early = checkSize(f.name, f.size);
    if (early) { reasons.push(early.reason); continue; }
    try {
      const r = await keepFile(f.name, new Uint8Array(await f.arrayBuffer()));
      if (r.ok) added.push(r.keepsake); else reasons.push(r.reason);
    } catch {
      reasons.push(`“${f.name}” couldn't be read from your device. Nothing was attached.`);
    }
  }
  return { added, reasons };
}

/** Shows "Keeping it safe…" while files are encrypted. */
export function busy(root: HTMLElement) {
  const m = root.querySelector('.ks-msg');
  if (m) m.textContent = 'Keeping it safe…';
  root.querySelector<HTMLButtonElement>('[data-act="ks-add"]')?.setAttribute('disabled', '');
}

// ---------- Composer: drafted keepsakes ----------

/** Thumbnails in the composer, each with a × to take it back out. */
export const draftThumbs = (list: Keepsake[]) => list.map(k =>
  `<span class="ks-thumb">${thumbInner(k)}<button class="ks-x" type="button" data-act="ks-drop" data-ks="${esc(k.id)}" aria-label="Remove ${esc(k.name)}">×</button></span>`).join('');

// ---------- Card view ----------

export interface CardKsState { msg?: string; undo?: string }

/** The card's photos and files, plus the add control. */
export function cardKeepsakesHtml(c: Card, st: CardKsState = {}) {
  const thumbs = shownKeepsakes(c).map(k =>
    `<button class="ks-thumb" type="button" data-act="ks-open" data-ks="${esc(k.id)}" aria-label="Open ${esc(altOf(k))}">${thumbInner(k)}</button>`).join('');
  const undone = st.undo ? keepsakeOf(c, st.undo) : undefined;
  const undo = undone ? `Removed “${esc(undone.name)}”. <button class="link-btn" type="button" data-act="ks-restore" data-ks="${esc(undone.id)}">Undo</button>` : '';
  return `<div class="block">${attachHtml(thumbs, st.msg, undo)}</div>`;
}

/** Removed and replaced keepsakes, under the card's history, each restorable. */
export function removedKeepsakesHtml(c: Card) {
  const gone = removedKeepsakes(c);
  if (!gone.length) return '';
  return `<div class="block"><h5>Removed files</h5><ul class="revs">${gone.map(k => {
    const by = k.replacedBy ? keepsakeOf(c, k.replacedBy) : undefined;
    return `<li>${esc(k.name)} · ${by ? `replaced by “${esc(by.name)}”` : 'removed'} ${esc(fmtISO(k.removedAt!))}
      <button class="link-btn" type="button" data-act="ks-open" data-ks="${esc(k.id)}">View</button>
      <button class="link-btn" type="button" data-act="ks-restore" data-ks="${esc(k.id)}">Restore</button></li>`;
  }).join('')}</ul></div>`;
}

/** How an earlier description reads in "Earlier wording". */
export function altRevisionLabel(c: Card, field: string) {
  const id = field.split(':')[1];
  const k = keepsakeOf(c, id);
  return `Description of “${esc(k?.name ?? 'a file')}”: `;
}

type Reopen = (st?: CardKsState & { focus?: string }) => void;

/** Click handlers for the card view's keepsake controls. */
export function cardKeepsakeHandlers(c: Card, reopen: Reopen): Record<string, (b: HTMLElement) => void> {
  return {
    'ks-add': async () => {
      const files = await pickFiles();
      if (!files.length) return;
      busy(sheetBody);
      const { added, reasons } = await keepFiles(files);
      for (const k of added) addKeepsake(profile, c.id, k);
      if (added.length) save();
      reopen({ msg: reasons.join(' '), focus: '[data-act="ks-add"]' });
    },
    'ks-open': b => openViewer(c, b.dataset.ks!, reopen),
    'ks-restore': b => {
      if (restoreKeepsake(profile, c.id, b.dataset.ks!)) save();
      reopen({ focus: `[data-act="ks-open"][data-ks="${b.dataset.ks}"]` });
    },
  };
}

// ---------- Viewer ----------

async function saveCopy(k: Keepsake) {
  const bytes = await readKeepsake(profile.id!, k);
  const a = document.createElement('a');
  // A generic type, so the browser saves the original file instead of trying to show it.
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
  a.download = k.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** One keepsake, opened: look at it, describe it, save a copy, replace or remove it. */
export function openViewer(c: Card, id: string, back: Reopen, msg = '') {
  const k = keepsakeOf(c, id);
  if (!k) return back();
  const removed = !!k.removedAt;
  const thumbFocus = `[data-act="ks-open"][data-ks="${id}"]`;
  const view = isViewableImage(k.type)
    ? `<img class="ks-big" data-ks-img="${esc(k.id)}" alt="${esc(altOf(k))}">`
    : `<div class="ks-tile"><span class="ks-ext">${esc(typeLabel(k))}</span><b>${esc(k.name)}</b><small>${esc(fmtSize(k.size))}</small>
        <p class="hint">${k.type === 'application/pdf' ? 'PDFs open in your own reader.' : 'This kind of photo opens in your Photos app.'} Save a copy to look at it.</p></div>`;
  openSheet(`${sheetTop(`${esc(c.kind)} · ${esc(typeLabel(k))}${removed ? ' <span class="status">Removed</span>' : ''}`)}
    <button class="link-btn" type="button" data-act="ks-back">← Back to the card</button>
    <div class="ks-view">${view}</div>
    <p class="hint">${esc(k.name)} · ${esc(fmtSize(k.size))} · added ${esc(fmtISO(k.addedAt))}</p>
    <div class="fx"><label for="ks-alt">Describe it for people who can’t see it</label>
      <textarea id="ks-alt" rows="2" class="note-input">${esc(k.alt ?? '')}</textarea></div>
    <p class="ks-msg" role="status" aria-live="polite">${esc(msg)}</p>
    <div class="btns">
      <button class="btn" type="button" data-act="ks-save">Save a copy</button><span class="spacer"></span>
      ${removed
        ? `<button class="btn primary" type="button" data-act="ks-restore">Restore</button>`
        : `<button class="btn" type="button" data-act="ks-remove">Remove</button><button class="btn primary" type="button" data-act="ks-replace">Replace</button>`}
    </div>`,
  {
    'ks-back': () => back({ focus: thumbFocus }),
    'ks-save': async () => {
      try { await saveCopy(k); }
      catch (e) { openViewer(c, id, back, (e as Error).message); }
    },
    'ks-remove': () => {
      if (removeKeepsake(profile, c.id, id)) save();
      back({ undo: id, focus: '[data-act="ks-restore"]' });
    },
    'ks-restore': () => {
      if (restoreKeepsake(profile, c.id, id)) save();
      back({ focus: thumbFocus });
    },
    'ks-replace': async () => {
      const [file] = await pickFiles(false);
      if (!file) return;
      busy(sheetBody);
      const { added, reasons } = await keepFiles([file]);
      if (!added.length) return openViewer(c, id, back, reasons.join(' '));
      if (replaceKeepsake(profile, c.id, id, added[0])) save();
      back({ msg: `Replaced “${k.name}”. The earlier file is under Removed files.`, focus: `[data-act="ks-open"][data-ks="${added[0].id}"]` });
    },
  });
  showPictures(sheetBody, [k]);
  const alt = sheetBody.querySelector<HTMLTextAreaElement>('#ks-alt')!;
  alt.addEventListener('change', () => {
    if (!setKeepsakeAlt(profile, c.id, id, alt.value)) return;
    save();
    const img = sheetBody.querySelector<HTMLImageElement>('img.ks-big');
    if (img) img.alt = altOf(k);
  });
  sheetBody.querySelector<HTMLElement>('[data-act="ks-back"]')?.focus();
}
