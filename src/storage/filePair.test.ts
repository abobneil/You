import { describe, expect, it } from 'vitest';
import { createVault, seal } from '../core/crypto';
import { addCard } from '../core/cards';
import { emptyProfile } from '../core/profile';
import type { Profile } from '../core/types';
import { keepBothNames, openCopy, pairProblem, pairSummary } from './filePair';

const you = (id: string, updatedAt: string): Profile => ({ ...emptyProfile(), id, name: 'Alex Kim', updatedAt });

describe('comparing two offline copies', () => {
  it('opens each copy with its own passphrase, in memory, keeping the file text untouched', async () => {
    const p = you('y1', '2026-11-01T10:00:00Z');
    addCard(p, { area: 'home', kind: 'Address', value: '1 Elm St', since: '2020' });
    const text = await seal(await createVault('laptop passphrase', 100_000), JSON.stringify(p));
    const ok = await openCopy('alex.you.json', text, 'laptop passphrase');
    expect('error' in ok).toBe(false);
    if (!('error' in ok)) { expect(ok.profile.cards[0].value).toBe('1 Elm St'); expect(ok.text).toBe(text); expect(ok.vault).toBeTruthy(); }
    const wrong = await openCopy('alex.you.json', text, 'phone passphrase');
    expect(wrong).toEqual({ error: expect.stringContaining('passphrase didn’t open alex.you.json') });
    expect(await openCopy('notes.txt', 'hello', '')).toEqual({ error: expect.stringContaining('doesn’t look like a You file') });
  });

  it('only pairs copies of the same You', () => {
    expect(pairProblem(you('a', ''), you('b', ''))).toMatch(/two different Yous/);
    expect(pairProblem(you('a', ''), you('a', ''))).toBeNull();
  });

  it('summarizes differences in plain words', () => {
    const a = you('a', '2026-11-01'), b = structuredClone(a);
    expect(pairSummary(a, b, 'the laptop copy', 'the phone copy')).toMatchObject({ same: true, text: 'These copies hold the same cards.' });
    addCard(a, { area: 'home', kind: 'Address', value: '1 Elm St', since: '2020' });
    addCard(b, { area: 'work', kind: 'Job', value: 'Baker', since: '2021' });
    addCard(b, { area: 'work', kind: 'Job', value: 'Cook', since: '2022' });
    expect(pairSummary(a, b, 'the laptop copy', 'the phone copy').text).toBe('1 card only in the laptop copy · 2 cards only in the phone copy · 0 cards changed in both');
  });

  it('gives "Keep both" two distinguishable names that say which is newer', () => {
    const older = you('a', '2026-11-01T09:00:00Z'), newer = you('a', '2026-11-03T09:00:00Z');
    expect(keepBothNames(older, newer)).toEqual(['alex-kim (older copy, saved 2026-11-01).you.json', 'alex-kim (newer copy, saved 2026-11-03).you.json']);
    const [x, y] = keepBothNames(older, structuredClone(older));
    expect(x).not.toBe(y);
    expect(keepBothNames(you('a', ''), you('a', ''))).toEqual(['alex-kim (copy 1).you.json', 'alex-kim (copy 2).you.json']);
  });
});
