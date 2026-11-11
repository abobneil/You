import { profile } from '../state';
import { fileNameFor } from '../storage/fileFormat';
import { target } from '../storage/target';
import { buildPlan, checkFile, planBody, type AccessPlan } from '../core/safety';
import { $, esc, disableKeepingFocus } from './dom';
import { openSheet, sheetBody, sheetTop } from './sheet';
import { passField, wirePeek } from './passField';
import { openComparePair } from './comparePair';

export function openSafety() {
  openSheet(`${sheetTop('Keep it safe')}<h3 class="sh-title">A copy you can come back to</h3>
    <p>${target.kind === 'browser' ? 'Today your data is in this browser only.' : `Your browser copy saves to ${esc(target.name)}.`}</p>
    <p>Clearing this browser’s data or losing this device erases the browser copy. Saved files are untouched.</p>
    <ol><li>Keep a separate saved file.</li><li>Find its name beside “Saved to …” in the top bar (or “Downloaded”). The newest copy is the one You last saved.</li><li>Open your file in another browser, type your passphrase.</li></ol>
    <p>A forgotten passphrase can’t be recovered by anyone. Keep it in a password manager or written somewhere safe.</p>
    <div class="menu"><button data-act="check">Check my file now</button><button data-act="plan">Plan for someone you trust</button><button data-act="pair">Compare two copies…</button></div>
    <p class="hint">All optional. Compare two copies when you have saved files from two devices. You can close this any time.</p>`, { check: openCheck, plan: openPlan, pair: () => openComparePair() });
}
function openCheck() {
  openSheet(`${sheetTop('Keep it safe')}<h3 class="sh-title">Check my file</h3><p>This only checks your file. Your open You stays as it is.</p>
    <form id="check-form" class="safety-form"><label for="check-file">Your .you.json file</label><input id="check-file" type="file" accept=".you.json" required>
    <label for="check-pass">File passphrase</label>${passField('check-pass', 'current-password')}
    <button class="btn primary" type="submit">Check file</button><p id="check-result" role="status"></p></form>`);
  const form = $<HTMLFormElement>('#check-form', sheetBody);
  wirePeek(form);
  form.onsubmit = async e => {
    e.preventDefault();
    const file = $<HTMLInputElement>('#check-file', form).files?.[0];
    if (!file) return;
    const pass = $<HTMLInputElement>('#check-pass', form);
    const result = $('#check-result', form);
    const button = $<HTMLButtonElement>('button[type=submit]', form);
    result.textContent = 'Checking…';
    disableKeepingFocus(button, result);
    try {
      const pending = checkFile(await file.text(), pass.value);
      pass.value = '';
      const answer = await pending;
      result.textContent = answer.ok ? `Your file opens: ${answer.cards} cards. Last saved: ${answer.lastSaved ? new Date(answer.lastSaved).toLocaleString() : 'date unavailable'}. The check is finished; nothing was saved.` : answer.message;
    } catch { result.textContent = 'That file could not be read. Please try again.'; }
    finally { pass.value = ''; button.disabled = false; }
  };
}
function openPlan() {
  const name = target.name || fileNameFor(profile.name);
  openSheet(`${sheetTop('Optional')}<h3 class="sh-title">Plan for someone you trust</h3>
    <form id="plan-form" class="safety-form"><label for="plan-for">Who it’s for (optional)</label><input id="plan-for" autocomplete="off">
    <label for="plan-place">Where the file is kept</label><input id="plan-place" autocomplete="off" value="${esc(target.name)}" placeholder="Dropbox folder on the laptop">
    <p class="hint">The file’s location is private information too.</p>
    <p>Passphrase: a blank line to fill in by hand. Write it here, or tell them where it’s kept.</p>
    <label><input id="plan-opt" type="checkbox"> Print my passphrase on the sheet</label>
    <div id="plan-secret" hidden><label for="plan-pass">Type the passphrase to include</label>${passField('plan-pass', 'off', false)}<p>Anyone with the sheet and the file can read everything.</p></div>
    <p class="hint">No life details are included. Nothing here is saved or sent.</p>
    <div class="btns"><button class="btn primary" type="submit">Print plan</button><button class="btn quiet" type="button" data-act="download">Download plan as a page</button></div></form>`, { download: () => output(false) });
  const form = $<HTMLFormElement>('#plan-form');
  const opt = $<HTMLInputElement>('#plan-opt');
  const pass = $<HTMLInputElement>('#plan-pass');
  wirePeek(form);
  opt.onchange = () => { $('#plan-secret').hidden = !opt.checked; pass.required = opt.checked; if (!opt.checked) { pass.value = ''; pass.type = 'password'; } };
  form.onsubmit = e => { e.preventDefault(); output(true); };
  function output(print: boolean) {
    if (!form.reportValidity()) return;
    const answers: AccessPlan = { recipient: $<HTMLInputElement>('#plan-for').value, location: $<HTMLInputElement>('#plan-place').value, fileName: name, origin: location.origin, printPassphrase: opt.checked, passphrase: opt.checked ? pass.value : '' };
    if (print) {
      // Printed from this page with app.css's print-only rules: the app's content policy blocks a
      // printed document's own <style>, so it would otherwise print unstyled.
      const box = document.createElement('div');
      box.id = 'plan-print';
      box.innerHTML = planBody(answers);
      document.body.append(box);
      document.body.classList.add('printing-plan');
      const done = () => { box.remove(); document.body.classList.remove('printing-plan'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 1000);
    } else {
      const url = URL.createObjectURL(new Blob([buildPlan(answers)], { type: 'text/html' }));
      const a = document.createElement('a'); a.href = url; a.download = 'you-private-plan.html'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    pass.value = '';
  }
}
