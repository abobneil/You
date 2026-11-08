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

window.addEventListener('hashchange', route);
