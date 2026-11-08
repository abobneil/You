// A1a/A1b: keyboard-only use. The rules are tested directly; the wiring that the browser walkthrough
// relied on is checked in the source so a later edit can't quietly drop it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backToField, gridStep } from './keyboard';

const src = (f: string) => readFileSync(f, 'utf8');

describe('month grid arrow keys', () => {
  // 13 buttons (12 months + "No month"), 4 per row.
  it('moves by one left and right, and by a row up and down', () => {
    expect(gridStep('ArrowRight', 0, 13, 4)).toBe(1);
    expect(gridStep('ArrowLeft', 5, 13, 4)).toBe(4);
    expect(gridStep('ArrowDown', 1, 13, 4)).toBe(5);
    expect(gridStep('ArrowUp', 9, 13, 4)).toBe(5);
  });
  it('stops at either end instead of wrapping or leaving the grid', () => {
    expect(gridStep('ArrowLeft', 0, 13, 4)).toBe(0);
    expect(gridStep('ArrowUp', 2, 13, 4)).toBe(0);
    expect(gridStep('ArrowDown', 11, 13, 4)).toBe(12);
    expect(gridStep('ArrowRight', 12, 13, 4)).toBe(12);
  });
  it('Home and End go to the first and last button', () => {
    expect(gridStep('Home', 7, 13, 4)).toBe(0);
    expect(gridStep('End', 3, 13, 4)).toBe(12);
  });
  it('leaves other keys (Tab, Enter, letters) alone', () => {
    for (const k of ['Tab', 'Enter', ' ', 'a']) expect(gridStep(k, 3, 13, 4)).toBeNull();
  });
  it('copes with a single column', () => expect(gridStep('ArrowDown', 0, 13, 0)).toBe(1));
});

describe('Show/Hide passphrase', () => {
  it('returns to the field only after a pointer click, never after Enter or Space', () => {
    expect(backToField({ detail: 1 })).toBe(true);
    expect(backToField({ detail: 0 })).toBe(false);
  });
  it('both peek buttons use that rule', () => {
    expect(src('src/ui/gate.ts')).toMatch(/if \(backToField\(e\)\) pass\.focus\(\)/);
    expect(src('src/ui/passField.ts')).toMatch(/if \(backToField\(e\)\) input\.focus\(\)/);
  });
});

describe('focus is never left on something hidden or invisible', () => {
  it('Escape in the month grid puts focus back on the Month button', () => {
    expect(src('src/ui/dateInput.ts')).toMatch(/if \(inGrid\) open\.parentElement\?\.querySelector<HTMLElement>\('\.mbtn'\)\?\.focus\(\)/);
  });
  it('the landing Continue button shows when Tab reaches it before a name is typed', () => {
    expect(src('src/styles/app.css')).toMatch(/\.enter:focus-visible \{ opacity: 1; transform: none; \}/);
  });
  it('moving between home, an area and Your life places focus on the new view', () => {
    expect(src('src/ui/router.ts')).toMatch(/route\(\);\s*placeFocus\(/);
  });
  it('Your life keeps the focused control across its redraws', () => {
    expect(src('src/ui/life.ts')).toMatch(/findByKey\(root, had\)/);
  });
  it('a kind error focuses a kind button (with a ring), not the ringless group', () => {
    expect(src('src/ui/composer.ts')).toContain(`sheetBody.querySelector<HTMLElement>('.kinds button:not([hidden])')?.focus()`);
  });
  it('focus is scrolled clear of the bottom hint and toast, including after a sheet closes', () => {
    const n = src('src/ui/nudge.ts');
    expect(n).toMatch(/addEventListener\('focusin', \(\) => requestAnimationFrame\(keepFocusClear\)\)/);
    expect(n).toMatch(/addEventListener\('popstate', \(\) => requestAnimationFrame\(keepFocusClear\)\)/);
  });
});
