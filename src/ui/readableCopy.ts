import { buildReadable } from '../core/readableExport';
import { readKeepsake } from '../storage/keepsakeAccess';
import { profile } from '../state';
import { openSheet, closeSheet, sheetBody, onSheetClose, sheetTop } from './sheet';
import { esc } from './dom';

let running: AbortController | undefined;
onSheetClose(() => { running?.abort(); running = undefined; });
export function openReadableCopy(from = '', to = from) {
  const label = from === 'unknown' ? 'Date unknown' : from === to ? from : `${from} to ${to}`;
  openSheet(`${sheetTop('Readable copy')}<h3 class="sh-title">Make a readable copy</h3><label class="sel-lab">What period? <select class="fsel" id="readable-period">${from ? `<option value="period">${esc(label)}</option>` : ''}<option value="all">Everything</option></select></label>
    <p>This copy is NOT encrypted. Anyone who gets the file can read it. Keep it somewhere private, and delete it when you're done.</p>
    <p><label><input type="checkbox" id="readable-files" checked> Include photos and files</label></p>
    <p><label><input type="checkbox" id="readable-sensitive"> Include sensitive details (ID numbers…)</label></p>
    <p id="readable-progress" role="status" aria-live="polite"></p>
    <div class="actions"><button type="button" class="btn" data-act="close" autofocus>Cancel</button><button type="button" class="btn" data-act="make">I understand, make the copy</button></div>`, {
    make: async () => {
      if (running) return;
      const all = sheetBody.querySelector<HTMLSelectElement>('#readable-period')!.value === 'all';
      const controller = new AbortController(); running = controller;
      const button = sheetBody.querySelector<HTMLButtonElement>('[data-act="make"]')!;
      button.disabled = true;
      const status = sheetBody.querySelector<HTMLElement>('#readable-progress')!;
      status.textContent = 'Preparing your copy…';
      try {
        const result = await buildReadable(profile, { from: all ? undefined : from, to: all ? undefined : to,
          includeFiles: sheetBody.querySelector<HTMLInputElement>('#readable-files')!.checked,
          sensitive: sheetBody.querySelector<HTMLInputElement>('#readable-sensitive')!.checked,
          signal: controller.signal, progress: (done, total) => { status.textContent = total ? `Preparing files: ${done} of ${total}…` : 'Preparing your copy…'; },
        }, readKeepsake);
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(new Blob([result.bytes as BlobPart], { type: 'application/zip' }));
        const a = document.createElement('a'); a.href = url; a.download = result.name; document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        running = undefined;
        status.textContent = 'Your download is ready. On iPhone, find it in Files. Keep it somewhere private.';
        button.textContent = 'Done'; button.disabled = false; button.onclick = closeSheet; button.removeAttribute('data-act');
      } catch (error) {
        if (!controller.signal.aborted) { status.textContent = error instanceof Error ? error.message : 'Could not make the copy. Please try again.'; button.disabled = false; }
      } finally { if (running === controller) running = undefined; }
    },
  });
  sheetBody.querySelector<HTMLButtonElement>('[data-act="close"]')!.focus();
}
