import { describe, it, expect } from 'vitest';
import { fileWriter, FileChanged } from './fileWriter';
function fake() {
  let bytes = 'original', modified = 1, fail = '', active = 0, peak = 0;
  return {
    get bytes() { return bytes; }, get peak() { return peak; },
    change() { bytes = 'elsewhere'; modified++; }, fail(s: string) { fail = s; },
    async getFile() { return Object.assign(new Blob([bytes]), { lastModified: modified }); },
    async createWritable() {
      if (fail === 'denied') throw new DOMException('denied', 'NotAllowedError');
      active++; peak = Math.max(peak, active); let swap = '';
      return { async write(s: string | Blob) { swap += s; }, async close() { if (fail === 'close') throw Error('interrupted'); bytes = swap; modified++; active--; }, async abort() { active--; } };
    },
  };
}
async function* parts(s: string) { yield s; }
describe('safe file writes', () => {
  it('serializes generations so the latest wins', async () => { const h = fake(), w = fileWriter(); await w.load(h); await Promise.all([w.write(h, parts('old')), w.write(h, parts('new'))]); expect(h.bytes).toBe('new'); expect(h.peak).toBe(1); });
  for (const reason of ['denied', 'close']) it(`keeps original after ${reason}`, async () => { const h = fake(), w = fileWriter(); await w.load(h); h.fail(reason); await expect(w.write(h, parts('new'))).rejects.toThrow(); expect(h.bytes).toBe('original'); h.fail(''); await w.write(h, parts('retry')); expect(h.bytes).toBe('retry'); });
  it('refuses a stale writer without changing the other copy', async () => { const h = fake(), w = fileWriter(); await w.load(h); h.change(); await expect(w.write(h, parts('ours'))).rejects.toBeInstanceOf(FileChanged); expect(h.bytes).toBe('elsewhere'); });
});
