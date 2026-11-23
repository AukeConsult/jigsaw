import { clockOf } from '../duration';
import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { readPreference, writePreference } from '../../core/preferences';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AiUsageList, AiUsageService } from '../ai-usage.service';
import { ImageOf, JigsawImageService } from '../jigsaw-image.service';
import { CategoryTags } from '../category-tags/category-tags';
import { JigsawService } from '../jigsaw.service';
import { snapLevelOfJigsaw } from '../snap-level';
import { pieceGrid } from '../../models/shared/jigsaw';
import { PlaysService, UserGame } from '../plays.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawCategories } from '../../models/shared/category';
import { JigsawInput, JigsawSettings, JigsawSpec, JigsawVisibility } from '../../models/shared/jigsaw-settings';
import { JigsawSummary, SearchSort } from '../../models/shared/jigsaw-search';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawUsers, JigsawUserSpec, USERNAME_MAX, USERNAME_MIN, USER_NAME_MAX } from '../../models/shared/jigsaw-user';

/** how the list of the user's jigsaws is put in order */
export const JIGSAW_SORTS = ['new', 'old', 'name', 'pieces', 'most'] as const;
export type JigsawSort = (typeof JIGSAW_SORTS)[number];

/** the choices of the filter of the list of the user's jigsaws: all, or by who sees them */
export const VISIBILITY_FILTERS = ['all', 'everyone', 'owner', 'hidden'] as const;
export type VisibilityFilter = (typeof VISIBILITY_FILTERS)[number];

/**
 * Who plays (`/jigsaw/user`): a person makes a user (a user name and a name) or says the user name they already have. There is no password for now.
 * After that the person goes on to the page they came from (`?next=`); without one they stay here, with the user they chose.
 */
@Component({
  selector: 'app-jigsaw-user',
  imports: [FormsModule, RouterLink, DatePipe, TranslocoDirective, CategoryTags],
  providers: [provideTranslocoScope('jigsawUser'), provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-user.html',
})
export class JigsawUser implements OnInit {
  /** a time played, as a clock (`12:34`) */
  protected readonly clock = clockOf;

  protected readonly users = inject(JigsawUserService);
  private readonly plays = inject(PlaysService);
  private readonly aiUsages = inject(AiUsageService);
  private readonly images = inject(JigsawImageService);
  private readonly jigsaws = inject(JigsawService);
  private readonly router = inject(Router);
  private readonly next = inject(ActivatedRoute).snapshot.queryParamMap.get('next');

  /** start: a new person says only their name; choose: pick a user from the list (somebody who has played before); make: the whole form of a new user */
  readonly mode = signal<'start' | 'choose' | 'make'>('start');

  /** The form to make a user is opened: the language of the user starts as the language the app is shown in now (it may have been changed in the menu since the page was opened). */
  startMaking(): void {
    this.language.set(this.appLanguage.lang());
    this.error.set('');
    this.mode.set('make');
  }
  /** the users to choose from (null: not read yet) */
  readonly list = signal<JigsawUserSpec[] | null>(null);
  readonly listFailed = signal(false);
  /** what is typed to find a user in a long list (kept on the device) */
  readonly filter = signal(readPreference('jigsaw.userFilter', '', (v): v is string => typeof v === 'string'));
  readonly username = signal('');
  readonly name = signal('');
  /** an e-mail address, optional: kept so the user can be connected to a registration later */
  readonly email = signal('');
  /** the language of the user: a new user starts with the language the app is shown in */
  private readonly appLanguage = inject(LanguageService);
  readonly language = signal(this.appLanguage.lang());
  protected readonly languages = LANGUAGES;
  readonly error = signal('');
  readonly busy = signal(false);
  readonly usernameMin = USERNAME_MIN;
  readonly usernameMax = USERNAME_MAX;
  readonly nameMax = USER_NAME_MAX;

  /** the games of the user who plays, over all the jigsaws (null: not read yet) */
  readonly games = signal<UserGame[] | null>(null);
  readonly gamesFailed = signal(false);
  /** the jigsaws whose picture could not be read (an empty box is shown) */
  readonly noPicture = signal<ReadonlySet<string>>(new Set());

  /** which list is shown: the rounds played or the jigsaws made; kept for the session */
  readonly tab = signal<'rounds' | 'jigsaws' | 'ai'>(readPreference('jigsaw.userTab', 'rounds', (v): v is 'rounds' | 'jigsaws' | 'ai' => v === 'rounds' || v === 'jigsaws' || v === 'ai'));

  /** what the AI has used for the user (null: not read yet) */
  readonly aiUsage = signal<AiUsageList | null>(null);
  readonly aiFailed = signal(false);

  /** the names of the jigsaws the AI was used on (read when the list is read: the user may have more jigsaws than the page has read) */
  private readonly aiNames = signal<Readonly<Record<string, string>>>({});
  /** the name of a jigsaw in the list of what the AI was used for, else a short form of its id */
  protected jigsawName(id: string): string {
    return this.aiNames()[id] ?? this.mine()?.find((j) => j.id === id)?.name ?? id.slice(0, 6);
  }

  constructor() {
    effect(() => writePreference('jigsaw.userTab', this.tab()));
    effect(() => writePreference('jigsaw.userFilter', this.filter()));
    effect(() => writePreference('jigsaw.userVisibility', this.visibilityFilter()));
    effect(() => writePreference('jigsaw.userSort', this.sort()));
    effect(() => writePreference('jigsaw.userJigsawText', this.jigsawText()));
    // the games are read when a user plays (and again when another user is chosen)
    effect(() => {
      const me = this.users.user();
      this.games.set(null);
      this.gamesFailed.set(false);
      if (me) void this.loadGames(me.id);
    });
    // what the AI used for the user is read in the same way
    effect(() => {
      const me = this.users.user();
      this.aiUsage.set(null);
      this.aiFailed.set(false);
      if (me) void this.loadAiUsage(me.id);
    });
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
  readonly visibilityFilter = signal<VisibilityFilter>(readPreference('jigsaw.userVisibility', 'all', (v): v is VisibilityFilter => VISIBILITY_FILTERS.some((f) => f === v)));
  /** the order of the list (kept on the device) */
  readonly sort = signal<JigsawSort>(readPreference('jigsaw.userSort', 'new', (v): v is JigsawSort => JIGSAW_SORTS.some((s) => s === v)));
  protected readonly sorts = JIGSAW_SORTS;
  /** the words the names of the jigsaws are searched for (kept on the device) */
  readonly jigsawText = signal(readPreference('jigsaw.userJigsawText', '', (v): v is string => typeof v === 'string'));
  /**
   * The user can have hundreds of jigsaws, so they are read a page at a time from the server, which also finds the words, puts them in order and chooses who sees them (see
   * `JigsawSearch.mine`): this is the pages that have been read, the first when something above changes, the next when "Show more" is pressed.
   */
  private static readonly PAGE = 25;
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
    this.games.update((all) => (all ?? []).filter((g) => !gone.has(g.jigsaw.id)));
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
      const answer = await this.jigsaws.mineSearch(userId, { ...(text ? { text } : {}), sort, ...(visibility !== 'all' ? { visibility } : {}), limit: JigsawUser.PAGE, page });
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
      this.games.update((all) => (all ?? []).filter((g) => g.jigsaw.id !== item.id));
    } catch {
      this.error.set(tr('jigsawUser.jigsawNotDeleted', 'Could not delete the jigsaw: try again.'));
    }
  }

  private async loadAiUsage(userId: string): Promise<void> {
    try {
      const list = await this.aiUsages.ofUser(userId);
      const ids = [...new Set(list.items.flatMap((u) => (u.jigsawId ? [u.jigsawId] : [])))];
      const named = await Promise.all(ids.map((id) => this.jigsaws.get(id).then((j) => [id, j?.name] as const).catch(() => [id, undefined] as const)));
      if (this.users.user()?.id !== userId) return;
      this.aiNames.set(Object.fromEntries(named.flatMap(([id, name]) => (name ? [[id, name]] : []))));
      this.aiUsage.set(list);
    } catch {
      this.aiFailed.set(true);
      this.aiUsage.set({ items: [], totals: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, unbilledTokens: 0 } });
    }
  }

  private async loadGames(userId: string): Promise<void> {
    try {
      const games = await this.plays.ofUser(userId);
      if (this.users.user()?.id === userId) this.games.set(games);
    } catch {
      this.gamesFailed.set(true);
      this.games.set([]);
    }
  }

  /** the game whose Delete button was pressed and waits for "Yes" */
  readonly confirmingPlayId = signal<string | null>(null);

  /** The game is deleted for good (the jigsaw and the other games stay). */
  async removeGame(game: UserGame): Promise<void> {
    this.confirmingPlayId.set(null);
    try {
      await this.plays.remove(game.jigsaw.id, game.play.id);
      this.games.update((all) => (all ?? []).filter((g) => g.play.id !== game.play.id));
    } catch {
      this.error.set(tr('jigsawUser.couldNotDelete', 'Could not delete the round: try again.'));
    }
  }

  /** how many pieces a jigsaw is cut into, and the columns and rows they make */
  piecesOf(j: Pick<JigsawSpec, 'width' | 'height' | 'gridSize'>): { count: number; columns: number; rows: number } {
    const g = pieceGrid(j.width, j.height, j.gridSize);
    return { count: g.columns * g.rows, columns: g.columns, rows: g.rows };
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

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.users.list();
      this.list.set(list);
    } catch {
      this.list.set([]);
      this.listFailed.set(true);
    }
  }

  /** the users that fit what is typed (the name or the user name) */
  shown(): JigsawUserSpec[] {
    const text = this.filter().trim().toLowerCase();
    return (this.list() ?? []).filter((u) => !text || u.name.toLowerCase().includes(text) || u.username.includes(text));
  }

  /** A user was picked from the list: the person plays as them, and goes on. */
  async pick(user: JigsawUserSpec): Promise<void> {
    this.users.select(user);
    await this.goOn();
  }

  /**
   * The page to go on to after a user is chosen or made: the page the person was sent from (`?next=`, only a page of this module: a link from outside cannot send them
   * elsewhere). Without one the person came to this page on purpose (to choose another user, say) and stays here, with the user they chose and their rounds shown.
   */
  private async goOn(): Promise<void> {
    if (this.next && /^\/jigsaw(\/|$|\?)/.test(this.next) && !this.next.startsWith('//')) await this.router.navigateByUrl(this.next);
  }

  /** the users who already have the name that was typed (none: nobody): the person is asked which of them is them (or none) before a new user is made */
  readonly sameUsers = signal<JigsawUserSpec[]>([]);

  /**
   * A new person has said their name: when somebody already has it (what was typed is found in a name or a user name, or is the user name it would make) the person is asked, "is that you?" (a list to choose from when several have it), and chooses between playing as one of them and
   * making a new user (`force`, with digits to tell them apart). Otherwise the user is made from the name (see `JigsawUserService.createFromName`), so nobody has to think of a user name.
   */
  async startNow(force = false): Promise<void> {
    if (!force) {
      // looked for in both the names and the user names (see `JigsawUsers.matches`), and the user name the typed name would make
      const username = JigsawUsers.usernameFrom(this.name(), '');
      const same = (this.list() ?? []).filter((u) => JigsawUsers.matches(u, this.name()) || u.username === username);
      if (same.length) return this.sameUsers.set(same);
    }
    this.busy.set(true);
    this.error.set('');
    const made = await this.users.createFromName(this.name(), this.appLanguage.lang(), force);
    if (made.takenUsername) {
      // the server says somebody has the user name (the list may not have shown it): who is it? the person chooses between that user and a new one
      const owner = await this.users.lookup(made.takenUsername);
      this.busy.set(false);
      if (owner) return this.sameUsers.set([owner]);
      return this.error.set(made.error);
    }
    this.busy.set(false);
    if (made.error) return this.error.set(made.error);
    await this.refreshList();
    await this.goOn();
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.create(this.username(), this.name(), this.email(), this.language());
    this.busy.set(false);
    if (error) return this.error.set(error);
    await this.refreshList();
    await this.goOn();
  }

  /** whether the user name typed in the edit form is free ('free'), has another user ('taken') or is not looked at (''): the same, or not yet looked up, or not allowed */
  readonly usernameCheck = signal<'' | 'free' | 'taken'>('');
  private checkTimer: ReturnType<typeof setTimeout> | undefined;

  /** A user name is typed in the edit form: a moment after the last key it is looked up, so the person sees at once whether it can be had (only the server knows; it also refuses a taken name when saving). */
  onUsernameTyped(value: string): void {
    this.username.set(value);
    this.usernameCheck.set('');
    clearTimeout(this.checkTimer);
    const me = this.users.user();
    const wanted = JigsawUsers.normalised(value);
    if (!me || wanted === me.username || JigsawUsers.usernameError(wanted)) return;
    this.checkTimer = setTimeout(async () => {
      const found = await this.users.lookup(wanted);
      if (JigsawUsers.normalised(this.username()) === wanted) this.usernameCheck.set(found && found.id !== me.id ? 'taken' : 'free');
    }, 400);
  }

  /** the user who plays is being edited, and what is in the form */
  readonly editing = signal(false);
  /** an e-mail address is kept but never shown: a new one can be typed, or the one there is can be taken away */
  readonly removeEmail = signal(false);

  /** Edit is a switch: it opens the form of the user, and pressed again it closes it (what was typed is let go). */
  toggleEdit(): void {
    if (this.editing()) this.editing.set(false);
    else this.edit();
  }

  edit(): void {
    const me = this.users.user();
    if (!me) return;
    this.name.set(me.name);
    this.username.set(me.username);
    this.email.set('');
    this.language.set(me.language);
    this.removeEmail.set(false);
    this.usernameCheck.set('');
    this.error.set('');
    this.editing.set(true);
  }

  /** The changes are saved: only what differs from the user is sent. */
  async saveEdit(): Promise<void> {
    const me = this.users.user();
    if (!me) return;
    const change: { name?: string; username?: string; email?: string | null; language?: string } = {};
    if (this.name().trim() !== me.name) change.name = this.name();
    if (this.username().trim().toLowerCase() !== me.username) change.username = this.username();
    if (this.language() !== me.language) change.language = this.language();
    if (this.removeEmail()) change.email = null;
    else if (this.email().trim()) change.email = this.email();
    if (!Object.keys(change).length) return void this.editing.set(false); // nothing changed
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.update(change);
    this.busy.set(false);
    if (error) return this.error.set(error);
    this.editing.set(false);
    await this.refreshList(); // the list of the users shows the new name and user name
  }

  /** Reads the list of the users again (a user was made or changed), so the list to choose from is current. A failure leaves the list as it was. */
  private async refreshList(): Promise<void> {
    try {
      this.list.set(await this.users.list());
    } catch {
      /* the list stays as it was */
    }
  }

  /** Log out: stop playing as this user (the user stays in the database, with its rounds and jigsaws) and go to the front page; the next person starts from "What is your name?". */
  async logout(): Promise<void> {
    this.users.leave();
    this.editing.set(false);
    this.mode.set('start');
    await this.router.navigateByUrl('/');
  }

  /** Stop playing as the user who is chosen, to choose another. */
  leave(): void {
    this.users.leave();
    this.editing.set(false);
    // the list is shown (somebody who chooses another user is not new); a person who is new has the other way, "I am new here"
    this.mode.set(this.list()?.length ? 'choose' : 'start');
  }
}
