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
      const { kind, data, keptId } = hook.stash() as { kind: string; data: unknown; keptId?: string };
      // A draft resumed from the record replaces its own entry rather than adding a second one.
      profile.drafts = [...kept().filter(x => x.id !== keptId), { id: keptId ?? crypto.randomUUID(), kind, at: new Date().toISOString(), data }];
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
    // It stays in the record (encrypted) until the card is added or the draft discarded.
    keep: () => { closeSheet(); resumeDraft(d.data, d.id); },
    discard: () => {
      remove();
      const ids = ((d.data as { keepsakes?: { id: string }[] })?.keepsakes ?? []).map(k => k.id);
      if (ids.length && profile.id) void dropRows(profile.id, ids);
      closeSheet();
    },
  });
}
