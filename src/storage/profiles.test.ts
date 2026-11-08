import { beforeEach, expect, it } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); },
};
const { placeLabel, listProfiles } = await import('./profiles');

beforeEach(() => store.clear());

it('tells two Yous with the same name apart', () => {
  store.set('you.index', JSON.stringify([
    { id: 'a', label: 'Alex Kim', lastOpened: '2026-11-08T13:00:00Z' },
    { id: 'b', label: 'Alex Kim', lastOpened: '2026-11-08T13:00:00Z' },
    { id: 'c', label: 'Robin', lastOpened: '2026-11-08T13:00:00Z' },
  ]));
  store.set('you.targetName.b', 'alex-kim.you.json');
  const [a, b, c] = listProfiles().map(e => placeLabel(e));
  expect(a).not.toBe(b);
  expect(a).toMatch(/^Alex Kim \(1\) · only in this browser · last opened /);
  expect(b).toMatch(/^Alex Kim \(2\) · saves to alex-kim\.you\.json · last opened /);
  expect(c).toMatch(/^Robin · only in this browser · last opened /);
  for (const l of [a, b, c]) expect(l).not.toContain('�');
});
