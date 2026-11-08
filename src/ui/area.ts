// One area of life, built to stay manageable when it holds hundreds of cards.
//
//   #interests                 the area: a search box and Add that stay at the top while you scroll,
//                              each kind folded to one row (small kinds show their cards right there),
//                              then "Over time" folded by year, with imported history summed up.
//   #interests/Movie%20or%20show  one kind: filter, sort, your own cards first, imported history
//                              after it, folded by year, drawn a page at a time.
//
// Typing in the search box searches the area (or the kind you're in) instead.
import { kindLabel, kindOf, tagOf, type Area } from '../core/areas';
import { noteSearchText, countText, groupByKind, groupByOrigin, groupByYear, originOf, playsOf, previewOf, sortCards, yearOf, type Sort } from '../core/browse';
import { byId, linksOf, rangeText } from '../core/cards';
import { fmtDate, fmtISO } from '../core/dates';
import type { Card } from '../core/types';
import { profile } from '../state';
import { openCard } from './cardView';
import { openComposer } from './composer';
import { $, esc, linkText } from './dom';
import { searchableDetails, summaryText } from './details';
import { openImport, SOURCES_FOR_AREA } from './import/sources';
import { shownValue, valueHtml } from './sensitive';
import { tagIcon } from './tags';

/** Kinds with this many cards or fewer show them right in the area; bigger kinds fold to a row. */
const SMALL = 6;
/** Past this many, a one-line-per-card list reads better than cards. */
const TILE_LIMIT = 12;
/** Long lists draw this many rows at a time, more as you scroll. */
const PAGE = 100;
/** "Over time" shows this many of your own entries per year before "show more". */
const TL_PAGE = 40;

const detail = $('#detail');
const body = $('#a-body');
const timelineWrap = $('#a-history');
const search = $<HTMLInputElement>('#a-search');
const importBtn = $<HTMLButtonElement>('#a-import');
const backLink = $<HTMLAnchorElement>('#detail .back');

type Filters = { type?: string; origin?: string; year?: string; sort: Sort };
let view: { area: Area; kind?: string } | undefined;
let query = '';
let filters: Filters = { sort: 'recent' };
/** Filters to apply when the next kind page opens (from an "Over time" summary line). */
let pending: Partial<Filters> | undefined;
/** Year folds the person opened or closed, and how far each long list has been drawn. */
const folds = new Map<string, boolean>();
const drawn = new Map<string, number>();

const kindHref = (area: string, kind: string) => `#${area}/${encodeURIComponent(kind)}`;
const n = (x: number) => x.toLocaleString('en-US');

export function renderArea(a: Area, kind?: string) {
  const moved = view?.area.id !== a.id || view?.kind !== kind;
  if (view?.area.id !== a.id) { query = ''; search.value = ''; }
  if (moved) {
    // Kinds that count plays (music, podcasts) open on what you played most.
    const played = !!kind && profile.cards.some(c => c.area === a.id && c.kind === kind && playsOf(c) > 0);
    filters = { sort: played && !pending?.year ? 'plays' : 'recent', ...pending };
    pending = undefined;
    folds.clear();
    drawn.clear();
  }
  view = { area: a, kind };

  $('#d-icon').innerHTML = a.icon;
  $('#d-title').textContent = kind ?? a.title;
  backLink.href = kind ? `#${a.id}` : '#';
  $('#back-name').textContent = kind ? a.title : profile.name || 'Back';
  search.placeholder = kind ? `Search ${kind}` : `Search ${a.title}`;
  importBtn.hidden = !SOURCES_FOR_AREA[a.id]?.length;
  draw();
}

/** Redraws the body only, so the search box keeps its focus and caret. */
function draw() {
  if (!view) return;
  const { area, kind } = view;
  const cards = profile.cards.filter(c => c.area === area.id);
  body.innerHTML = query.trim() ? searchHtml(kind ? cards.filter(c => c.kind === kind) : cards, !kind)
    : kind ? kindHtml(cards.filter(c => c.kind === kind))
    : indexHtml(area, cards);
  timelineWrap.hidden = !!kind || !!query.trim();
  if (!timelineWrap.hidden) $('#timeline').innerHTML = timelineHtml(cards);
  watchMore();
}

// ---------- pieces ----------

/**
 * A real button covering the whole tile or row (CSS stretches it), so the card opens by click, tap,
 * Enter or Space, while the eye on a sensitive value stays its own button above it.
 */
const openButton = (c: Card) =>
  `<button type="button" class="open-card" data-act="card" data-id="${esc(c.id)}"
    aria-label="${esc([`${kindLabel(c)}: ${shownValue(c)}`, rangeText(c), c.status === 'active' ? '' : 'history'].filter(Boolean).join(', '))}"></button>`;

function tileHtml(c: Card) {
  const chips = linksOf(profile, c.id).slice(0, 3)
    .map(x => `<span class="chip">${linkText(x.label, kindLabel(x.other), shownValue(x.other))}</span>`).join('');
  const sum = summaryText(c, kindOf(c.area, c.kind));
  const t = tagOf(c);
  return `<div class="tile${c.status === 'active' ? '' : ' past'}">${openButton(c)}
    <span class="k"><i></i>${esc(kindLabel(c))}</span>
    <span class="v">${t ? tagIcon(t) : ''}${valueHtml(c)}</span>
    ${sum ? `<span class="sum">${esc(sum)}</span>` : ''}
    <span class="d">${esc(rangeText(c))}</span>
    ${chips ? `<span class="chips">${chips}</span>` : ''}
  </div>`;
}

/** One line per card: name, details, dates. Used once a list gets long. */
function rowHtml(c: Card, showKind: boolean) {
  const sum = summaryText(c, kindOf(c.area, c.kind));
  const t = tagOf(c);
  return `<li class="crow${c.status === 'active' ? '' : ' past'}">${openButton(c)}
    <span class="cv">${t ? tagIcon(t) : ''}${valueHtml(c)}</span>
    <span class="cs">${esc([showKind ? kindLabel(c) : '', sum].filter(Boolean).join(' · '))}</span>
    <span class="cd">${esc(rangeText(c))}</span>
  </li>`;
}

/** A list drawn a page at a time; the rest arrives as you scroll to the end of it. */
function listHtml(key: string, cards: Card[], showKind: boolean, page = PAGE) {
  const shown = drawn.get(key) ?? page;
  const left = cards.length - shown;
  return `<ul class="clist">${cards.slice(0, shown).map(c => rowHtml(c, showKind)).join('')}</ul>`
    + (left > 0 ? `<button class="more" type="button" data-act="more" data-key="${esc(key)}" data-page="${page}">Show ${n(Math.min(page, left))} more of ${n(left)}</button>` : '');
}

const cardsHtml = (key: string, cards: Card[], showKind = false) =>
  cards.length <= TILE_LIMIT ? `<div class="tiles">${cards.map(tileHtml).join('')}</div>` : listHtml(key, cards, showKind);

/** Folded by year, newest open. Short lists aren't worth folding. */
function yearsHtml(key: string, cards: Card[]) {
  const years = groupByYear(cards);
  if (years.length < 2 || cards.length <= TILE_LIMIT) return cardsHtml(key, cards);
  return years.map((g, i) => {
    const k = `${key}|${g.year}`;
    const open = folds.get(k) ?? i === 0;
    // A closed year draws nothing until it's opened.
    return `<details class="yfold" data-key="${esc(k)}"${open ? ' open' : ''}>
      <summary><span>${esc(g.year)}</span><small>${n(g.cards.length)}</small></summary>${open ? cardsHtml(k, g.cards) : ''}</details>`;
  }).join('');
}

// ---------- the area ----------

function indexHtml(area: Area, cards: Card[]) {
  const active = cards.filter(c => c.status === 'active');
  const groups = groupByKind(area, active);
  const kinds = groups.map(g => {
    const href = kindHref(area.id, g.kind);
    if (g.cards.length > SMALL) {
      const p = previewOf(g.cards);
      return `<a class="krow" href="${href}">
        <span class="kname">${esc(g.kind)}</span><span class="kcount">${esc(countText(g.cards))}</span>
        <span class="kprev"><em>${esc(p.label)}:</em> ${esc(p.cards.map(shownValue).join(', '))}</span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a>`;
    }
    return `<section class="kgroup">
      <div class="khead"><a href="${href}">${esc(g.kind)}</a><span>${esc(countText(g.cards))}</span>
        <button class="kadd" type="button" data-act="new" data-kind="${esc(g.kind)}" aria-label="Add ${esc(g.kind)}" title="Add ${esc(g.kind)}">+</button></div>
      <div class="tiles">${previewOf(g.cards, SMALL).cards.map(tileHtml).join('')}</div>
    </section>`;
  }).join('');
  const empty = area.kinds.filter(k => !active.some(c => c.kind === k.name));
  return `<div class="sec"><h4>Now</h4><span>${active.length ? `${n(active.length)} active` : ''}</span></div>
    ${kinds || '<p class="empty">Nothing here yet. Add a card, or start with one of these.</p>'}
    ${empty.length ? `<div class="ghosts">${empty.map(k => `<button class="ghost" type="button" data-act="new" data-kind="${esc(k.name)}">+ ${esc(k.name)}</button>`).join('')}</div>` : ''}`;
}

// ---------- one kind ----------

function chipRow(label: string, f: keyof Filters, options: [string | undefined, string][]) {
  return `<div class="frow"><span class="flabel">${esc(label)}</span><div class="fchips">${options.map(([v, text]) =>
    `<button type="button" class="fchip${filters[f] === v ? ' on' : ''}" data-act="filter" data-f="${f}" data-v="${esc(v ?? '')}" data-unset="${v === undefined}">${esc(text)}</button>`).join('')}</div></div>`;
}

function kindHtml(all: Card[]) {
  const types = [...new Set(all.map(c => c.fields?.type).filter((t): t is string => !!t))].sort();
  const origins = groupByOrigin(all).map(g => g.origin);
  const years = [...new Set(all.map(yearOf))].sort().reverse();
  const shown = sortCards(all.filter(c => (!filters.type || c.fields?.type === filters.type)
    && (filters.origin === undefined || originOf(c) === filters.origin)
    && (!filters.year || yearOf(c) === filters.year)), filters.sort);
  const ended = all.filter(c => c.status !== 'active').length;

  const rows = [
    types.length > 1 ? chipRow('Type', 'type', [[undefined, 'All'], ...types.map(t => [t, t] as [string, string])]) : '',
    origins.length > 1 ? chipRow('From', 'origin', [[undefined, 'Anywhere'], ...origins.map(o => [o, o || 'Added by you'] as [string, string])]) : '',
    years.length > 1 ? chipRow('Year', 'year', [[undefined, 'Any'], ...years.map(y => [y, y] as [string, string])]) : '',
    chipRow('Sort', 'sort', [['recent', 'Newest'], ['oldest', 'Oldest'], ['az', 'A–Z'], ...(all.some(c => playsOf(c) > 0) ? [['plays', 'Most played'] as [string, string]] : [])]),
  ].join('');

  const fold = (filters.sort === 'recent' || filters.sort === 'oldest') && !filters.year;
  const sections = groupByOrigin(shown).map(g => `
    <div class="sec"><h4>${g.origin ? `From ${esc(g.origin)}` : 'Added by you'}</h4><span>${n(g.cards.length)}</span></div>
    ${fold ? yearsHtml(`o:${g.origin}`, g.cards) : cardsHtml(`o:${g.origin}`, g.cards)}`).join('');

  return `<div class="filters">${rows}</div>
    <p class="kstat">${n(shown.length)} of ${n(all.length)}${ended ? ` · ${n(ended)} in history` : ''}</p>
    ${sections || '<p class="empty">Nothing matches. Try another filter.</p>'}`;
}

// ---------- search ----------

function searchHtml(pool: Card[], showKind: boolean) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = sortCards(pool.filter(c => {
    const text = `${shownValue(c)} ${kindLabel(c)} ${searchableDetails(c, kindOf(c.area, c.kind))} ${originOf(c)} ${yearOf(c)} ${noteSearchText(c)}`.toLowerCase();
    return words.every(w => text.includes(w));
  }), 'recent');
  return `<div class="sec"><h4>${hits.length ? `${n(hits.length)} found` : 'Nothing found'}</h4><span>for “${esc(query.trim())}”</span></div>
    ${hits.length ? listHtml('search', hits, showKind) : '<p class="empty">Try fewer or different words.</p>'}`;
}

// ---------- over time ----------

function eventHtml(c: Card) {
  const prev = byId(profile, c.replaces);
  const next = byId(profile, c.replacedBy);
  const note = c.status === 'active'
    ? (prev ? `replaced ${esc(shownValue(prev))}` : 'added')
    : (next ? `replaced by ${esc(shownValue(next))}` : 'ended');
  const when = c.status === 'active' ? (fmtDate(c.since) || `Added ${fmtISO(c.recordedAt)}`) : rangeText(c);
  return `<li class="ev ${c.status === 'active' ? 'on' : 'past'}"><button type="button" data-act="card" data-id="${esc(c.id)}">
    <div class="when">${esc(when)}</div>
    <div class="what">${esc(kindLabel(c))}: ${esc(shownValue(c))} <span class="note">· ${note}</span></div>
  </button></li>`;
}

/**
 * Year by year, newest open. Your own entries are listed; imported history is one line per
 * source and kind ("214 Movie or show from Netflix") that opens the kind filtered to that year.
 */
function timelineHtml(cards: Card[]) {
  if (!cards.length) return `<li class="ev"><p class="empty">Your cards will show up here, in order, as you add them.</p></li>`;
  return groupByYear(sortCards(cards, 'recent')).map((g, i) => {
    const k = `tl|${g.year}`;
    const open = folds.get(k) ?? i === 0;
    const own = g.cards.filter(c => !originOf(c));
    const shown = drawn.get(k) ?? TL_PAGE;
    const imported = new Map<string, { kind: string; origin: string; count: number }>();
    for (const c of g.cards) {
      const o = originOf(c);
      if (!o) continue;
      const key = `${o}|${c.kind}`;
      imported.set(key, { kind: c.kind, origin: o, count: (imported.get(key)?.count ?? 0) + 1 });
    }
    const sums = [...imported.values()].sort((a, b) => b.count - a.count).map(s =>
      `<li class="ev on sum"><button type="button" data-act="goto" data-kind="${esc(s.kind)}" data-origin="${esc(s.origin)}" data-year="${esc(g.year)}">
        <div class="what">${esc(s.origin)}: ${n(s.count)} ${esc(s.kind)} card${s.count === 1 ? '' : 's'} <span class="note">· see them</span></div></button></li>`).join('');
    const left = own.length - shown;
    return `<li class="tl-year"><details class="yfold" data-key="${esc(k)}"${open ? ' open' : ''}>
      <summary><span>${esc(g.year)}</span><small>${n(g.cards.length)}</small></summary>
      ${open ? `<ol class="tl">${own.slice(0, shown).map(eventHtml).join('')}${sums}</ol>` : ''}
      ${open && left > 0 ? `<button class="more" type="button" data-act="more" data-key="${esc(k)}" data-page="${TL_PAGE}">Show ${n(Math.min(TL_PAGE, left))} more of ${n(left)}</button>` : ''}
    </details></li>`;
  }).join('');
}

// ---------- drawing more as you scroll ----------

let watcher: IntersectionObserver | undefined;
function watchMore() {
  watcher?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  watcher = new IntersectionObserver(entries => {
    const hit = entries.find(e => e.isIntersecting)?.target as HTMLElement | undefined;
    if (hit) more(hit);
  }, { rootMargin: '400px' });
  detail.querySelectorAll('.more').forEach(b => watcher!.observe(b));
}

function more(b: HTMLElement) {
  const key = b.dataset.key!, page = +b.dataset.page! || PAGE;
  drawn.set(key, (drawn.get(key) ?? page) + page);
  draw();
}

// ---------- events ----------

search.addEventListener('input', () => { query = search.value; drawn.delete('search'); draw(); });
search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; query = ''; draw(); } });
$('#a-add').addEventListener('click', () => view && openComposer(view.area.id, { kind: view.kind }));
importBtn.addEventListener('click', () => view && openImport(SOURCES_FOR_AREA[view.area.id]));

// "/" jumps to search from anywhere in an area, unless you're typing somewhere.
document.addEventListener('keydown', e => {
  if (e.key !== '/' || detail.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, [contenteditable], dialog[open]') || (document.getElementById('sheet') as HTMLDialogElement).open) return;
  e.preventDefault();
  search.focus();
});

// Remember which years are open, so redrawing after a save keeps your place. ("toggle" doesn't bubble.)
detail.addEventListener('toggle', e => {
  const d = e.target as HTMLDetailsElement;
  if (!d.classList?.contains('yfold') || !d.dataset.key) return;
  folds.set(d.dataset.key, d.open);
  if (d.open && d.children.length < 2) draw();
}, true);

detail.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b || !view) return;
  const { act } = b.dataset;
  if (act === 'card') openCard(b.dataset.id!);
  if (act === 'new') openComposer(view.area.id, { kind: b.dataset.kind });
  if (act === 'more') more(b);
  if (act === 'filter') {
    const f = b.dataset.f as keyof Filters;
    const v = b.dataset.unset === 'true' ? undefined : b.dataset.v;
    if (f === 'sort') filters.sort = v as Sort;
    else (filters as Record<string, string | undefined>)[f] = filters[f] === v ? undefined : v;
    drawn.clear();
    draw();
  }
  if (act === 'goto') {
    pending = { origin: b.dataset.origin, year: b.dataset.year };
    location.hash = kindHref(view.area.id, b.dataset.kind!);
  }
});
