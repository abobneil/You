// Small keyboard rules shared by several controls, kept free of the page so they can be tested.

/**
 * Where an arrow key (or Home/End) moves focus in a grid of `count` buttons laid out `cols` per row:
 * left/right by one, up/down by a row, never past either end. Null for any other key.
 */
export function gridStep(key: string, index: number, count: number, cols: number): number | null {
  const c = Math.max(1, cols);
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -c, ArrowDown: c, Home: -index, End: count - 1 - index };
  if (!(key in step) || count < 1) return null;
  return Math.min(count - 1, Math.max(0, index + step[key]));
}

/**
 * A Show/Hide passphrase button puts the caret back in the field only for a pointer click
 * (`detail` counts clicks; Enter or Space on the button gives 0). From the keyboard, focus stays on the
 * button, so pressing Space again hides it rather than typing a space into the passphrase.
 */
export const backToField = (e: Pick<MouseEvent, 'detail'>) => e.detail > 0;
