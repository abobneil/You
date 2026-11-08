// Every source file must be valid UTF-8: a stray Latin-1 byte shows up as "�" in the app.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const TEXT = /\.(ts|css|html|md|mjs|json|webmanifest|svg|js)$/;
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : TEXT.test(n) ? [p] : [];
});

it('all source files are valid UTF-8', () => {
  const bad: string[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const f of [...walk('src'), ...walk('public'), 'index.html']) {
    try { decoder.decode(readFileSync(f)); } catch { bad.push(f); }
  }
  expect(bad).toEqual([]);
});
