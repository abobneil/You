// What You can ask of Audible: connect, read the library, disconnect. Shared by the in-app
// connection (plugin.ts, while You runs on this computer) and the command line (cli.ts).
import { codeFromRedirect, createVerifier, deviceSerial, readRegistration, registrationBody, signInUrl, UserError, type AudibleAuth, type Pending } from './auth.ts';
import { AudibleClient, postAmazon, type Route } from './http.ts';
import { snapshot } from './library.ts';
import * as vault from './vault.ts';

const SIGN_IN_WINDOW_S = 30 * 60;

export interface Status { supported: boolean; connected: boolean; pending: boolean; kept: string }

export async function status(): Promise<Status> {
  const store = await vault.store();
  return { supported: true, connected: await vault.has('us'), pending: await vault.has('pending'), kept: store.describe };
}

/** Starts a sign-in: remembers the PKCE verifier and device serial (protected), returns Amazon's URL. */
export async function startSignIn(): Promise<string> {
  const verifier = createVerifier(), serial = deviceSerial();
  const pending: Pending = { verifier: Buffer.from(verifier, 'ascii').toString('base64'), serial, created_at: Date.now() / 1000 };
  await vault.save('pending', pending);
  return signInUrl(verifier, serial);
}

/** Finishes a sign-in with the address Amazon ended on: registers this device and saves the connection. */
export async function finishSignIn(redirect: string): Promise<void> {
  const pending = await vault.load<Pending>('pending');
  if (!pending) throw new UserError('Start connecting first, then paste the address.');
  if (Date.now() / 1000 - pending.created_at > SIGN_IN_WINDOW_S) throw new UserError('That sign-in expired after 30 minutes. Start again.');
  const code = codeFromRedirect(redirect);
  const verifier = Buffer.from(pending.verifier, 'base64').toString('ascii');
  const res = await postAmazon('/auth/register', registrationBody(code, verifier, pending.serial));
  if (res.status !== 200) throw new UserError('Amazon didn’t accept that sign-in. The code works once and expires quickly; start again.');
  await vault.save('us', readRegistration(res.json));
  await vault.remove('pending');
}

let running: Promise<unknown> | null = null;

/** Reads the whole library (read-only requests). One export at a time. */
export async function exportLibrary(o: { activeOnly?: boolean; route?: Route; pageSize?: number } = {}) {
  if (running) throw new UserError('An Audible export is already running.');
  const job = (async () => {
    const auth = await vault.load<AudibleAuth>('us');
    if (!auth) throw new UserError('Audible isn’t connected yet.');
    const client = new AudibleClient(auth, o.route ?? 'auto');
    return snapshot(client, { includeRevoked: !o.activeOnly, pageSize: o.pageSize ?? 250 });
  })();
  running = job;
  try { return await job; } finally { running = null; }
}

/** Forgets the connection on this computer. (The device stays listed on Amazon until removed there.) */
export async function disconnect(): Promise<void> {
  await vault.remove('us');
  await vault.remove('pending');
}

/** A message that's safe to show: our own wording, never response bodies or tokens. */
export function safeMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  const name = (e as Error)?.name;
  if (name === 'HttpError') {
    const s = (e as { status: number }).status;
    return s === 401 || s === 403 ? 'Audible refused the saved connection. Disconnect and connect again.' : `Audible had a problem (${s}). Try again in a minute.`;
  }
  if (name === 'NetworkError') return 'Couldn’t reach Audible. Check the internet connection and try again.';
  if (name === 'ShapeError') return 'Audible answered in an unexpected way, so nothing was imported. Try again later.';
  return e instanceof Error && /Windows|keyring|YOU_AUDIBLE|connection|Connect again/i.test(e.message) ? e.message : 'Something went wrong talking to Audible.';
}
