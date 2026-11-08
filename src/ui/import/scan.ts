// Reading barcodes on the device: from the camera or from a photo of the barcode.
// The barcode library (zxing, compiled to WebAssembly) only downloads the first time it's used,
// and it's served with the app, never from a third party.
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import type { ReaderOptions } from 'zxing-wasm/reader';
import { esc } from '../dom';
import { closeSheet, openSheet, sheetBody, sheetTop } from '../sheet';

type Formats = NonNullable<ReaderOptions['formats']>;
let lib: Promise<typeof import('zxing-wasm/reader')> | null = null;

function zxing() {
  lib ??= import('zxing-wasm/reader').then(m => {
    m.prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }, fireImmediately: true });
    return m;
  });
  return lib;
}

/**
 * Every barcode text found in a photo. 'Plain' keeps control characters as they are: license barcodes
 * separate their fields with line breaks, which the default mode turns into visible symbols.
 */
export async function readPhoto(file: Blob, formats: Formats): Promise<string[]> {
  const m = await zxing();
  const results = await m.readBarcodes(file, { formats, tryHarder: true, maxNumberOfSymbols: 4, textMode: 'Plain' });
  return results.filter(r => r.isValid).map(r => r.text);
}

export const canUseCamera = () => !!navigator.mediaDevices?.getUserMedia;

/**
 * Opens the camera and resolves with the first barcode text that `accept` likes,
 * or null if the person closes it. The camera stops as soon as the sheet closes.
 */
export function scanCamera(o: { title: string; hint: string; formats: Formats; accept: (text: string) => boolean }): Promise<string | null> {
  return new Promise(resolve => {
    let stream: MediaStream | null = null, timer = 0, finished = false;
    const finish = (text: string | null) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      stream?.getTracks().forEach(t => t.stop());
      resolve(text);
    };
    openSheet(`${sheetTop(esc(o.title))}
      <p class="hint">${esc(o.hint)}</p>
      <div class="scan"><video id="scan-video" playsinline muted></video><div class="scan-frame"></div></div>
      <p class="hint" id="scan-status">Starting the camera…</p>
      <div class="btns"><button class="btn quiet" type="button" data-act="close">Cancel</button></div>`);
    document.getElementById('sheet')!.addEventListener('close', () => finish(null), { once: true });

    const video = sheetBody.querySelector<HTMLVideoElement>('#scan-video')!;
    const status = sheetBody.querySelector<HTMLElement>('#scan-status')!;
    const canvas = document.createElement('canvas');
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (finished) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        status.textContent = 'Looking for the barcode…';
        const m = await zxing();
        let busy = false;
        timer = window.setInterval(async () => {
          if (busy || finished || !video.videoWidth) return;
          busy = true;
          try {
            const scale = Math.min(1, 1600 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const found = await m.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), { formats: o.formats, tryHarder: true, maxNumberOfSymbols: 1, textMode: 'Plain' });
            const hit = found.find(r => r.isValid && o.accept(r.text));
            if (hit) { finish(hit.text); closeSheet(); }
          } catch { clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); status.textContent = 'The barcode could not be read. Cancel and try a sharper photo, or enter the details by hand.'; } finally { busy = false; }
        }, 300);
      } catch {
        clearInterval(timer); stream?.getTracks().forEach(t => t.stop());
        status.textContent = 'The camera couldn’t be opened. Check the browser’s camera permission, or use a photo instead.';
      }
    })();
  });
}
