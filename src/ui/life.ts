import { openReadableCopy } from './readableCopy';
import { AREAS } from '../core/areas';
import { rangeText } from '../core/cards';
import { foldCards, lifeIn, yearIndex, type LifeCard } from '../core/life';
import { isValidDate, startKey, endKey } from '../core/dates';
import { profile } from '../state';
import { $, esc } from './dom';
import { dateInputs, readDate } from './dateInput';
import { openCard } from './cardView';
import { openComposer } from './composer';
import { shownValue } from './sensitive';
const root = $('#life');
let selected = new Set<string>();
let source = '';
let decade = '';
let reading = false;
const chip = (label: string, attr: string, on: boolean) => `<button type="button" class="fchip ${on ? 'on' : ''}" aria-pressed="${on}" ${attr}>${esc(label)}</button>`;
function cardHtml({ card: c, overlap }: LifeCard): string {
  const dates = c.since ? rangeText(c) : `Date unknown${c.until ? ' · Until ' + c.until : ''}`;
  return `<li><button type="button" class="life-card" data-card="${esc(c.id)}"><b>${esc(shownValue(c))}</b><span>${esc(c.kind)} · ${esc(dates)} · ${c.status === 'active' ? 'Current' : 'History'}${overlap === 'possible' ? ' · possibly' : ''}${c.source ? ' · ' + esc(c.source.from) : ''}</span>${(c as typeof c & { note?: string }).note ? `<span>${esc((c as typeof c & { note?: string }).note!)}</span>` : ''}${reading && c.keepsakes?.length ? `<span>${c.keepsakes.map(k => esc(k.name)).join(' · ')}</span>` : ''}</button></li>`;
}
let lastRoute = '';
export function renderLife() {
  const sameRoute = lastRoute === location.hash;
  const openGroups = sameRoute ? [...root.querySelectorAll('details')].map((d, i) => d.open ? i : -1) : [];
  const scroll = window.scrollY;
  lastRoute = location.hash;
  const parts = location.hash.replace(/^#\/?life\/?/, '').split('/');
  const from = parts[0] || '', to = parts[1] || from;
  const period = !!from, unknown = from === 'unknown';
  const label = unknown ? 'Date unknown' : from === to ? from : `${from} to ${to}`;
  const all = unknown ? AREAS.map(a => ({ area: a.id, cards: profile.cards.filter(c => c.area === a.id && !c.since).map(card => ({ card, overlap: 'possible' as const })) })) : period ? lifeIn(profile, from, to) : [];
  const accepted = all.map(g => ({ ...g, cards: g.cards.filter(({ card: c }) => (reading || !selected.size || selected.has(c.area)) && (reading || !source || (source === '__own' ? !c.source : c.source?.from === source))) }));
  const sources = [...new Set(profile.cards.flatMap(c => c.source ? [c.source.from] : []))].sort();
  const scope = selected.size ? AREAS.filter(a => selected.has(a.id)).map(a => a.title).join(' and ') : 'all areas';
  root.innerHTML = `<a class="back" href="${period ? '#/life' : '#'}">${period ? 'Your life' : 'Home'}</a><h2>${period ? esc(label) : 'Your life'}</h2>
    <div class="life-tools"><form id="life-jump"><label>Jump to year <input name="year" autocomplete="off" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required aria-label="Jump to year"></label><button class="btn">Go</button></form>
    <details><summary>Choose a period</summary><form id="life-period"><p>From ${dateInputs(from === 'unknown' ? '' : from, 'life-from')}</p><p>To ${dateInputs(to === 'unknown' ? '' : to, 'life-to')}</p><button class="btn">Show period</button><p id="life-error" role="alert"></p></form></details></div>
    ${!period ? '<button type="button" class="btn" id="life-copy">Make a readable copy</button>' : ''}${period ? `<div class="life-tools">${AREAS.map(a => chip(a.title, `data-area="${a.id}"`, selected.has(a.id))).join('')}<label>Source <select id="life-source"><option value="">Everything</option><option value="__own">My own</option>${sources.map(s => `<option value="${esc(s)}" ${source === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label><p>Showing ${reading ? 'all areas' : esc(scope)} in ${esc(label)}${!reading && source ? ' · ' + esc(source === '__own' ? 'My own' : source) : ''}</p><button class="btn" id="life-clear">Clear</button><button class="btn" id="life-read">${reading ? 'Back to browsing' : 'Read this period'}</button><button type="button" class="btn" id="life-copy">Make a readable copy</button>${reading ? '<p>This readable copy contains private information. Only print or save it somewhere you choose.</p><button class="btn" id="life-print">Print</button>' : ''}</div><div class="life-reading">${accepted.some(g => g.cards.length) ? '' : `<p>Nothing recorded for ${esc(label)}</p><button class="link-btn" id="life-add">Add something from ${esc(label)}</button>`}${accepted.map(g => {
      const a = AREAS.find(a => a.id === g.area)!;
      const folded = foldCards(g.cards);
      return `<section><h3>${esc(a.title)}</h3>${g.cards.length ? reading ? `<ul>${g.cards.map(cardHtml).join('')}</ul>` : `<ul>${folded.personal.map(cardHtml).join('')}</ul>${[...folded.sources].map(([s, cards]) => `<details><summary>${esc(s)} · ${cards.length} ${s === 'Spotify' ? 'artists and podcasts' : 'cards'}</summary><ul>${cards.map(cardHtml).join('')}</ul></details>`).join('')}` : '<p class="hint">Nothing recorded</p>'}</section>`;
    }).join('')}</div>` : indexHtml()}`;
  const own = root.querySelector<HTMLSelectElement>('#life-source'); if (own) own.value = source;
  root.querySelector<HTMLFormElement>('#life-jump')!.onsubmit = e => { e.preventDefault(); const y = new FormData(e.currentTarget as HTMLFormElement).get('year') as string; if (isValidDate(y)) location.hash = '/life/' + y; };
  root.querySelector<HTMLFormElement>('#life-period')!.onsubmit = e => { e.preventDefault(); const f = readDate(root, 'life-from'), t = readDate(root, 'life-to'); if (!f || !t || !isValidDate(f) || !isValidDate(t) || startKey(f) > endKey(t)) { $('#life-error').textContent = 'Choose valid dates, with the end after the start.'; return; } location.hash = `/life/${f}/${t}`; };
  root.querySelectorAll<HTMLElement>('[data-area]').forEach(b => b.onclick = () => { const a = b.dataset.area!; selected.has(a) ? selected.delete(a) : selected.add(a); renderLife(); });
  if (own) own.onchange = () => { source = own.value; renderLife(); };
  root.querySelectorAll<HTMLElement>('[data-decade]').forEach(b => b.onclick = () => { decade = b.dataset.decade!; renderLife(); });
  root.querySelectorAll<HTMLElement>('[data-card]').forEach(b => b.onclick = () => openCard(b.dataset.card!));
  const bind = (id: string, fn: () => void) => { const el = root.querySelector<HTMLElement>(id); if (el) el.onclick = fn; };
  bind('#life-clear', () => { selected.clear(); source = ''; renderLife(); });
  bind('#life-read', () => { reading = !reading; renderLife(); });
  bind('#life-print', () => window.print());
  bind('#life-copy', () => openReadableCopy(from, to));
  root.querySelectorAll('details').forEach((d, i) => { if (openGroups.includes(i)) d.open = true; });
  if (sameRoute) window.scrollTo(0, scroll);
  bind('#life-add', () => openComposer('home', { kind: 'Address', since: unknown ? '' : from }));
}
function indexHtml(): string {
  const years = yearIndex(profile);
  const decades = [...new Set(years.filter(r => Object.values(r.areas).some(a => a.ongoing || a.starting || a.ending)).map(r => String(Math.floor(r.year / 10) * 10)))];
  if (!decades.includes(decade)) decade = decades.at(-1) || '';
  return `<div class="life-tools">${decades.map(d => chip(d + 's', `data-decade="${d}"`, decade === d)).join('')}<a class="fchip" href="#/life/unknown">Date unknown</a></div>${years.length ? years.filter(r => String(Math.floor(r.year / 10) * 10) === decade).map(r => {
    const cards = lifeIn(profile, String(r.year)).flatMap(g => g.cards.map(i => i.card));
    const homes = cards.filter(c => c.area === 'home' && c.kind === 'Address'), jobs = cards.filter(c => c.area === 'work' && c.kind === 'Job');
    const people = cards.filter(c => c.area === 'people').length;
    const more = cards.length - homes.length - jobs.length - people;
    const text = [...homes.slice(0, 1).map(c => 'Lived: ' + shownValue(c)), ...jobs.slice(0, 1).map(c => 'Worked: ' + shownValue(c)), ...(people ? [people + ' people'] : []), ...(more + Math.max(0, homes.length - 1) + Math.max(0, jobs.length - 1) ? [(more + Math.max(0, homes.length - 1) + Math.max(0, jobs.length - 1)) + ' more'] : [])].join(' · ');
    return `<a class="life-year" href="#/life/${r.year}"><b>${r.year}</b><span>${esc(text || 'Nothing recorded')}</span></a>`;
  }).join('') : '<p>No known life dates yet.</p>'}`;
}


