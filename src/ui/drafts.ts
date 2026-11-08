// Unfinished typing that was kept when the screen locked by itself. It is stored in the record
// (so it's encrypted like everything else) and offered back after unlocking.
import { profile, save } from '../state';
import { dropRows } from '../storage/keepsakeAccess';
import { resumeDraft } from './composer';
import { closeSheet, commitOpenField, openDraft, openSheet, sheetTop } from './sheet';

export interface KeptDraft { id: string; kind: string; at: string; data: unknown }
const kept = (): KeptDraft[] => (Array.isArray(profile.drafts) ? profile.drafts as KeptDraft[] : []);

/**
 * Before locking: saves a half-typed field and keeps any unfinished draft in the record.
 * Closes the open panel either way, so nothing stays on screen. True if something was kept.
 */
export function keepOpenDraft(): boolean {
  const hook = openDraft();
  let keptOne = false;
  if (hook?.stash) {
    try {
      const { kind, data } = hook.stash();
      profile.drafts = [...kept(), { id: crypto.randomUUID(), kind, at: new Date().toISOString(), data }];
      keptOne = true;
    } catch (e) { console.error(e); }
  } else commitOpenField();
  closeSheet();
  if (keptOne) save();
  return keptOne;
}

/** After unlocking: "You had an unfinished card — keep it?" */
export function offerKeptDrafts() {
  const d = kept()[0];
  if (!d) return;
  const remove = () => { profile.drafts = kept().filter(x => x.id !== d.id); if (!kept().length) delete profile.drafts; save(); };
  openSheet(`${sheetTop('Unfinished card')}<h3 class="sh-title">You had an unfinished card — keep it?</h3>
    <p>It was kept, encrypted, when this You locked itself on ${new Date(d.at).toLocaleString()}.</p>
    <div class="menu"><button data-act="keep">Keep editing it</button><button data-act="discard" class="soft">Discard it</button><button data-act="close">Decide later</button></div>`, {
    keep: () => { remove(); closeSheet(); resumeDraft(d.data); },
    discard: () => {
      remove();
      const ids = ((d.data as { keepsakes?: { id: string }[] })?.keepsakes ?? []).map(k => k.id);
      if (ids.length && profile.id) void dropRows(profile.id, ids);
      closeSheet();
    },
  });
}
