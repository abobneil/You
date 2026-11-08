// P2/P3: personal free text must not land in the browser's (unencrypted) autofill store.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const files = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.test.ts') ? [p] : [];
});

it('every text field in the app turns autofill off, except the name and passphrase fields', () => {
  const sources = [...files('src/ui').map(f => [f, readFileSync(f, 'utf8')]), ['index.html', readFileSync('index.html', 'utf8')]];
  const missing: string[] = [];
  for (const [file, text] of sources) {
    for (const m of text.matchAll(/<(input|textarea)\b[^>]*>/g)) {
      const tag = m[0];
      if (/type="(file|checkbox|radio|hidden)"/.test(tag)) continue;
      if (/autocomplete=/.test(tag) || /\$\{attrs\}/.test(tag)) continue;
      // Password managers need these.
      if (/id="(gate-pass|gate-again|gate-user|name)"/.test(tag)) continue;
      missing.push(`${file}: ${tag.slice(0, 80)}`);
    }
  }
  expect(missing).toEqual([]);
});

it('the value field never asks the browser to remember card values', () => {
  expect(readFileSync('src/ui/valueField.ts', 'utf8')).toContain(`'autocomplete="off"'`);
});
