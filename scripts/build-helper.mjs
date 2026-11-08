// Release builder: YOU_APP_URL must identify the static deployment being shipped.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
const app = process.env.YOU_APP_URL || 'http://127.0.0.1:4173';
const u = new URL(app);
if (u.protocol !== 'https:' && u.origin !== 'http://127.0.0.1:4173') throw new Error('YOU_APP_URL must use HTTPS');
const result = await build({ stdin: { contents: `import { launch } from './server/audible/standalone.ts'; launch(${JSON.stringify(app)});`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', target: 'node22', write: false });
const files = {
  'helper.cjs': result.outputFiles[0].contents,
  'You Audible helper.cmd': strToU8('@echo off\r\ncd /d "%~dp0"\r\nnode helper.cjs\r\nif errorlevel 1 pause\r\n'),
  'You Audible helper.command': [strToU8('#!/bin/sh\ncd "$(dirname "$0")"\nif ! command -v node >/dev/null; then echo "Install Node 22.18 or newer from nodejs.org first."; read answer; exit 1; fi\nnode helper.cjs\n'), { attrs: 0o100755 << 16 }],
  'Read me.txt': strToU8(`Requires Node 22.18 or newer installed from nodejs.org. Extract the whole zip. Double-click You Audible helper.cmd on Windows or You Audible helper.command on macOS. Keep its window open. It opens ${app}. In You choose Import, Audible, Connect. macOS may require approving the downloaded launcher in System Settings. No credentials are included. No app files are served. Close the window to stop. On Linux run node helper.cjs. This build allows only ${u.origin} and http://127.0.0.1:4173.\n`),
};
await mkdir('dist/downloads', { recursive: true });
await writeFile('dist/downloads/you-audible-helper.zip', zipSync(files));
console.log(`Built launcher zip for ${app}. SEA unavailable: postject is not installed and this Node has no --build-sea. Configure YOU_APP_URL for production releases.`);
