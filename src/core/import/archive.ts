import { Unzip, UnzipInflate } from 'fflate';
export const ARCHIVE_LIMIT = 'This file is larger than You can read (limit 500 MB unpacked, 200 MB per file, 10,000 files). Nothing was changed.';
export const budget = () => ({ bytes: 0, entries: 0 });
/** Stream output in small chunks: never allocate an entry based on an untrusted size. */
export function readZip(bytes: Uint8Array, accept: (name: string) => boolean, tally = budget()): Record<string, Uint8Array> {
 const out: Record<string, Uint8Array> = Object.create(null);
 let failure: Error | undefined;
 const zip = new Unzip(file => {
   if (++tally.entries > 10000 || (file.originalSize ?? 0) > 200 * 1024 ** 2 || tally.bytes + (file.originalSize ?? 0) > 500 * 1024 ** 2) { failure = new Error(ARCHIVE_LIMIT); return; }
   if (!accept(file.name)) return;
   const chunks: Uint8Array[] = []; let size = 0;
   file.ondata = (err, data, final) => {
     if (err) { failure = err; return; }
     size += data.length; tally.bytes += data.length;
     if (size > 200 * 1024 ** 2 || tally.bytes > 500 * 1024 ** 2) { failure = new Error(ARCHIVE_LIMIT); file.terminate(); return; }
     chunks.push(data);
     if (final && !failure) { const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } out[file.name] = result; }
   };
   file.start();
 });
 zip.register(UnzipInflate);
 for (let i = 0; i < bytes.length; i += 4096) { zip.push(bytes.subarray(i, i + 4096), i + 4096 >= bytes.length); if (failure) throw failure; }
 return out;
}
