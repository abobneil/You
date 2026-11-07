// npm run audible -- <command>
//   status                     Is Audible connected on this computer?
//   connect                    Sign in to Amazon and register this computer as an Audible device.
//   export [--output <file>]   Write your library to a file You can import (default exports/audible.you-import.json).
//          [--active-only]     Leave out returned titles.
//          [--direct | --via-cloudfront]  Force a network route (normally chosen automatically).
//   disconnect                 Forget the connection on this computer.
// The easier way is inside You: Import → Audible → Connect, while You runs on this computer.
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { disconnect, exportLibrary, finishSignIn, safeMessage, startSignIn, status } from './service.ts';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

/** Reads a line without echoing it: the sign-in address carries a one-time code. */
function hidden(prompt: string): Promise<string> {
  return new Promise(res => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    (rl as any)._writeToOutput = (s: string) => { if (s.includes(prompt)) process.stdout.write(s); };
    rl.question(prompt, answer => { rl.close(); process.stdout.write('\n'); res(answer); });
  });
}

async function main(): Promise<number> {
  const command = args[0];
  if (command === 'status') {
    const s = status();
    console.log(!s.supported ? 'Connecting Audible currently needs Windows.' : s.connected ? 'Audible is connected on this computer.' : 'Audible isn’t connected. Run: npm run audible -- connect');
    return 0;
  }
  if (command === 'connect') {
    console.log(await startSignIn());
    console.log('\nOpen that address and sign in to Amazon. When it ends on a blank or error page, copy the whole');
    console.log('address from the address bar (it starts with https://www.amazon.com/ap/maplanding).\n');
    await finishSignIn(await hidden('Paste the address (hidden): '));
    console.log('Audible is connected. The connection is protected by your Windows account.');
    return 0;
  }
  if (command === 'export') {
    const route = flag('--via-cloudfront') ? 'cloudfront' : flag('--direct') ? 'direct' : 'auto';
    const result = await exportLibrary({ activeOnly: flag('--active-only'), route });
    const out = resolve(option('--output') ?? 'exports/audible.you-import.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(`${out}.tmp`, JSON.stringify(result, null, 2), 'utf8');
    renameSync(`${out}.tmp`, out);
    console.log(`Exported ${result.items.length} library entries to ${out}`);
    console.log('This file is your personal data, unencrypted. Import it into You, then delete it.');
    return 0;
  }
  if (command === 'disconnect') {
    disconnect();
    console.log('Forgot the Audible connection on this computer. To remove the device from your account too, use Amazon’s “Your devices” page.');
    return 0;
  }
  console.log('Usage: npm run audible -- status | connect | export [--output <file>] [--active-only] | disconnect');
  return command ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(safeMessage(e)); process.exit(1); });
