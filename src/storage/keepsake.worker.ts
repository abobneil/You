import { readFile } from './fileFormat';
import { commitStaged, stageKeepsakes } from './keepsakeImport';
import { idbKeepsakeStore } from './keepsakeStore';
let controller: AbortController;
self.onmessage = async ({ data }) => {
  if (data.abort) { controller?.abort(); return; }
  controller = new AbortController();
  try {
    if (data.commit) {
      await commitStaged(idbKeepsakeStore, data.commit, data.profile.id, data.profile, controller.signal);
      self.postMessage({ committed: true });
      return;
    }
    const r = await readFile(data.file);
    if (r.kind !== 'locked') throw new Error('Expected encrypted file');
    const staged = await stageKeepsakes(idbKeepsakeStore, data.vault, data.profile, r.keepsakes(), {
      prefix: data.prefix,
      onProgress: (checked, total) => self.postMessage({ checked, total }),
    });
    self.postMessage({ staged });
  } catch (e) { self.postMessage({ error: (e as Error).message }); }
};
