/** A file's bytes and metadata are checked before each atomic swap-file write. */
export class FileChanged extends Error {}
export interface WritableFile {
  getFile(): Promise<Blob & { lastModified: number }>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
}
export async function fingerprint(h: WritableFile) {
  const f = await h.getFile();
  const hash = await crypto.subtle.digest('SHA-256', await f.arrayBuffer());
  return `${f.lastModified}/${f.size}/${Array.from(new Uint8Array(hash)).join(',')}`;
}
export function fileWriter() {
  let expected: string | undefined;
  let tail = Promise.resolve();
  return {
    load: async (h: WritableFile, previous?: string) => { expected = previous ?? await fingerprint(h); },
    fingerprint: () => expected,
    write(h: WritableFile, parts: AsyncIterable<string>) {
      const job = tail.then(async () => {
        if (expected !== undefined && await fingerprint(h) !== expected) throw new FileChanged();
        const out = await h.createWritable();
        try {
          for await (const part of parts) await out.write(part);
          await out.close();
        } catch (e) { try { await out.abort?.(); } catch {} throw e; }
        expected = await fingerprint(h);
      });
      tail = job.catch(() => {});
      return job;
    },
  };
}
