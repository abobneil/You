// Remembers "which control was this" across redraws, so focus can land on the same control
// after the sheet or a list is drawn again (the old element is gone; an equivalent one is there).

export interface FocusKey { tag: string; id?: string; data?: string }

/** data-* attributes that change while the control stays the same one. */
const VOLATILE = new Set(['value', 'err']);

interface ElementLike {
  tagName: string;
  id: string;
  dataset?: Record<string, string | undefined>;
  parentElement: (ElementLike & { closest?(sel: string): ElementLike | null }) | null;
}

/** A description of `el` that an equivalent element in a redraw will share, or null if there is none. */
export function keyOf(el: ElementLike): FocusKey | null {
  const tag = el.tagName;
  if (el.id) return { tag, id: el.id };
  const parts = Object.entries(el.dataset ?? {})
    .filter(([k, v]) => !VOLATILE.has(k) && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  if (!parts.length) return null;
  // Date fields repeat the same data-d="y" etc., so say which date the part belongs to.
  const group = el.parentElement?.closest?.('[data-date]');
  if (group?.dataset?.date) parts.push(`@date=${group.dataset.date}`);
  return { tag, data: parts.join('&') };
}

export const sameKey = (a: FocusKey | null, b: FocusKey | null) =>
  !!a && !!b && a.tag === b.tag && (a.id ? a.id === b.id : !b.id && a.data === b.data);

/** The element under `root` that matches `key`, if any. */
export function findByKey(root: ParentNode, key: FocusKey): HTMLElement | null {
  if (key.id) {
    const el = document.getElementById(key.id);
    return el && (root === document || (root as Node).contains(el)) ? el : null;
  }
  for (const el of root.querySelectorAll<HTMLElement>(key.tag)) if (sameKey(keyOf(el), key)) return el;
  return null;
}

/** True if focus can usefully go there (not hidden, not disabled). */
export const canFocus = (el: HTMLElement) =>
  el.isConnected && !el.closest('[hidden]') && !(el as HTMLButtonElement).disabled;
