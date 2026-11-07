// Sub-types with icons, like a phone's Cell / Home / Work.
import type { KindInfo, Tag } from '../core/areas';
import { esc } from './dom';

export const tagIcon = (t: Tag) =>
  `<svg class="tag-ic" viewBox="0 0 24 24" role="img" aria-label="${esc(t.label)}"><title>${esc(t.label)}</title>${t.icon}</svg>`;

/** A "Type" row of buttons. Clicks use data-act="tag" with data-tag="<id>". */
export function tagRowHtml(kind: KindInfo, current: string | undefined): string {
  if (!kind.tags?.length) return '';
  return `<div class="fx"><span class="lab">Type</span><div class="tags">${kind.tags.map(t =>
    `<button type="button" data-act="tag" data-tag="${esc(t.id)}" class="${t.id === current ? 'on' : ''}" aria-pressed="${t.id === current}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg>${esc(t.label)}</button>`).join('')}</div></div>`;
}
