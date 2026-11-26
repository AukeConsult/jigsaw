import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { preferenceSignal } from '../../core/preferences';
import { pieceGrid } from '../../models/shared/jigsaw';
import { JigsawKinds } from '../../models/shared/jigsaw-kind';
import { JigsawCategories } from '../../models/shared/category';
import { JigsawInput, JigsawSettings, JigsawSpec, JigsawVisibility } from '../../models/shared/jigsaw-settings';
import { JigsawSummary, SearchSort } from '../../models/shared/jigsaw-search';
import { CategoryTags } from '../category-tags/category-tags';
import { ImageOf, JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { snapLevelOfJigsaw } from '../snap-level';

/** how the list of the user's jigsaws is put in order */
export const JIGSAW_SORTS = ['new', 'old', 'name', 'pieces', 'most'] as const;
export type JigsawSort = (typeof JIGSAW_SORTS)[number];

/** the choices of the filter of the list of the user's jigsaws: all, or by who sees them */
export const VISIBILITY_FILTERS = ['all', 'everyone', 'owner', 'hidden'] as const;
export type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

/**
 * **The list of the jigsaws (pictures) the user made**, the one list for the website's page of the user and for the app: the two ways to add one, the words to find them by, the order, the filter (all, public, private, hidden, each with
 * how many), ticking some to change who sees them or delete them together, and a row for each, with who sees it chosen in the row, Recommended, Edit and Delete, a page at a time. What is chosen is kept on the device. With `inApp` it
 * is the list of the app, which has no pages of the website to go to: no adding here (the app has its own) and no link to the edit page, and a row opens the page of the picture in the app (the same page as Add picture, to change it, with its rounds). When jigsaws are deleted it says so (`deleted`, their ids), so the page can leave
 * out their rounds too.
 */
@Component({
  selector: 'app-my-jigsaws',
  imports: [FormsModule, RouterLink, TranslocoDirective, CategoryTags],
  providers: [provideTranslocoScope('jigsawUser'), provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './my-jigsaws.html',
})
export class MyJigsaws {
  protected readonly users = inject(JigsawUserService);
  private readonly images = inject(JigsawImageService);
  private readonly jigsaws = inject(JigsawService);

  /** the list of the app: no adding, no links to the pages of the website */
  readonly inApp = input(false);
  /** jigsaws were deleted for good: their ids */
  readonly deleted = output<ReadonlySet<string>>();

  /** something went wrong (said above the list) */
  protected readonly error = signal('');
  /** the jigsaws whose picture could not be read (an empty box is shown) */
  protected readonly noPicture = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // the words are used a moment after the last key, so the list is not asked for at every key
    effect((onCleanup) => {
      const text = this.jigsawText();
      const timer = setTimeout(() => this.appliedText.set(text), 300);
      onCleanup(() => clearTimeout(timer));
    });
    // the jigsaws the user made are read a page at a time, from the first page again when who plays, the words, the order or who sees them changes
    effect(() => {
      const me = this.users.user();
      this.appliedText();
      this.sort();
      this.visibilityFilter();
      untracked(() => {
        if (me?.id !== this.mineFor) {
          this.mineFor = me?.id ?? '';
          this.mine.set(null);
          this.hasJigsaws.set(null);
        }
        if (me) void this.loadMine(me.id, 1);
      });
    });
  }

  private mineFor = '';

  /** the jigsaws the user who plays has made (null: not read yet) */
  readonly mine = signal<JigsawSummary[] | null>(null);
  /** the jigsaw whose Delete was pressed and waits for "Yes" */
  readonly confirmingJigsawId = signal<string | null>(null);

  /** the jigsaws that are ticked in the list, to be deleted together */
  readonly selected = signal<ReadonlySet<string>>(new Set());
  /** which jigsaws the list shows: all, or the public, the private or the hidden ones (kept on the device) */
  readonly visibilityFilter = preferenceSignal<VisibilityFilter>('jigsaw.userVisibility', 'all', (v): v is VisibilityFilter => VISIBILITY_FILTERS.some((f) => f === v));
  /** the order of the list (kept on the device) */
  readonly sort = preferenceSignal<JigsawSort>('jigsaw.userSort', 'new', (v): v is JigsawSort => JIGSAW_SORTS.some((s) => s === v));
  protected readonly sorts = JIGSAW_SORTS;
  /** the words the names of the jigsaws are searched for (kept on the device) */
  readonly jigsawText = preferenceSignal('jigsaw.userJigsawText', '', (v): v is string => typeof v === 'string');
  /**
   * The user can have hundreds of jigsaws, so they are read a page at a time from the server, which also finds the words, puts them in order and chooses who sees them (see
   * `JigsawSearch.mine`): this is the pages that have been read, the first when something above changes, the next when "Show more" is pressed.
   */
  static readonly PAGE = 25;
  private minePage = 1;
  private mineTicket = 0;
  /** the words, after a short pause in typing */
  private readonly appliedText = signal(this.jigsawText());
  /** how many jigsaws match in all, whether there are more pages, and whether a page is being read */
  readonly mineTotal = signal(0);
  readonly mineHasMore = signal(false);
  readonly mineLoading = signal(false);
  /** the jigsaws could not be read (this is said, and it is not said that there are none) */
  readonly mineFailed = signal(false);
  /** the user has made jigsaws at all, whatever is searched for (null: not known yet) */
  readonly hasJigsaws = signal<boolean | null>(null);
  /** the jigsaws the list shows now */
  readonly shownJigsaws = computed(() => this.mine() ?? []);
  /** how many jigsaws each choice of who sees them gives, with the words kept */
  readonly visibilityCounts = signal<Record<VisibilityFilter, number>>({ all: 0, everyone: 0, owner: 0, hidden: 0 });
  /** all the jigsaws of the list are ticked */
  readonly allSelected = computed(() => !!this.shownJigsaws().length && this.shownJigsaws().every((j) => this.selected().has(j.id)));
  /** some, not all, are ticked (the box that ticks them all is then half) */
  readonly someSelected = computed(() => this.selected().size > 0 && !this.allSelected());
  /** "Delete the ticked jigsaws" was pressed and waits for "Yes" */
  readonly confirmingSelected = signal(false);
  readonly deletingSelected = signal(false);
  /** who sees the ticked jigsaws is being changed */
  readonly changingVisibility = signal(false);
  /** how many jigsaws had their visibility changed by the last choice (0: none shown) */
  readonly visibilityChanged = signal(0);

  /** the three choices of who sees a jigsaw, as the radio buttons of a row show them */
  protected readonly visibilityChoices: readonly { value: JigsawVisibility; icon: string; label: string; english: string }[] = [
    { value: 'everyone', icon: 'bi-eye', label: 'jigsawUser.visibilityEveryone', english: 'Public' },
    { value: 'owner', icon: 'bi-lock', label: 'jigsawUser.visibilityOwner', english: 'Private' },
    { value: 'hidden', icon: 'bi-eye-slash', label: 'jigsawUser.visibilityHidden', english: 'Hidden' },
  ];
  /** the jigsaw whose visibility is being saved (its radio buttons wait) */
  protected readonly changingVisibilityId = signal<string | null>(null);
  /** counted up when a change could not be saved: the rows are drawn again, so the radio button that was pressed goes back to what is saved */
  protected readonly visRev = signal(0);

  /** Who sees this one jigsaw is changed with its radio buttons, saved at once (a save replaces the whole document, so it is sent as it is with the new visibility). Only its owner can. */
  protected async setVisibility(j: JigsawSummary, visibility: JigsawVisibility): Promise<void> {
    const before = j.visibility ?? 'everyone';
    if (before === visibility) return;
    this.changingVisibilityId.set(j.id);
    this.error.set('');
    try {
      const saved = await this.changed(j.id, { visibility: visibility === 'everyone' ? undefined : visibility });
      // the counts move with it, and when a choice of who sees them is made, the jigsaw leaves the list if it is not what is chosen any more
      this.visibilityCounts.update((c) => ({ ...c, [before]: c[before] - 1, [visibility]: c[visibility] + 1 }));
      if (this.visibilityFilter() !== 'all' && this.visibilityFilter() !== visibility) this.dropLocal(new Set([j.id]), false);
      else this.mine.update((all) => (all ?? []).map((x) => (x.id === j.id ? saved : x)));
    } catch {
      this.visRev.update((n) => n + 1);
      this.error.set(tr('jigsawUser.someNotChanged', 'Could not change {{ count }} of the jigsaws: try again.', { count: 1 }));
    } finally {
      this.changingVisibilityId.set(null);
    }
  }

  /**
   * The whole jigsaw with this change, saved (the list has only what a list needs, and a save replaces the whole document, so the jigsaw is read first). What is given back is what the
   * list keeps: the jigsaw without its objects.
   */
  private async changed(id: string, change: Partial<JigsawInput>): Promise<JigsawSummary> {
    const full = await this.jigsaws.get(id);
    if (!full) throw new Error('The jigsaw is not there.');
    const saved = await this.jigsaws.update(id, new JigsawSettings({ ...full, ...change }).stored());
    const { placed: _placed, ...summary } = saved;
    return summary;
  }

  /** Takes jigsaws out of the list and the counts (they are deleted, or no longer what is chosen); `deleted` also takes them out of the counts, which a change of who sees them has moved already. */
  private dropLocal(gone: ReadonlySet<string>, deleted: boolean): void {
    const dropped = (this.mine() ?? []).filter((j) => gone.has(j.id));
    this.mine.update((all) => (all ?? []).filter((j) => !gone.has(j.id)));
    this.mineTotal.update((n) => Math.max(0, n - dropped.length));
    if (deleted) {
      this.visibilityCounts.update((c) => {
        const next = { ...c };
        for (const j of dropped) {
          next.all--;
          next[j.visibility ?? 'everyone']--;
        }
        return next;
      });
      if (!this.appliedText().trim() && this.visibilityCounts().all <= 0) this.hasJigsaws.set(false);
    }
  }

  /** a jigsaw is in the category Recommended */
  isRecommended(j: Pick<JigsawSpec, 'categories'>): boolean {
    return JigsawCategories.isChosen(j.categories ?? [], 'recommended');
  }

  /** One click on the star of a row puts the jigsaw in the category Recommended, or takes it out (a jigsaw is in at most three categories: when they are full it says so). */
  async toggleRecommended(j: JigsawSummary): Promise<void> {
    const categories = JigsawCategories.toggled(j.categories ?? [], 'recommended');
    if (categories.length === (j.categories ?? []).length && !this.isRecommended(j)) {
      this.error.set(tr('jigsawUser.categoriesFull', 'A jigsaw is in at most three categories: take one away first.'));
      return;
    }
    this.error.set('');
    try {
      const saved = await this.changed(j.id, { categories });
      this.mine.update((all) => (all ?? []).map((x) => (x.id === saved.id ? saved : x)));
    } catch {
      this.error.set(tr('jigsawUser.couldNotRecommend', 'Could not change the jigsaw: only its owner can.'));
    }
  }

  /** Another choice in the filter: what was ticked is let go, so nothing that is out of sight is deleted or changed. */
  chooseVisibility(filter: VisibilityFilter): void {
    this.visibilityFilter.set(filter);
    this.confirmingSelected.set(false);
    this.selected.set(new Set());
  }

  toggleSelected(id: string): void {
    this.confirmingSelected.set(false);
    this.visibilityChanged.set(0);
    this.selected.update((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  /** Ticks every jigsaw of the list, or none when every one is ticked. */
  toggleAllSelected(): void {
    this.confirmingSelected.set(false);
    this.visibilityChanged.set(0);
    this.selected.set(this.allSelected() ? new Set() : new Set(this.shownJigsaws().map((j) => j.id)));
  }

  /** Who sees the ticked jigsaws is changed, all at once (only their owner can; a save replaces the whole document, so each is sent as it is with the new visibility). The ones that could not be changed say how many. */
  async setVisibilitySelected(visibility: JigsawVisibility): Promise<void> {
    const mine = this.mine() ?? [];
    const chosen = mine.filter((j) => this.selected().has(j.id));
    if (!chosen.length) return;
    this.changingVisibility.set(true);
    this.visibilityChanged.set(0);
    this.error.set('');
    const results = await Promise.allSettled(chosen.map((j) => this.changed(j.id, { visibility: visibility === 'everyone' ? undefined : visibility }))); // at the same time
    const changed = new Set(chosen.filter((_, i) => results[i].status === 'fulfilled').map((j) => j.id));
    this.visibilityChanged.set(changed.size);
    // the ticks of what was changed are let go, and the list is read again, so it is as the server has it (and the filter, which may have a changed jigsaw leave, is applied)
    this.selected.update((now) => new Set([...now].filter((id) => !changed.has(id))));
    const me = this.users.user();
    if (me) await this.loadMine(me.id, 1);
    this.changingVisibility.set(false);
    const failed = chosen.length - changed.size;
    if (failed) this.error.set(tr('jigsawUser.someNotChanged', 'Could not change {{ count }} of the jigsaws: try again.', { count: failed }));
  }

  /** The ticked jigsaws are deleted for good, all at once, with their pictures and all their rounds (only their owner can). The ones that could not be deleted stay ticked, and it is said how many. */
  async removeSelected(): Promise<void> {
    const me = this.users.user();
    this.confirmingSelected.set(false);
    const ids = [...this.selected()];
    if (!me || !ids.length) return;
    this.deletingSelected.set(true);
    this.error.set('');
    const results = await Promise.allSettled(ids.map((id) => this.jigsaws.removeAs(id, me.id))); // at the same time
    const gone = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
    this.dropLocal(gone, true);
    this.deleted.emit(gone);
    this.selected.update((now) => new Set([...now].filter((id) => !gone.has(id))));
    this.deletingSelected.set(false);
    const failed = ids.length - gone.size;
    if (failed) this.error.set(tr('jigsawUser.someNotDeleted', 'Could not delete {{ count }} of the jigsaws: try again.', { count: failed }));
  }

  /** Reads a page of the jigsaws of the user (the first one again when something that decides what is in the list changed); only the answer to the last question is used. */
  private async loadMine(userId: string, page: number): Promise<void> {
    const ticket = ++this.mineTicket;
    this.mineLoading.set(true);
    const text = this.appliedText().trim();
    const visibility = this.visibilityFilter();
    const sort: SearchSort = this.sort(); // the order has the names the server knows
    try {
      const answer = await this.jigsaws.mineSearch(userId, { ...(text ? { text } : {}), sort, ...(visibility !== 'all' ? { visibility } : {}), limit: MyJigsaws.PAGE, page });
      if (ticket !== this.mineTicket || this.users.user()?.id !== userId) return;
      this.minePage = page;
      this.mineFailed.set(false);
      this.mine.update((now) => (page === 1 ? answer.items : [...(now ?? []), ...answer.items]));
      this.mineTotal.set(answer.total);
      this.mineHasMore.set(answer.hasMore);
      this.visibilityCounts.set(answer.counts);
      if (!text) this.hasJigsaws.set(answer.counts.all > 0);
    } catch {
      if (ticket !== this.mineTicket) return;
      if (page === 1) this.mine.set([]);
      this.mineFailed.set(true);
    } finally {
      if (ticket === this.mineTicket) this.mineLoading.set(false);
    }
  }

  /** The next page of the jigsaws is added to the list. */
  moreMine(): void {
    const me = this.users.user();
    if (me && this.mineHasMore() && !this.mineLoading()) void this.loadMine(me.id, this.minePage + 1);
  }

  /** The jigsaw is deleted for good, with its picture and all its rounds (only its owner can). */
  async removeJigsaw(item: JigsawSummary): Promise<void> {
    const me = this.users.user();
    this.confirmingJigsawId.set(null);
    if (!me) return;
    try {
      await this.jigsaws.removeAs(item.id, me.id);
      this.dropLocal(new Set([item.id]), true);
      this.deleted.emit(new Set([item.id]));
    } catch {
      this.error.set(tr('jigsawUser.jigsawNotDeleted', 'Could not delete the jigsaw: try again.'));
    }
  }

  /** how many pieces a jigsaw is cut into, and the columns and rows they make */
  piecesOf(j: Pick<JigsawSpec, 'width' | 'height' | 'gridSize'>): { count: number; columns: number; rows: number } {
    const g = pieceGrid(j.width, j.height, j.gridSize);
    return { count: g.columns * g.rows, columns: g.columns, rows: g.rows };
  }

  /** Where a row opens: the page of the jigsaw in the website; in the app the page of the picture, the same page as Add picture, where it is changed and its rounds are. */
  protected link(item: Pick<JigsawSpec, 'id'>): string[] {
    return this.inApp() ? ['/play/mine/picture', item.id] : ['/jigsaw', item.id];
  }

  /** the entry is only a picture: it is cut in each round */
  isPicture(j: Pick<JigsawSpec, 'kind'>): boolean {
    return JigsawKinds.isPicture(j);
  }

  /** the difficulty of a jigsaw (hard, medium or easy) */
  levelOf(j: Pick<JigsawSpec, 'snapPercent'>): string {
    return snapLevelOfJigsaw(j);
  }

  pictureUrl(jigsaw: ImageOf): string {
    return this.images.url(jigsaw, 1);
  }

  lacksPicture(jigsawId: string): void {
    this.noPicture.update((now) => new Set([...now, jigsawId]));
  }
}
