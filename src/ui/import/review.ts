// All imports are reviewed before changing the record.
import { applyProposals, findMatch, fieldChanges, matchKey, planFor } from '../../core/import/match';
import type { ImportResult } from '../../core/import/types';
import { profile, save } from '../../state';
import { esc } from '../dom';
import { closeSheet, openSheet, sheetTop } from '../sheet';

export function openReview(source: string, result: ImportResult, onDone?: (area: string) => void) {
  const states = result.rows.map(row => ({ row, choice: row.choice, on: row.on !== false, matchId: '' }));
  type State = typeof states[number];
  const proposals = (s: State) => s.row.build(s.choice).map(p => ({ ...p, matchId: s.matchId || undefined }));
  const category = (s: State) => {
    const plans = proposals(s).map(p => planFor(profile, p));
    return plans.includes('new') ? 'New' : plans.some(p => p !== 'have') ? 'Updates' : 'Already there';
  };
  states.forEach(s => { if (category(s) === 'Already there') s.on = false; });
  function rowHtml(s: State, i: number) {
    const ps = proposals(s);
    const changes = ps.flatMap(p => {
      const m = findMatch(profile, p);
      return m ? [...(p.sync && m.imports?.[p.sync.source]?.fields.$value === m.value && m.value !== p.value ? [['Title', p.value]] : []), ...fieldChanges(m, p)].map(([k, v]) => `<p class="rv-sub">${esc(k)}: ${esc(k === 'Title' ? m.value : m.fields?.[k] || 'Empty')} → ${esc(v || 'Empty')}</p>`) : [];
    }).join('');
    const possible = ps.filter(p => !findMatch(profile, p)).flatMap(p => profile.cards.filter(c => c.area === p.area && matchKey(c) === matchKey(p)));
    return `<li class="rv-row${s.on ? ' on' : ''}"><button type="button" class="rv-check" data-act="toggle" data-i="${i}" role="checkbox" aria-checked="${s.on}" aria-label="Include ${esc(s.row.label)}"></button><div class="rv-main"><div class="rv-label">${esc(s.row.label)}</div><p class="rv-sub">${esc(s.row.sub || s.row.group)}</p>${changes}
      ${s.row.options?.map(o => `<button type="button" data-act="pick" data-i="${i}" data-choice="${esc(o.id)}" aria-pressed="${o.id === s.choice}">${esc(o.label)}</button>`).join('') || ''}
      ${possible.map(c => `<p class="hint">Possibly the same as ${esc(c.value)}</p><button type="button" data-act="match" data-i="${i}" data-id="${esc(c.id)}">Same</button><span class="hint">Keep separate (default)</span>`).join('')}
      ${s.matchId ? `<button type="button" data-act="match" data-i="${i}">Keep separate</button>` : ''}</div></li>`;
  }
  function render() {
    const selected = states.filter(s => s.on).flatMap(proposals);
    // Simulate application so duplicate entries within the selection do not inflate the total.

    const count = selected.length;
    openSheet(`${sheetTop(`Import · ${esc(source)}`)}<h3 class="sh-title">Review your import</h3><p class="hint">Source: ${esc(source)}. Dates keep the precision supplied in the export.</p>
      <div class="rv-tools"><button class="link-btn" type="button" data-act="all">Select all</button><button class="link-btn" type="button" data-act="none">Select none</button></div>
      <div class="rv">${['New', 'Updates', 'Already there'].map(g => `<details ${g === 'Already there' ? '' : 'open'}><summary>${g} (${states.filter(s => category(s) === g).length})</summary><ul>${states.map((s, i) => category(s) === g ? rowHtml(s, i) : '').join('')}</ul></details>`).join('')}</div>
      <details><summary>Skipped and source notes (${result.notes?.length || 0})</summary>${result.notes?.map(n => `<p class="hint">${esc(n)}</p>`).join('') || '<p class="hint">No omissions reported.</p>'}</details>
      <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="add" ${count ? '' : 'disabled'}>Apply to ${count} cards</button></div>`, {
      toggle: b => { states[+b.dataset.i!].on = !states[+b.dataset.i!].on; render(); },
      pick: b => { states[+b.dataset.i!].choice = b.dataset.choice; render(); },
      match: b => { states[+b.dataset.i!].matchId = b.dataset.id || ''; render(); },
      all: () => { states.forEach(s => s.on = true); render(); },
      none: () => { states.forEach(s => s.on = false); render(); },
      add: () => {
        const ps = states.filter(s => s.on).flatMap(proposals);
        const c = applyProposals(profile, ps, source); save();
        openSheet(`${sheetTop(`Import · ${esc(source)}`)}<h3 class="sh-title">Done</h3><p class="hint" data-announce>Added ${c.added}, filled ${c.filled}, updated ${c.updated}, already kept ${ps.length - c.added - c.filled - c.updated} cards.</p><button class="btn primary" type="button" data-act="ok">Done</button>`, { ok: () => { closeSheet(); if (ps[0]) onDone?.(ps[0].area); } });
      },
    });
  }
  render();
}
