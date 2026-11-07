// Where the Audible connection is kept on this computer. Never in You's data, the repository, or any
// output. The best place available is used:
//
//   Windows        Windows DPAPI under %LOCALAPPDATA%\YouAudible (only this Windows account can read it).
//                  Same files as the earlier Python adapter, so an existing connection keeps working.
//   Linux desktop  The system keyring (GNOME Keyring, KWallet…) through secret-tool, unlocked at login.
//   Anywhere else  A private file in ~/.config/you-audible (folder 0700, file 0600), like SSH keys.
//                  If YOU_AUDIBLE_PASSPHRASE is set, the file is also encrypted with it (scrypt + AES-256-GCM).
//
// Secrets reach helper programs over stdin, never on a command line.
import { execFile } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** "us" holds the connection; "pending" a sign-in that was started but not finished. */
export type Name = 'us' | 'pending';

export interface Store {
  kind: 'windows' | 'keyring' | 'file';
  /** How the connection is protected, for people: "locked to your Windows account". */
  describe: string;
  read(name: Name): Promise<string | null>;
  write(name: Name, text: string): Promise<void>;
  remove(name: Name): Promise<void>;
  /** Whether something is saved, without unlocking it. */
  has(name: Name): Promise<boolean>;
}

interface Run { code: number; stdout: string; stderr: string }
function run(cmd: string, args: string[], input?: string): Promise<Run> {
  return new Promise(resolve => {
    const child = execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, timeout: 30_000 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : -1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(input ?? '');
  });
}

function atomicWrite(path: string, data: string | Buffer, mode?: number) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data, mode === undefined ? undefined : { mode });
  if (mode !== undefined) chmodSync(tmp, mode);
  renameSync(tmp, path);
}

// ---------- Windows: DPAPI ----------

function windowsStore(): Store {
  const dir = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'YouAudible');
  const file = (name: Name) => join(dir, `${name}.dpapi`);
  const dpapi = async (b64: string, op: 'Protect' | 'Unprotect') => {
    const script = 'Add-Type -AssemblyName System.Security;'
      + '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());'
      + `$o=[System.Security.Cryptography.ProtectedData]::${op}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);`
      + '[Console]::Out.Write([Convert]::ToBase64String($o))';
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], b64);
    if (r.code !== 0) {
      throw new Error(op === 'Unprotect' ? 'The saved Audible connection couldn’t be unlocked by this Windows account. Connect again.'
        : 'Windows couldn’t protect the Audible connection.');
    }
    return Buffer.from(r.stdout.trim(), 'base64');
  };
  return {
    kind: 'windows', describe: 'locked to your Windows account',
    async read(name) {
      if (!existsSync(file(name))) return null;
      return (await dpapi(readFileSync(file(name)).toString('base64'), 'Unprotect')).toString('utf8');
    },
    async write(name, text) {
      mkdirSync(dir, { recursive: true });
      atomicWrite(file(name), await dpapi(Buffer.from(text, 'utf8').toString('base64'), 'Protect'));
    },
    async remove(name) { rmSync(file(name), { force: true }); },
    async has(name) { return existsSync(file(name)); },
  };
}

// ---------- Linux desktop: Secret Service keyring ----------

const attrs = (name: Name) => ['service', 'you-audible', 'key', name];

/** True when secret-tool exists and a keyring service answers (a lookup that finds nothing, quietly). */
export async function keyringAvailable(): Promise<boolean> {
  if (process.platform !== 'linux') return false;
  const r = await run('secret-tool', ['lookup', 'service', 'you-audible', 'key', '__probe__']);
  // Missing program: ENOENT (code not a number). No D-Bus or no keyring: an error message on stderr.
  return (r.code === 0 || r.code === 1) && !r.stderr.trim();
}

function keyringStore(): Store {
  return {
    kind: 'keyring', describe: 'in your system keyring',
    async read(name) {
      const r = await run('secret-tool', ['lookup', ...attrs(name)]);
      if (r.code === 0 && r.stdout) return r.stdout;
      if (r.code === 1 && !r.stderr.trim()) return null;
      throw new Error('The system keyring couldn’t be read. Unlock it (log in to the desktop) and try again.');
    },
    async write(name, text) {
      const r = await run('secret-tool', ['store', `--label=You: Audible connection (${name})`, ...attrs(name)], text);
      if (r.code !== 0) throw new Error('The system keyring couldn’t save the Audible connection.');
    },
    async remove(name) { await run('secret-tool', ['clear', ...attrs(name)]); },
    async has(name) { return (await this.read(name)) !== null; },
  };
}

// ---------- Anywhere: a private file, optionally encrypted ----------

const MAGIC = 'you-audible-sealed-v1';

/** scrypt + AES-256-GCM with a passphrase. Exported for tests. */
export function seal(text: string, passphrase: string): string {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return JSON.stringify({ format: MAGIC, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') });
}

export function unseal(stored: string, passphrase: string | undefined): string {
  let box: any = null;
  try { box = JSON.parse(stored); } catch { /* not sealed */ }
  if (box?.format !== MAGIC) return stored;
  if (!passphrase) throw new Error('The saved Audible connection is encrypted. Set YOU_AUDIBLE_PASSPHRASE to the passphrase used when connecting.');
  const key = scryptSync(passphrase, Buffer.from(box.salt, 'base64'), 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  d.setAuthTag(Buffer.from(box.tag, 'base64'));
  try { return Buffer.concat([d.update(Buffer.from(box.data, 'base64')), d.final()]).toString('utf8'); }
  catch { throw new Error('YOU_AUDIBLE_PASSPHRASE doesn’t match the one used when connecting.'); }
}

export function fileStore(dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'you-audible')): Store {
  const file = (name: Name) => join(dir, `${name}.json`);
  const passphrase = () => process.env.YOU_AUDIBLE_PASSPHRASE || undefined;
  return {
    kind: 'file',
    describe: passphrase() ? `in ${dir}, encrypted with YOU_AUDIBLE_PASSPHRASE` : `in a private file only your user can read (${dir})`,
    async read(name) { return existsSync(file(name)) ? unseal(readFileSync(file(name), 'utf8'), passphrase()) : null; },
    async write(name, text) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') chmodSync(dir, 0o700);
      const p = passphrase();
      atomicWrite(file(name), p ? seal(text, p) : text, 0o600);
    },
    async remove(name) { rmSync(file(name), { force: true }); },
    async has(name) { return existsSync(file(name)); },
  };
}

// ---------- choosing ----------

let chosen: Promise<Store> | undefined;

/** The store for this computer. YOU_AUDIBLE_STORE=file forces the private file (for servers). */
export function store(): Promise<Store> {
  return chosen ??= (async () => {
    if (process.env.YOU_AUDIBLE_STORE === 'file') return fileStore();
    if (process.platform === 'win32') return windowsStore();
    if (await keyringAvailable()) return keyringStore();
    return fileStore();
  })();
}

export async function load<T>(name: Name): Promise<T | null> {
  const text = await (await store()).read(name);
  return text === null ? null : JSON.parse(text) as T;
}
export async function save(name: Name, value: unknown) { await (await store()).write(name, JSON.stringify(value)); }
export async function remove(name: Name) { await (await store()).remove(name); }
export async function has(name: Name) { return (await store()).has(name); }
