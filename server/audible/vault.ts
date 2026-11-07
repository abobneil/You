// Where the Audible connection is kept: %LOCALAPPDATA%\YouAudible, encrypted with Windows DPAPI for
// the current user. Only this Windows account can read it; it never goes into You's data, the
// repository, or any output. Same files and format as the earlier Python adapter, so an existing
// connection keeps working. Secrets pass to PowerShell over stdin, never on a command line.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const supported = () => process.platform === 'win32';

export function vaultDir(): string {
  if (!supported()) throw new Error('Connecting Audible currently needs Windows, which protects the connection with your Windows account.');
  const dir = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '.', 'AppData', 'Local'), 'YouAudible');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const files = {
  auth: () => join(vaultDir(), 'us.dpapi'),
  pending: () => join(vaultDir(), 'pending.dpapi'),
};

/** Runs .NET's ProtectedData (DPAPI, CurrentUser) in Windows PowerShell on base64 from stdin. */
function dpapi(input: Buffer, op: 'Protect' | 'Unprotect'): Promise<Buffer> {
  const script = 'Add-Type -AssemblyName System.Security;'
    + '$b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim());'
    + `$o=[System.Security.Cryptography.ProtectedData]::${op}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);`
    + '[Console]::Out.Write([Convert]::ToBase64String($o))';
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
        if (err) return reject(new Error(op === 'Unprotect'
          ? 'The saved Audible connection couldn’t be unlocked by this Windows account. Connect again.'
          : 'Windows couldn’t protect the Audible connection.'));
        resolve(Buffer.from(stdout.trim(), 'base64'));
      });
    child.stdin!.end(input.toString('base64'));
  });
}

export async function save(path: string, value: unknown): Promise<void> {
  const sealed = await dpapi(Buffer.from(JSON.stringify(value), 'utf8'), 'Protect');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, sealed);
  renameSync(tmp, path);
}

export async function load<T>(path: string): Promise<T> {
  return JSON.parse((await dpapi(readFileSync(path), 'Unprotect')).toString('utf8')) as T;
}

export const exists = (path: string) => existsSync(path);
export const remove = (path: string) => rmSync(path, { force: true });
