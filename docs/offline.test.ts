import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { readFileSync, existsSync } from 'node:fs';

describe('offline static shell', () => {
  it('precaches only real build files and never stores runtime or personal data', async () => {
    const output = await build({ build: { write: false }, logLevel: 'silent' });
    if (Array.isArray(output) || !('output' in output)) throw new Error('Expected one build');
    const sw = output.output.find(file => file.fileName === 'sw.js');
    if (!sw || sw.type !== 'asset') throw new Error('Missing worker');
    const source = String(sw.source);
    const paths: string[] = JSON.parse(source.match(/const PRECACHE = (\[.*\]);/)![1]);
    expect(paths).toContain('index.html');
    expect(paths.some(path => path.endsWith('.wasm'))).toBe(true);
    for (const path of paths) {
      expect(path).not.toMatch(/(^\/|\.\.|:|[?#])/);
      expect(output.output.some(file => file.fileName === path) || existsSync(new URL('../public/' + path, import.meta.url))).toBe(true);
    }
    expect(source).not.toMatch(/indexedDB|localStorage|\.put\(|skipWaiting|clients\.claim/);
    expect(source).toContain('cache.addAll(urls)');
    expect(source).toContain('if (!urls.includes(key)) return');
    expect(source).toContain("url.origin !== self.location.origin");
    expect(source).toContain("request.method !== 'GET'");
    expect(readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')).not.toContain('/__you/');
  }, 30000);
});
