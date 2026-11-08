// Measures the color tokens in app.css against WCAG 2.2 AA in both themes, so a "quieter" tweak
// can't silently make hints unreadable or control outlines invisible.
import { describe, expect, it } from 'vitest';

// Read the stylesheet from disk (Vitest blanks imported CSS). Node's fs is loaded by name so the
// browser tsconfig doesn't need Node's types.
const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as { readFileSync(p: URL, enc: 'utf8'): string };
const css = fs.readFileSync(new URL('./app.css', import.meta.url), 'utf8');

/** Custom properties declared in rules whose selector is exactly `selector`, in source order. */
function tokens(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const esc = selector.replace(/[[\]"().:]/g, m => '\\' + m);
  for (const m of css.matchAll(new RegExp(`(?:^|[\\s}])${esc}\\s*\\{([^}]*)\\}`, 'g')))
    for (const d of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim();
  return out;
}

const light = tokens(':root');
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };
const systemDark = { ...light, ...tokens(':root:not([data-theme="light"])') };

const resolve = (t: Record<string, string>, v: string): string => {
  const m = /^var\((--[\w-]+)\)$/.exec(v.trim());
  return m ? resolve(t, t[m[1]]) : v.trim();
};

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function luminance(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map(x => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(full.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [what, foreground token, background token, minimum]
const CHECKS: [string, string, string, number][] = [
  ['body text on page', '--ink', '--bg', 4.5],
  ['body text on card', '--ink', '--card', 4.5],
  ['quiet hint text on page', '--soft', '--bg', 4.5],
  ['quiet hint text on card', '--soft', '--card', 4.5],
  ['coral text on page', '--accent-ink', '--bg', 4.5],
  ['coral text on card', '--accent-ink', '--card', 4.5],
  ['button text on coral', '--on-accent', '--accent', 4.5],
  ['selected chip text (page color on ink)', '--bg', '--ink', 4.5],
  ['avatar letter on quiet fill', '--bg', '--soft', 4.5],
  ['control outline vs page', '--edge', '--bg', 3],
  ['control outline vs card', '--edge', '--card', 3],
  ['focus ring vs page', '--focus', '--bg', 3],
  ['focus ring vs card', '--focus', '--card', 3],
];

describe.each([['light', light], ['dark', dark]] as const)('%s theme', (_name, t) => {
  it.each(CHECKS)('%s', (_what, fg, bg, min) => {
    const ratio = contrast(resolve(t, t[fg]), resolve(t, t[bg]));
    expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
  });
});

it('system dark mode uses the same colors as the dark override', () => {
  for (const k of ['--bg', '--ink', '--soft', '--line', '--edge', '--accent-ink', '--card'])
    expect(systemDark[k], k).toBe(dark[k]);
});

it('keeps coral #FF5A36 as the accent fill in both themes', () => {
  expect(light['--accent'].toUpperCase()).toBe('#FF5A36');
  expect(dark['--accent'].toUpperCase()).toBe('#FF5A36');
});

it('has no text color that fades essential text with opacity below 1 on tiles, rows or review items', () => {
  expect(css).not.toMatch(/\.tile\.past\s*\{\s*opacity:\s*\.\d/);
  expect(css).not.toMatch(/\.rv-row\s*\{[^}]*opacity:\s*\.\d/);
});

it('turns off keyframe animations, not only transitions, for reduced motion', () => {
  const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
  expect(block).toMatch(/animation:\s*none\s*!important/);
  expect(block).toMatch(/transition:\s*none\s*!important/);
});
