import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { JigsawFilter, JigsawFilters } from '../app/models/shared/jigsaw-filter';
import { JigsawUserService } from '../app/jigsaw/jigsaw-user.service';
import { FilterVisibility } from '../app/models/shared/jigsaw-search';
import { readFinderPreferences, writeFinderPreferences } from '../app/jigsaw/jigsaw-finder/finder-preferences';

/** Where the app keeps what the picture list is filtered by, on the device (rule 12 of `CLAUDE.md`): a fast start, and it works when nobody plays. */
const PLAY_LIST_KEY = 'play.list';

/** how long after the last choice it is kept with the user (one choice after another is one save) */
const SAVE_PAUSE_MS = 800;

/** The question for the list: the filter, but without the user's own choices (favorites, solved) when nobody acts, since they mean nothing then. */
export const listQuestion = (filter: JigsawFilter, acting: boolean): JigsawFilter => (acting ? filter : { ...filter, favorites: undefined, solved: undefined });

/**
 * **What the picture list is filtered by**: the preferences page sets it, the list reads it, and a picture that was just made adds its categories to it. It is kept on the device at once and, when a user plays, with the user in the
 * database (`listFilter`), so it is the same on every device. Who plays decides what it is: when the app opens, the user's own is taken (a user who has none keeps what the device has); when another account is chosen, or nobody plays
 * any more, it is that user's, or everything.
 */
@Injectable({ providedIn: 'root' })
export class PlayListFilter {
  private readonly users = inject(JigsawUserService);

  /** what the list is filtered by now (everything, when nothing was chosen) */
  readonly filter = signal<JigsawFilter>(readFinderPreferences(PLAY_LIST_KEY).filter);

  /** the user has been read, and what belongs to the user is taken: ask this before reading the filter for the list */
  readonly ready: Promise<void>;

  /** whose filter this is now: undefined until the user has been read, then the id of the account (null: nobody) */
  private owner: string | null | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.ready = this.users.load().then(() => this.adopt());
    // another account is chosen, or nobody plays any more: the filter is theirs
    effect(() => {
      const id = this.users.user()?.id ?? null;
      untracked(() => {
        if (this.owner !== undefined && id !== this.owner) this.adopt();
      });
    });
  }

  /** The choice is made (on the preferences page): kept on the device at once and with the user a pause after the last one. Nothing happens when it is the filter that is there already. */
  set(filter: JigsawFilter): void {
    if (filter === this.filter()) return;
    this.filter.set(filter);
    writeFinderPreferences(PLAY_LIST_KEY, { view: 'cards', filter });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.users.saveListFilter(this.filter()), SAVE_PAUSE_MS);
  }

  /**
   * A picture was made: its categories and who sees it (`visibility`: none for a hidden one, which is on no list) are added to the filter, so the picture is not left out of the list (see `JigsawFilters.withCategories` and
   * `withVisibility`: a choice that is not made shows everything already, so nothing is added to it).
   */
  addPicture(categories: readonly string[], visibility: FilterVisibility | null): void {
    const withCategories = JigsawFilters.withCategories(this.filter(), categories);
    this.set(visibility ? JigsawFilters.withVisibility(withCategories, visibility) : withCategories);
  }

  /** Takes what belongs to whoever plays: at the start the user's own (the device's when the user has none), later the user's own or everything. */
  private adopt(): void {
    const user = this.users.user();
    const first = this.owner === undefined;
    clearTimeout(this.timer); // a choice not kept yet belonged to the one who made it
    this.owner = user?.id ?? null;
    if (user?.listFilter) this.keep(user.listFilter);
    else if (!first) this.keep(JigsawFilters.empty());
  }

  /** the filter is taken from somewhere else (the user): kept on the device, and not saved again */
  private keep(filter: JigsawFilter): void {
    this.filter.set(filter);
    writeFinderPreferences(PLAY_LIST_KEY, { view: 'cards', filter });
  }
}
