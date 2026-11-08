// Release builder: YOU_APP_URL must identify the static deployment being shipped.
import { build } from 'esbuild';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
const app = process.env.YOU_APP_URL || 'http://127.0.0.1:4173';
const u = new URL(app);
if (!process.env.YOU_APP_URL) console.log('YOU_APP_URL is not set: the helper will ask for the app address when it starts.');
if (u.protocol !== 'https:' && !(['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol === 'http:')) throw new Error('YOU_APP_URL must use HTTPS');
const result = await build({ stdin: { contents: `import { launch } from './server/audible/standalone.ts'; import { createInterface } from 'node:readline'; const configured = process.env.YOU_APP_URL; if (configured) launch(configured); else { const rl = createInterface({input:process.stdin,output:process.stdout}); rl.question('Paste the You app address shown in your browser, then press Enter: ', answer => { rl.close(); launch(answer.trim() || ${JSON.stringify(app)}); }); }`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false });
const files = {
  'helper.cjs': result.outputFiles[0].contents,
  'You Audible helper.cmd': strToU8('@echo off\r\ncd /d "%~dp0"\r\nnode helper.cjs\r\nif errorlevel 1 pause\r\n'),
  'You Audible helper.command': [strToU8('#!/bin/sh\ncd "$(dirname "$0")"\nif ! command -v node >/dev/null; then echo "Install Node 22.18 or newer from nodejs.org first."; read answer; exit 1; fi\nnode helper.cjs\n'), { attrs: 0o100755 << 16 }],
  'Read me.txt': strToU8(`Windows: use you-audible-helper-win.exe for no-Node installation. This fallback zip requires Node 22.18 or newer installed from nodejs.org. Paste the app address when prompted. Extract the whole zip. Double-click You Audible helper.cmd on Windows or You Audible helper.command on macOS. Keep its window open. It opens ${app}. In You choose Import, Audible, Connect. macOS may require approving the downloaded launcher in System Settings. No credentials are included. No app files are served. Close the window to stop. On Linux run node helper.cjs. This build allows only ${u.origin} (or the address you paste when it starts) and nothing else.\n`),
};
await mkdir('dist/downloads', { recursive: true });
await writeFile('dist/downloads/you-audible-helper.zip', zipSync(files));

if (process.platform === 'win32') {
  await mkdir('.helper-build', { recursive: true });
  await writeFile('.helper-build/helper.cjs', result.outputFiles[0].contents);
  await writeFile('.helper-build/sea.json', JSON.stringify({ main: '.helper-build/helper.cjs', output: '.helper-build/sea.blob', disableExperimentalSEAWarning: true }));
  execFileSync(process.execPath, ['--experimental-sea-config', '.helper-build/sea.json'], { stdio: 'inherit' });
  await copyFile(process.execPath, 'dist/downloads/you-audible-helper-win.exe');
  execFileSync(process.execPath, ['node_modules/postject/dist/cli.js', 'dist/downloads/you-audible-helper-win.exe', 'NODE_SEA_BLOB', '.helper-build/sea.blob', '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });
}
console.log('Built helper: explicit app-address pairing at startup; YOU_APP_URL overrides pairing.');
