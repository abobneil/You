// "Compare two copies…": two saved files of the same You (say, from the laptop and the phone), or one
// file and this browser's copy. Each is opened in memory with its own passphrase. Then the person
// chooses: keep both as separate files (each saved untouched, under a name that tells them apart) or
// combine them into one, which they then save through the usual picker. Nothing changes before that choice.
import { combine } from '../core/compare';
import type { Profile } from '../core/types';
import { keepBothNames, openCopy, pairProblem, pairSummary, type OpenedCopy } from '../storage/filePair';
import { downloadCopy } from '../storage/target';
import { profile, save, vault } from '../state';
import { $, announce, esc } from './dom';
import { passField, wirePeek } from './passField';
import { openSheet, sheetBody, sheetTop } from './sheet';
import { openStoragePicker } from './storagePicker';

/** The other side of the comparison: a second file, or what this browser holds now. */
type Side = OpenedCopy | { browser: true; profile: Profile };
const isBrowser = (s: Side): s is { browser: true; profile: Profile } => 'browser' in s;
const nameOf = (s: Side) => (isBrowser(s) ? 'this browser' : s.fileName);

export function openComparePair() {
  const canUseBrowser = !!profile.id && !!vault;
  openSheet(`${sheetTop('Keep it safe')}<h3 class="sh-title">Compare two copies</h3>
    <p>Have saved files from two devices? Choose both, or one file and this browser’s copy. Each opens here with its own passphrase. Nothing is saved or replaced until you choose.</p>
    <form id="pair-form" class="safety-form" novalidate>
      <fieldset><legend>First copy</legend>
        <label for="pair-a">Saved file</label><input id="pair-a" type="file" accept=".json,application/json" required>
        <label for="pair-a-pass">Its passphrase</label>${passField('pair-a-pass', 'current-password')}
      </fieldset>
      <fieldset><legend>Second copy</legend>
        ${canUseBrowser ? `<label class="pair-choice"><input type="radio" name="pair-b-kind" value="file" checked> Another saved file</label>
        <label class="pair-choice"><input type="radio" name="pair-b-kind" value="browser"> This browser’s copy</label>` : ''}
        <div id="pair-b-file"><label for="pair-b">Saved file</label><input id="pair-b" type="file" accept=".json,application/json" required>
        <label for="pair-b-pass">Its passphrase</label>${passField('pair-b-pass', 'current-password')}</div>
      </fieldset>
      <p id="pair-msg" role="alert"></p>
      <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Open and compare</button></div>
    </form>`);
  const form = $<HTMLFormElement>('#pair-form', sheetBody);
  wirePeek(form);
  const bBox = $('#pair-b-file', form);
  const usingBrowser = () => form.querySelector<HTMLInputElement>('input[name=pair-b-kind]:checked')?.value === 'browser';
  form.querySelectorAll<HTMLInputElement>('input[name=pair-b-kind]').forEach(r => r.onchange = () => { bBox.hidden = usingBrowser(); });
  form.onsubmit = async e => {
    e.preventDefault();
    const msg = $('#pair-msg', form);
    const go = $<HTMLButtonElement>('button[type=submit]', form);
    const fa = $<HTMLInputElement>('#pair-a', form).files?.[0];
    const fb = $<HTMLInputElement>('#pair-b', form).files?.[0];
    const pa = $<HTMLInputElement>('#pair-a-pass', form), pb = $<HTMLInputElement>('#pair-b-pass', form);
    if (!fa) { msg.textContent = 'Choose the first saved file.'; return; }
    if (!usingBrowser() && !fb) { msg.textContent = 'Choose the second saved file, or compare with this browser’s copy.'; return; }
    go.disabled = true; msg.textContent = 'Opening…';
    try {
      // Passphrases are read once and cleared straight away; nothing is kept.
      const passA = pa.value, passB = pb.value; pa.value = ''; pb.value = '';
      const a = await openCopy(fa.name, await fa.text(), passA);
      if ('error' in a) { msg.textContent = a.error; return; }
      let b: Side;
      if (usingBrowser()) b = { browser: true, profile: structuredClone(profile) };
      else {
        const opened = await openCopy(fb!.name, await fb!.text(), passB);
        if ('error' in opened) { msg.textContent = opened.error; return; }
        b = opened;
      }
      const problem = pairProblem(a.profile, b.profile);
      if (problem) { msg.textContent = problem; return; }
      showComparison(a, b);
    } catch { msg.textContent = 'Those files could not be opened. Nothing was changed.'; }
    finally { if (go.isConnected) go.disabled = false; }
  };
}

function showComparison(a: OpenedCopy, b: Side) {
  const first = a.fileName, second = nameOf(b);
  const d = pairSummary(a.profile, b.profile, first, second);
  const list = (cards: { value: string; kind: string }[]) => cards.length
    ? `<ul class="pair-list">${cards.slice(0, 20).map(c => `<li>${esc(c.kind)}: ${esc(c.value)}</li>`).join('')}${cards.length > 20 ? `<li>…and ${cards.length - 20} more</li>` : ''}</ul>` : '';
  // Combining puts the result in this browser, so it needs this You to be the one that's open.
  const canCombine = !!vault && profile.id === a.profile.id;
  openSheet(`${sheetTop('Compare two copies')}<h3 class="sh-title">What’s different</h3>
    <p data-announce>${esc(d.text)}</p>
    ${d.onlyA.length ? `<h4 class="pair-h">Only in ${esc(first)}</h4>${list(d.onlyA)}` : ''}
    ${d.onlyB.length ? `<h4 class="pair-h">Only in ${esc(second)}</h4>${list(d.onlyB)}` : ''}
    ${d.changed.length ? `<h4 class="pair-h">Changed in both</h4><ul class="pair-list">${d.changed.slice(0, 20).map(([x, y]) => `<li>${esc(first)}: ${esc(x.value)}<br>${esc(second)}: ${esc(y.value)}</li>`).join('')}${d.changed.length > 20 ? `<li>…and ${d.changed.length - 20} more</li>` : ''}</ul>` : ''}
    <p class="hint">Keep both saves each copy as its own file, exactly as it is. Combine into one keeps every card from both, with earlier wording kept in each card’s history${isBrowser(b) ? '' : ', and adds this browser’s cards too'}.</p>
    ${canCombine ? '' : '<p class="hint">To combine, open this You first (load one of the files), then compare again. Keep both works now.</p>'}
    <div class="menu"><button type="button" data-act="both">Keep both as separate files</button>${canCombine ? '<button type="button" data-act="combine">Combine into one…</button>' : ''}</div>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button></div>`, {
    both: () => keepBoth(a, b),
    combine: () => confirmCombine(a, b),
  });
}

function download(name: string, text: string) {
  const el = document.createElement('a');
  el.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  el.download = name;
  document.body.append(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(el.href), 60_000);
}

async function keepBoth(a: OpenedCopy, b: Side) {
  const [nameA, nameB] = keepBothNames(a.profile, b.profile);
  download(nameA, a.text);
  let second = nameB;
  if (isBrowser(b)) { await downloadCopy(true); second = 'a dated copy of this browser’s version'; }
  else download(nameB, b.text);
  openSheet(`${sheetTop('Compare two copies')}<h3 class="sh-title">Both copies kept</h3>
    <p data-announce>Downloaded ${esc(nameA)} and ${esc(second)}. Each is complete and unchanged, and opens with its own passphrase. Nothing in this browser changed.</p>
    <p>Next: keep the newer one as your main file and the other somewhere safe as a backup. You can come back here and combine them any time.</p>
    <div class="btns"><button class="btn primary" type="button" data-act="close">Done</button></div>`);
}

function confirmCombine(a: OpenedCopy, b: Side) {
  openSheet(`${sheetTop('Compare two copies')}<h3 class="sh-title">Combine into one?</h3>
    <p>The combined record replaces what this browser holds now. It keeps every card from ${esc(a.fileName)}, ${esc(nameOf(b))}${isBrowser(b) ? '' : ' and this browser'}. The chosen files stay exactly as they are.</p>
    <p>Afterwards you choose where to save it.</p>
    <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="go">Combine</button></div>`, {
    go: () => doCombine(a, b),
  });
}

async function doCombine(a: OpenedCopy, b: Side) {
  try {
    const files = isBrowser(b) ? [a] : [a, b];
    const fromFiles = isBrowser(b) ? a.profile : combine(a.profile, b.profile);
    const merged = combine(profile, fromFiles);
    JSON.stringify(merged); // must be saveable before it replaces anything
    const { stageKeepsakes, commitStaged, discardStaged } = await import('../storage/keepsakeImport');
    const { keepsakeStore } = await import('../storage/keepsakeAccess');
    const staged = [];
    try {
      for (const f of files) {
        if (f.read.kind !== 'locked' || !f.vault) continue;
        // Each file opens with its own key; what's kept here must open with the open You's key.
        const s = await stageKeepsakes(keepsakeStore, f.vault, f.profile, f.read.keepsakes(), { rekeyTo: vault! });
        staged.push(s);
        if (s.problems.length) throw new Error('Some attachments could not be read');
      }
    } catch (e) { for (const s of staged) await discardStaged(keepsakeStore, s); throw e; }
    for (const s of staged) await commitStaged(keepsakeStore, s, merged.id!, merged);
    Object.assign(profile, merged);
    save();
    announce('Combined into one.');
    openSheet(`${sheetTop('Compare two copies')}<h3 class="sh-title">Combined into one</h3>
      <p data-announce>This browser now holds the combined record. The chosen files are unchanged.</p>
      <p>Save it somewhere so you have one up-to-date file.</p>
      <div class="btns"><button class="btn quiet" type="button" data-act="close">Later</button><button class="btn primary" type="button" data-act="save">Choose where to save it</button></div>`, {
      save: () => openStoragePicker('save'),
    });
  } catch {
    openSheet(`${sheetTop('Compare two copies')}<h3 class="sh-title">These copies couldn’t be combined</h3>
      <p data-announce>Nothing was changed. You can keep both as separate files instead.</p>
      <div class="menu"><button type="button" data-act="both">Keep both as separate files</button></div>
      <div class="btns"><button class="btn quiet" type="button" data-act="close">Close</button></div>`, { both: () => keepBoth(a, b) });
  }
}
