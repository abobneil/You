import { streamingZip } from '../../core/import/streaming';
import { streamingWire } from '../../core/import/streamingWire';
self.onmessage = async ({ data }) => {
  try {
    const texts: Record<string, string> = {};
    for (const f of data.files as File[]) {
      self.postMessage({ progress: `Reading ${f.name}…` });
      if (/\.zip$/i.test(f.name)) Object.assign(texts, streamingZip(new Uint8Array(await f.arrayBuffer())));
      else texts[f.name] = await f.text();
    }
    if (!Object.keys(texts).length) throw new Error('No viewing or listening history was found in that zip. Check that you chose the export from Netflix, Spotify, Apple or Google Takeout.');
    self.postMessage({ progress: 'Preparing review…' });
    self.postMessage({ result: streamingWire(texts, data.name) });
  } catch (e) { self.postMessage({ error: (e as Error).message }); }
};
