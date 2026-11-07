// "Review what to add": every import ends here. Each row can be unticked; contacts can be filed as
// a different kind of person, or marked "This is me". Nothing is added until "Add" is pressed.
import { applyProposals, planFor, type Plan } from '../../core/import/match';
import type { ImportResult, ImportRow, Proposal } from '../../core/import/types';
import { profile, save } from '../../state';
import { esc } from '../dom';
import { closeSheet, openSheet, sheetTop } from '../sheet';

interface State { row: ImportRow; on: boolean; choice?: string }

const BADGE: Record<Plan, string> = { new: 'New', fill: 'Adds details', update: 'Refreshes details', have: 'Already there' };

function rowPlan(proposals: Proposal[]): Plan {
  const plans = proposals.map(p => planFor(profile, p));
  return plans.includes('new') ? 'new' : plans.includes('update') ? 'update' : plans.includes('fill') ? 'fill' : 'have';
}

/**
 * Shows the rows for review. `source` is stored on every card ("Imported from LinkedIn").
 * `onDone` gets the area the person will most want to see next.
 */
export function openReview(source: string, result: ImportResult, onDone?: (area: string) => void) {
  const states: State[] = result.rows.map(row => {
    const s: State = { row, on: true, choice: row.choice };
    s.on = row.on !== false && rowPlan(row.build(s.choice)) !== 'have';
    return s;
  });
  render();

  function render() {
    const groups = [...new Set(states.map(s => s.row.group))];
    const chosen = states.filter(s => s.on);
    const count = chosen.reduce((n, s) => n + s.row.build(s.choice).filter(p => planFor(profile, p) !== 'have').length, 0);
    openSheet(`${sheetTop(`Import · ${esc(source)}`)}
      <h3 class="sh-title">${states.length ? 'Review your import' : 'Nothing to add'}</h3>
      ${(result.notes ?? []).map(n => `<p class="hint">${esc(n)}</p>`).join('')}
      ${states.length ? `<div class="rv-tools"><span class="hint">${chosen.length} of ${states.length} selected</span><span class="spacer"></span>
        <button class="link-btn" type="button" data-act="all">Select all</button><button class="link-btn" type="button" data-act="none">Select none</button></div>` : ''}
      <div class="rv">${groups.map(g => `<h5>${esc(g)}</h5><ul>${states.map((s, i) => s.row.group !== g ? '' : rowHtml(s, i)).join('')}</ul>`).join('')}</div>
      <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button>
        ${states.length ? `<button class="btn primary" type="button" data-act="add" ${count ? '' : 'disabled'}>${count ? `Apply to ${count} card${count === 1 ? '' : 's'}` : 'Nothing new'}</button>` : ''}</div>`,
    {
      toggle: b => { const s = states[+b.dataset.i!]; s.on = !s.on; render(); },
      pick: b => { const s = states[+b.dataset.i!]; s.choice = b.dataset.choice; s.on = true; render(); },
      all: () => { states.forEach(s => { s.on = true; }); render(); },
      none: () => { states.forEach(s => { s.on = false; }); render(); },
      add: () => {
        const proposals = states.filter(s => s.on).flatMap(s => s.row.build(s.choice));
        const { added, filled, updated } = applyProposals(profile, proposals, source);
        save();
        done(added, filled, updated, proposals[0]?.area);
      },
    });
  }

  function rowHtml(s: State, i: number) {
    const plan = rowPlan(s.row.build(s.choice));
    return `<li class="rv-row${s.on ? ' on' : ''}">
      <button type="button" class="rv-check" data-act="toggle" data-i="${i}" role="checkbox" aria-checked="${s.on}" aria-label="Include ${esc(s.row.label)}"></button>
      <div class="rv-main">
        <div class="rv-label"><span>${esc(s.row.label)}</span><span class="rv-badge ${plan}">${BADGE[plan]}</span></div>
        ${s.row.sub ? `<div class="rv-sub">${esc(s.row.sub)}</div>` : ''}
        ${s.row.options ? `<div class="rv-opts">${s.row.options.map(o =>
          `<button type="button" data-act="pick" data-i="${i}" data-choice="${esc(o.id)}" class="${o.id === s.choice ? 'on' : ''}">${esc(o.label)}</button>`).join('')}</div>` : ''}
      </div>
    </li>`;
  }

  function done(added: number, filled: number, updated: number, area?: string) {
    openSheet(`${sheetTop(`Import · ${esc(source)}`)}
      <h3 class="sh-title">Done</h3>
      <p class="hint">${added ? `Added ${added} card${added === 1 ? '' : 's'}.` : 'No new cards.'}${filled ? ` Filled in details on ${filled}.` : ''}${updated ? ` Refreshed details on ${updated}.` : ''}
        ${added ? `New cards note they came from ${esc(source)}.` : ''}</p>
      <div class="btns"><button class="btn primary" type="button" data-act="ok">${area ? 'Show me' : 'Done'}</button></div>`,
    { ok: () => { closeSheet(); if (area) onDone?.(area); } });
  }
}
