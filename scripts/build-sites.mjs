import { execFileSync } from 'node:child_process';

process.env.YOU_SITES_BUILD = '1';
process.env.VITE_SITES_BUILD = '1';
for (const args of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.server.json'],
  ['node_modules/vite/bin/vite.js', 'build'],
  ['scripts/build-helper.mjs'],
]) execFileSync(process.execPath, args, { stdio: 'inherit', env: process.env });
