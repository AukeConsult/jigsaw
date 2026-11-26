import { effect, untracked } from '@angular/core';
import { JigsawUserSpec } from '../models/shared/jigsaw-user';
import { JigsawUserService } from './jigsaw-user.service';

/** how long after the last choice it is kept with the account (one choice after another is one save) */
const SAVE_PAUSE_MS = 800;

/**
 * **A choice of the player that is also kept with the account** (rule 12 of `CLAUDE.md`: on the device at once, so it is there before the account is read, and for nobody). Called where the service of the choice is made. When another
 * account plays (or the first one has been read) its own choice is shown with `show`, when it has one (`theirs`); one that has none leaves what the device has. What is returned is called after a choice: `save` runs a pause
 * after the last one.
 */
export function keptWithAccount<T>(users: JigsawUserService, theirs: (account: JigsawUserSpec) => T | undefined, show: (value: T) => void, save: () => void): () => void {
  /** whose choice is shown: undefined to begin with, then the id of the account (null: nobody) */
  let owner: string | null | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  effect(() => {
    const account = users.user();
    const id = account?.id ?? null;
    untracked(() => {
      if (id === owner) return;
      clearTimeout(timer); // a choice not kept yet belonged to the one who made it
      owner = id;
      const value = account ? theirs(account) : undefined;
      if (value !== undefined) show(value);
    });
  });
  return () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_PAUSE_MS);
  };
}
