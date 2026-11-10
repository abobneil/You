import { audibleRows } from '../../core/import/audible';
import type { ImportResult } from '../../core/import/types';
import { esc } from '../dom';
import { openSheet, sheetTop } from '../sheet';

const BASE = 'http://127.0.0.1:49631/__you/audible/';
export const helperInfo = 'Needs the You Audible helper on this computer';
export const helperDownload = '/downloads/you-audible-helper.zip';
export const audibleTraffic = 'With your permission, Amazon sign-in opens www.amazon.com; registration contacts api.amazon.com. Sync reads your US library, ownership, completion and saved listening positions from api.audible.com (or its DNS-published d*.cloudfront.net host if needed). It never changes your library. Credentials stay on this computer in the OS protected storage: Windows DPAPI, macOS Keychain or Linux keyring. If unavailable, a disclosed private file is used instead; it is not encrypted unless a developer configures a passphrase.';
/** `kept` says how the connection is protected: "locked to your Windows account", "in your system keyring"… */
export interface AudibleStatus { supported: boolean; connected: boolean; pending: boolean; kept: string }

async function call<T>(action: string, body: unknown, timeoutMs: number): Promise<T> {
  const res = await fetch(BASE + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'X-You-Local': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) throw new Error(json?.error || 'The Audible connection didn’t answer. Is You still running on this computer?');
  return json as T;
}

/** Whether Audible can be connected from here, or null when You isn't running locally. */
export async function audibleStatus(): Promise<AudibleStatus | null> {
  // Status is local only; no provider traffic or credentials are read.
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
    <p class="hint">${esc(audibleTraffic)}</p>
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
export function connectAudible(show: Show, kept: string) {
  // Asked in the app's own sheet, naming every host, before anything leaves this computer.
  openSheet(`${sheetTop('Connect Audible')}
    <h3 class="sh-title">Allow this connection?</h3>
    <p class="hint">${esc(audibleTraffic)}</p>
    <div class="btns"><button type="button" class="btn quiet" data-act="close">Cancel</button><button type="button" class="btn primary" data-act="allow">Allow and sign in</button></div>`, {
    allow: () => { void signInAudible(show, kept); },
  });
}

async function signInAudible(show: Show, kept: string) {
  let url: string;
  try { url = (await call<{ url: string }>('sign-in', {}, 15_000)).url; }
  catch (e) { return show('Audible', { rows: [], notes: [message(e)] }); }

  const signIn = new URL(url);
  if (signIn.protocol !== 'https:' || signIn.hostname !== 'www.amazon.com') {
    return show('Audible', { rows: [], notes: ['The helper returned an invalid Amazon sign-in address.'] });
  }
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
    <p class="hint">Your Amazon password is only ever typed on Amazon’s page. The computer running You keeps the connection
      ${esc(kept)}. It isn’t part of your You data and never leaves that computer.</p>
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

/** Shared markup for the source-card owner; file selection remains in the import hub. */
export function helperConnectionHtml(live: AudibleStatus | null): string {
  if (import.meta.env.VITE_SITES_BUILD === '1') return `<p>${helperInfo}. <a href="${helperDownload}" download>Get the helper launcher ZIP</a> (requires Node 22.18 or newer on your computer). Paste this address when the helper asks: <b>${esc(location.origin)}</b>.</p>`;
  return `<p>${helperInfo}. <a href="/downloads/you-audible-helper-win.exe" download>Get the Windows helper</a> (no Node installation needed). <a href="${helperDownload}" download>Other systems / launcher zip</a> (requires Node). Paste this address when the helper asks: <b>${esc(location.origin)}</b>.</p>
    <p role="status">${live?.connected ? 'Connected' : live ? 'Helper connected — sign in to Audible' : 'Not running / not connected'}</p>
    <p>Or import an export file. This works when the helper is unavailable or Audible has a problem.</p>
    <p>${esc(audibleTraffic)}</p>`;
}
