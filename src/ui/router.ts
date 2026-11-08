import { renderLife } from './life';
// Home screen, the overview of areas, and simple hash routing (#health opens Health).
import { AREAS, areaById, type Area } from '../core/areas';
import { profile } from '../state';
import { renderArea } from './area';
import { $, ICON, esc } from './dom';
import { renderWhoButton } from './switcher';

const overview = $('#overview');
const detail = $('#detail');

/** "#interests" is an area; "#interests/Movie%20or%20show" is one kind inside it. */
function parseHash(): { area?: Area; kind?: string } {
  const [a, k] = location.hash.slice(1).split('/');
  let kind: string | undefined;
  try { kind = k ? decodeURIComponent(k) : undefined; } catch { kind = undefined; }
  return { area: areaById(a), kind };
}
export const currentArea = (): Area | undefined => parseHash().area;
const isHome = () => document.body.classList.contains('home');

export function showHome() {
  document.body.classList.add('home');
  $('#space').hidden = false;
  $('#you-name').textContent = profile.name;
  $('#back-name').textContent = profile.name || 'Back';
  renderWhoButton();
  route();
}

export function route() {
  // A sheet's history marker only matters while that sheet is open. After a refresh or reload the sheet is
  // gone but the marker can survive; drop it so the page underneath still draws.
  if (history.state?.youSheet) {
    if ($<HTMLDialogElement>('#sheet').open) return;
    history.replaceState({ ...history.state, youSheet: undefined }, '');
  }
  if (!isHome()) return;
  const life = /^#\/?life(?:\/|$)/.test(location.hash);
  $('#life').hidden = !life;
  if (life) { overview.hidden = true; detail.hidden = true; renderLife(); return; }
  const { area: a, kind } = parseHash();
  overview.hidden = !!a;
  detail.hidden = !a;
  if (a) { renderArea(a, kind); window.scrollTo(0, 0); }
  else renderOverview();
}

/** Redraws whatever is showing, without scrolling. */
export function refresh() {
  if (!isHome()) return;
  const life = /^#\/?life(?:\/|$)/.test(location.hash);
  $('#life').hidden = !life;
  if (life) { overview.hidden = true; detail.hidden = true; renderLife(); return; }
  const { area: a, kind } = parseHash();
  a ? renderArea(a, kind) : renderOverview();
}

function renderOverview() {
  $('#areas').innerHTML = AREAS.map(a => {
    const n = profile.cards.filter(c => c.area === a.id && c.status === 'active').length;
    const meta = n ? `<small class="count">${n} active</small>` : `<small>${esc(a.hint)}</small>`;
    return `<a class="area" href="#${a.id}">${ICON.addCorner}
      <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${a.icon}</svg>
      <span><h3>${esc(a.title)}</h3>${meta}</span>
    </a>`;
  }).join('');
}

/**
 * After moving between home, an area and Your life, focus would be left on a control that is now
 * hidden (the page itself, for the keyboard). Put it on the new view's heading, or back on the area
 * tile you came from when returning home, so Tab carries on from where you are.
 */
function placeFocus(from: string) {
  if (!isHome() || $<HTMLDialogElement>('#sheet').open) return;
  const a = document.activeElement;
  if (a instanceof HTMLElement && a !== document.body && a.offsetParent !== null && !a.closest('[hidden]')) return;
  const { area } = parseHash();
  const life = /^#\/?life(?:\/|$)/.test(location.hash);
  let el: HTMLElement | null = null;
  if (area) el = $<HTMLElement>('#d-title');
  else if (life) el = document.querySelector<HTMLElement>('#life h2, #life h1');
  else {
    const prev = from.replace(/^\//, '').split('/')[0];
    el = document.querySelector<HTMLElement>(`#areas a[href="#${CSS.escape(prev)}"]`) ?? (/life/.test(prev) ? document.querySelector<HTMLElement>('a.life-entry') : null);
  }
  if (!el) return;
  const heading = !el.matches('a, button, input, select, textarea, [tabindex]');
  if (heading) el.tabIndex = -1;
  el.focus({ preventScroll: heading }); // a heading is at the top already; a tile may need scrolling to
}

window.addEventListener('hashchange', e => {
  route();
  placeFocus(new URL(e.oldURL).hash.slice(1));
});
