// Connecting to Audible straight from You. This works while You runs on this computer (npm run dev or
// npm run preview): the page talks to the local connection in server/audible, which signs requests
// with a device key kept under the person's Windows account. A published copy of You has no such
// connection; audibleStatus() then returns null and only the file import is offered.
import { audibleRows } from '../../core/import/audible';
import type { ImportResult } from '../../core/import/types';
import { esc } from '../dom';
import { openSheet, sheetTop } from '../sheet';

const BASE = '/__you/audible/';
export interface AudibleStatus { supported: boolean; connected: boolean; pending: boolean }

async function call<T>(action: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(BASE + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-You-Local': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error || 'The Audible connection didn’t answer. Is You still running on this computer?');
  return json as T;
}

/** Whether Audible can be connected from here, or null when You isn't running locally. */
export async function audibleStatus(): Promise<AudibleStatus | null> {
  try {
    const s = await call<AudibleStatus>('status', undefined, 1500);
    return typeof s.connected === 'boolean' ? s : null;
  } catch { return null; }
}

type Show = (source: string, result: ImportResult) => void;
const message = (e: unknown) => (e instanceof DOMException && e.name === 'TimeoutError'
  ? 'Audible took too long to answer. Try again.' : (e as Error)?.message || 'Something went wrong.');

/** Reads the library and goes to the review list. Closing the sheet meanwhile cancels the review. */
export async function syncAudible(show: Show) {
  openSheet(`${sheetTop('Import · Audible')}
    <h3 class="sh-title">Reading your Audible library…</h3>
    <p class="hint">This usually takes a few seconds. Nothing is added until you’ve reviewed it.</p>`);
  let cancelled = false;
  document.getElementById('sheet')!.addEventListener('close', () => { cancelled = true; }, { once: true });
  try {
    const library = await call<unknown>('export', {}, 180_000);
    if (!cancelled) show('Audible', audibleRows(JSON.stringify(library)));
  } catch (e) {
    if (!cancelled) show('Audible', { rows: [], notes: [message(e)] });
  }
}

/** Sign in to Amazon, paste the address it ends on, and this computer becomes an Audible device. */
export async function connectAudible(show: Show) {
  let url: string;
  try { url = (await call<{ url: string }>('sign-in', {}, 15_000)).url; }
  catch (e) { return show('Audible', { rows: [], notes: [message(e)] }); }

  openSheet(`${sheetTop('Connect Audible')}
    <h3 class="sh-title">Sign in to Amazon</h3>
    <ol class="steps">
      <li><p>Open Amazon’s sign-in page and sign in, including any verification code.</p>
        <a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open Amazon sign-in</a></li>
      <li><p>Amazon finishes on a page that looks blank or broken. That’s expected. Copy the whole address from the
        address bar (it starts with <b>https://www.amazon.com/ap/maplanding</b>) and paste it here within 30 minutes.</p>
        <input id="aud-url" class="aud-url" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the address" aria-label="Address Amazon finished on"></li>
    </ol>
    <p class="hint aud-msg" id="aud-msg" role="status"></p>
    <p class="hint">Your Amazon password is only ever typed on Amazon’s page. This computer keeps the connection, locked to
      your Windows account. It isn’t part of your You data and never leaves this computer.</p>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button>
      <button class="btn primary" type="button" data-act="finish">Connect</button></div>`,
  {
    finish: async () => {
      const input = document.getElementById('aud-url') as HTMLInputElement;
      const msg = document.getElementById('aud-msg')!;
      const go = document.querySelector<HTMLButtonElement>('#sheet [data-act="finish"]')!;
      if (!input.value.trim()) { msg.textContent = 'Paste the address first.'; input.focus(); return; }
      go.disabled = true;
      msg.textContent = 'Connecting…';
      try {
        await call('finish', { redirect: input.value.trim() }, 30_000);
        input.value = '';
        await syncAudible(show);
      } catch (e) {
        msg.textContent = message(e);
        go.disabled = false;
      }
    },
  });
  document.getElementById('aud-url')!.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.querySelector<HTMLButtonElement>('#sheet [data-act="finish"]')!.click(); }
  });
}

/** Forgets the connection on this computer. */
export async function disconnectAudible(): Promise<string> {
  try { await call('disconnect', {}, 10_000); return ''; } catch (e) { return message(e); }
}
