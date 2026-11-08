import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

describe('offline shell routing', () => {
  it('normalizes same-origin navigation and excludes helper/API fetches', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const matches: string[] = [];
    const scope = 'https://you.example/app/';
    const source = readFileSync('docs/sw-template.js', 'utf8')
      .replace('__PRECACHE__', JSON.stringify(['index.html', 'assets/app.js']))
      .replace('__VERSION__', 'test');
    runInNewContext(source, {
      URL,
      self: { registration: { scope }, location: new URL(scope), addEventListener: (name: string, fn: any) => { handlers[name] = fn; } },
      caches: { open: async () => ({ match: async (key: string) => { matches.push(key); return 'cached'; } }) },
      fetch: () => { throw new Error('Unexpected network access'); },
    });
    for (const path of ['', '?v=2#interests', 'index.html#life', 'deep/path?q=1#work']) {
      let response: Promise<unknown> | undefined;
      handlers.fetch({ request: { method: 'GET', mode: 'navigate', url: scope + path }, respondWith: (p: Promise<unknown>) => { response = p; } });
      expect(await response).toBe('cached');
    }
    expect(matches).toEqual(Array(4).fill(scope + 'index.html'));
    for (const url of [scope + 'api/personal', 'http://127.0.0.1:4173/helper', 'https://other.example/']) {
      let answered = false;
      handlers.fetch({ request: { method: 'GET', mode: 'cors', url }, respondWith: () => { answered = true; } });
      expect(answered).toBe(false);
    }
  });
});
