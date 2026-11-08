import { profile } from '../state';
import { fileNameFor } from '../storage/fileFormat';
import { target } from '../storage/target';
import { buildPlan, checkFile, type AccessPlan } from '../core/safety';
import { $, esc } from './dom';
import { openSheet, sheetBody, sheetTop } from './sheet';

export function openSafety() {
  openSheet(`${sheetTop('Keep it safe')}<h3 class="sh-title">A copy you can come back to</h3>
    <p>${target.kind === 'browser' ? 'Today your data is in this browser only.' : `Your browser copy saves to ${esc(target.name)}.`}</p>
    <p>Clearing this browser’s data or losing this device erases the browser copy. Saved files are untouched.</p>
    <ol><li>Keep a separate saved file.</li><li>Find its name beside “Saved to …” in the top bar (or “Downloaded”). The newest copy is the one You last saved.</li><li>Open your file in another browser, type your passphrase.</li></ol>
    <p>A forgotten passphrase can’t be recovered by anyone. Keep it in a password manager or written somewhere safe.</p>
    <div class="menu"><button data-act="check">Check my file now</button><button data-act="plan">Plan for someone you trust</button></div>
    <p class="hint">Both are optional. You can close this any time.</p>`, { check: openCheck, plan: openPlan });
}
function openCheck() {
  openSheet(`${sheetTop('Keep it safe')}<h3 class="sh-title">Check my file</h3><p>This only checks your file. Your open You stays as it is.</p>
    <form id="check-form" class="safety-form"><label for="check-file">Your .you.json file</label><input id="check-file" type="file" accept=".you.json" required>
    <label for="check-pass">File passphrase</label><input id="check-pass" type="password" autocomplete="off" required>
    <button class="btn primary" type="submit">Check file</button><p id="check-result" role="status"></p></form>`);
  const form = $<HTMLFormElement>('#check-form', sheetBody);
  form.onsubmit = async e => {
    e.preventDefault();
    const file = $<HTMLInputElement>('#check-file', form).files?.[0];
    if (!file) return;
    const pass = $<HTMLInputElement>('#check-pass', form);
    const result = $('#check-result', form);
    const button = $<HTMLButtonElement>('button', form);
    button.disabled = true;
    result.textContent = 'Checking…';
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
    <form id="plan-form" class="safety-form"><label for="plan-for">Who it’s for (optional)</label><input id="plan-for">
    <label for="plan-place">Where the file is kept</label><input id="plan-place" value="${esc(target.name)}" placeholder="Dropbox folder on the laptop">
    <p class="hint">The file’s location is private information too.</p>
    <p>Passphrase: a blank line to fill in by hand. Write it here, or tell them where it’s kept.</p>
    <label><input id="plan-opt" type="checkbox"> Print my passphrase on the sheet</label>
    <div id="plan-secret" hidden><label for="plan-pass">Type the passphrase to include</label><input id="plan-pass" type="password" autocomplete="off"><p>Anyone with the sheet and the file can read everything.</p></div>
    <p class="hint">No life details are included. Nothing here is saved or sent.</p>
    <div class="btns"><button class="btn primary" type="submit">Print plan</button><button class="btn quiet" type="button" data-act="download">Download plan as a page</button></div></form>`, { download: () => output(false) });
  const form = $<HTMLFormElement>('#plan-form');
  const opt = $<HTMLInputElement>('#plan-opt');
  const pass = $<HTMLInputElement>('#plan-pass');
  opt.onchange = () => { $('#plan-secret').hidden = !opt.checked; pass.required = opt.checked; if (!opt.checked) pass.value = ''; };
  form.onsubmit = e => { e.preventDefault(); output(true); };
  function output(print: boolean) {
    if (!form.reportValidity()) return;
    const answers: AccessPlan = { recipient: $<HTMLInputElement>('#plan-for').value, location: $<HTMLInputElement>('#plan-place').value, fileName: name, origin: location.origin, printPassphrase: opt.checked, passphrase: opt.checked ? pass.value : '' };
    const html = buildPlan(answers);
    if (print) {
      const frame = document.createElement('iframe');
      frame.className = 'plan-print-frame';
      frame.title = 'Private access plan';
      frame.onload = () => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 1000); };
      frame.srcdoc = html;
      document.body.append(frame);
    } else {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a'); a.href = url; a.download = 'you-private-plan.html'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    pass.value = '';
  }
}
