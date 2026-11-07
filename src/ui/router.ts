// Home screen, the overview of areas, and simple hash routing (#health opens Health).
import { AREAS, areaById, type Area } from '../core/areas';
import { profile } from '../state';
import { renderArea } from './area';
import { $, ICON, esc } from './dom';
import { renderWhoButton } from './switcher';

const overview = $('#overview');
const detail = $('#detail');

export const currentArea = (): Area | undefined => areaById(location.hash.slice(1));
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
  if (!isHome()) return;
  const a = currentArea();
  overview.hidden = !!a;
  detail.hidden = !a;
  if (a) { renderArea(a); window.scrollTo(0, 0); }
  else renderOverview();
}

/** Redraws whatever is showing, without scrolling. */
export function refresh() {
  if (!isHome()) return;
  const a = currentArea();
  a ? renderArea(a) : renderOverview();
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
