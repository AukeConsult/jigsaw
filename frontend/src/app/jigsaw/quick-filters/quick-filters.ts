import { Component, computed, inject, input, model } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawCategories } from '../../models/shared/category';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { FavoritesService } from '../favorites.service';
import { SolvedService } from '../solved.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { FRONT_FINDER_KEY, readFinderPreferences } from '../jigsaw-finder/finder-preferences';

/** The quick filters: the categories that are one press away, as they are shown beside a heading (a press looks for the jigsaws in it, and again takes it away). */
const QUICK_CATEGORIES = ['recommended'] as const;

/**
 * Quick filters for a line of the page: "All" and the categories in `QUICK_CATEGORIES` (Recommended), as small buttons, and, when something is looked for, a way to change the search (the Find page). Bind the filter of the page with `[(filter)]`: a press
 * changes what is looked for at once, to that and nothing else (what else was chosen is left aside, for now). The rules are those of `JigsawFilters`.
 */
@Component({
  selector: 'app-quick-filters',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawCategories')],
  host: { class: 'd-inline-flex' },
  templateUrl: './quick-filters.html',
})
export class QuickFilters {
  protected readonly favorites = inject(FavoritesService);
  protected readonly solved = inject(SolvedService);
  private readonly users = inject(JigsawUserService);
  readonly filter = model<JigsawFilter>(JigsawFilters.empty());
  /** the page shows something else than the jigsaws (the list of rounds): none of the quick filters looks pressed, and pressing one is a change of what is looked for */
  readonly muted = input(false);

  protected readonly categories = QUICK_CATEGORIES.map((key) => JigsawCategories.of(key)!);
  /** nothing is looked for: "All" is the one that is on */
  protected readonly all = computed(() => !this.muted() && !JigsawFilters.isOn(this.filter()));

  /** The filter is this category and nothing else: the quick filter is on (what else was looked for, in the Find page, makes none of them on). */
  protected chosen(key: string): boolean {
    const f = this.filter();
    return !this.muted() && !f.favorites && !f.solved && f.categories.length === 1 && f.categories[0] === key && !f.text.trim() && !f.kinds.length && !f.sizes.length && !f.difficulties.length && !f.languages.length && !f.owners.length;
  }

  /** The filter is the favorites and nothing else. */
  protected readonly favoritesOn = computed(() => {
    const f = this.filter();
    return !this.muted() && f.favorites === true && !f.solved && !f.categories.length && !f.text.trim() && !f.kinds.length && !f.sizes.length && !f.difficulties.length && !f.languages.length && !f.owners.length;
  });

  /** The button for the favorites is there when the user has some (and while it is on, so it can be taken off). */
  protected readonly showFavorites = computed(() => !!this.users.acting() && (this.favorites.ids().size > 0 || this.favoritesOn())); // favorites are the user's own: none to show with no account

  /** The filter is the solved jigsaws and nothing else. */
  protected readonly solvedOn = computed(() => {
    const f = this.filter();
    return !this.muted() && f.solved === true && !f.favorites && !f.categories.length && !f.text.trim() && !f.kinds.length && !f.sizes.length && !f.difficulties.length && !f.languages.length && !f.owners.length;
  });

  /** The button for the solved jigsaws is there when the user has solved some (and while it is on, so it can be taken off). */
  protected readonly showSolved = computed(() => !!this.users.acting() && (this.solved.ids().size > 0 || this.solvedOn()));

  /** Looks only at the jigsaws the user has solved, or, when that is on, back at the user's own search (all the jigsaws when there is none); for now, like the other quick filters. */
  protected toggleSolved(): void {
    this.filter.set(this.solvedOn() ? this.backFromQuick() : { ...JigsawFilters.empty(), solved: true });
  }

  /** Looks only at the jigsaws the user has ticked with a heart, or, when that is on, back at the user's own search (all the jigsaws when there is none); for now, like the other quick filters. */
  protected toggleFavorites(): void {
    this.filter.set(this.favoritesOn() ? this.backFromQuick() : { ...JigsawFilters.empty(), favorites: true });
  }

  /**
   * "All" is on and off: pressed when it is off, every jigsaw is shown; pressed when it is on, the search the user made on the Find page (kept on the device) is looked for again.
   * When there is no such search, all is all there is, and it stays on.
   */
  protected showAll(): void {
    this.filter.set(this.all() ? this.backFromQuick() : JigsawFilters.empty());
  }

  /** What is looked for when a quick filter is taken off: the search the user made on the Find page, when there is one that is not the filter that is on now; else every jigsaw. */
  private backFromQuick(): JigsawFilter {
    const saved = readFinderPreferences(FRONT_FINDER_KEY).filter;
    return JigsawFilters.isOn(saved) && JSON.stringify(saved) !== JSON.stringify(this.filter()) ? saved : JigsawFilters.empty();
  }

  /** Looks only at this category, or, when it is the one that is on, back at the user's own search (all the jigsaws when there is none). It is for now: what the user looked for on the Find page is not changed (the finder does not keep it). */
  protected toggle(key: string): void {
    this.filter.set(this.chosen(key) ? this.backFromQuick() : { ...JigsawFilters.empty(), categories: [key] });
  }
}
