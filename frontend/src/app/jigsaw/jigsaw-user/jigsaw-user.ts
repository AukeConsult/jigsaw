import { clockOf } from '../duration';
import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { readPreference, writePreference } from '../../core/preferences';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AiUsageList, AiUsageService } from '../ai-usage.service';
import { JigsawImageService } from '../jigsaw-image.service';
import { CategoryTags } from '../category-tags/category-tags';
import { JigsawService } from '../jigsaw.service';
import { snapLevelOfJigsaw } from '../snap-level';
import { pieceGrid } from '../../models/shared/jigsaw';
import { PlaysService, UserGame } from '../plays.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawCategories } from '../../models/shared/category';
import { JigsawSettings, JigsawSpec, JigsawVisibility } from '../../models/shared/jigsaw-settings';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawUserSpec, USERNAME_MAX, USERNAME_MIN, USER_NAME_MAX } from '../../models/shared/jigsaw-user';

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

  /** choose: pick a user from the list, make: make a new user */
  readonly mode = signal<'choose' | 'make'>('choose');

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

  /** the name of a jigsaw of the user (the ones the user made are known), else a short form of its id */
  protected jigsawName(id: string): string {
    return this.mine()?.find((j) => j.id === id)?.name ?? id.slice(0, 6);
  }

  constructor() {
    effect(() => writePreference('jigsaw.userTab', this.tab()));
    effect(() => writePreference('jigsaw.userFilter', this.filter()));
    effect(() => writePreference('jigsaw.userVisibility', this.visibilityFilter()));
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
    // the jigsaws the user made are read in the same way
    effect(() => {
      const me = this.users.user();
      this.mine.set(null);
      if (me) void this.loadMine(me.id);
    });
  }

  /** the jigsaws the user who plays has made (null: not read yet) */
  readonly mine = signal<JigsawSpec[] | null>(null);
  /** the jigsaw whose Delete was pressed and waits for "Yes" */
  readonly confirmingJigsawId = signal<string | null>(null);

  /** the jigsaws that are ticked in the list, to be deleted together */
  readonly selected = signal<ReadonlySet<string>>(new Set());
  /** which jigsaws the list shows: all, or the public, the private or the hidden ones (kept on the device) */
  readonly visibilityFilter = signal<VisibilityFilter>(readPreference('jigsaw.userVisibility', 'all', (v): v is VisibilityFilter => VISIBILITY_FILTERS.some((f) => f === v)));
  /** the jigsaws the list shows now */
  readonly shownJigsaws = computed(() => (this.mine() ?? []).filter((j) => this.visibilityFilter() === 'all' || (j.visibility ?? 'everyone') === this.visibilityFilter()));
  /** how many jigsaws each choice of the filter gives */
  readonly visibilityCounts = computed(() => {
    const counts: Record<VisibilityFilter, number> = { all: 0, everyone: 0, owner: 0, hidden: 0 };
    for (const j of this.mine() ?? []) {
      counts.all++;
      counts[j.visibility ?? 'everyone']++;
    }
    return counts;
  });
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

  /** a jigsaw is in the category Recommended */
  isRecommended(j: JigsawSpec): boolean {
    return JigsawCategories.isChosen(j.categories ?? [], 'recommended');
  }

  /** One click on the star of a row puts the jigsaw in the category Recommended, or takes it out (a jigsaw is in at most three categories: when they are full it says so). */
  async toggleRecommended(j: JigsawSpec): Promise<void> {
    const categories = JigsawCategories.toggled(j.categories ?? [], 'recommended');
    if (categories.length === (j.categories ?? []).length && !this.isRecommended(j)) {
      this.error.set(tr('jigsawUser.categoriesFull', 'A jigsaw is in at most three categories: take one away first.'));
      return;
    }
    this.error.set('');
    try {
      const saved = await this.jigsaws.update(j.id, new JigsawSettings({ ...j, categories }).stored());
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
    const results = await Promise.allSettled(
      chosen.map((j) => this.jigsaws.update(j.id, new JigsawSettings({ ...j, visibility: visibility === 'everyone' ? undefined : visibility }).stored())), // at the same time
    );
    const changed = new Map(chosen.flatMap((j, i) => (results[i].status === 'fulfilled' ? [[j.id, (results[i] as PromiseFulfilledResult<JigsawSpec>).value] as const] : [])));
    this.mine.update((all) => (all ?? []).map((j) => changed.get(j.id) ?? j));
    this.visibilityChanged.set(changed.size);
    // the ticks of what was changed are let go, and the list is read again, so it is as the server has it (and the filter, which may have a changed jigsaw leave, is applied)
    this.selected.update((now) => new Set([...now].filter((id) => !changed.has(id))));
    const me = this.users.user();
    if (me) await this.loadMine(me.id);
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
    this.mine.update((all) => (all ?? []).filter((j) => !gone.has(j.id)));
    this.games.update((all) => (all ?? []).filter((g) => !gone.has(g.jigsaw.id)));
    this.selected.update((now) => new Set([...now].filter((id) => !gone.has(id))));
    this.deletingSelected.set(false);
    const failed = ids.length - gone.size;
    if (failed) this.error.set(tr('jigsawUser.someNotDeleted', 'Could not delete {{ count }} of the jigsaws: try again.', { count: failed }));
  }

  private async loadMine(userId: string): Promise<void> {
    try {
      const all = await this.jigsaws.list();
      if (this.users.user()?.id === userId) this.mine.set(all.filter((j) => j.ownerUid === userId));
    } catch {
      this.mine.set([]);
    }
  }

  /** The jigsaw is deleted for good, with its picture and all its rounds (only its owner can). */
  async removeJigsaw(item: JigsawSpec): Promise<void> {
    const me = this.users.user();
    this.confirmingJigsawId.set(null);
    if (!me) return;
    try {
      await this.jigsaws.removeAs(item.id, me.id);
      this.mine.update((all) => (all ?? []).filter((j) => j.id !== item.id));
      this.games.update((all) => (all ?? []).filter((g) => g.jigsaw.id !== item.id));
    } catch {
      this.error.set(tr('jigsawUser.jigsawNotDeleted', 'Could not delete the jigsaw: try again.'));
    }
  }

  private async loadAiUsage(userId: string): Promise<void> {
    try {
      const list = await this.aiUsages.ofUser(userId);
      if (this.users.user()?.id === userId) this.aiUsage.set(list);
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
  piecesOf(j: JigsawSpec): { count: number; columns: number; rows: number } {
    const g = pieceGrid(j.width, j.height, j.gridSize);
    return { count: g.columns * g.rows, columns: g.columns, rows: g.rows };
  }

  /** the difficulty of a jigsaw (hard, medium or easy) */
  levelOf(j: JigsawSpec): string {
    return snapLevelOfJigsaw(j);
  }

  pictureUrl(jigsawId: string): string {
    return this.images.url(jigsawId, 1);
  }

  lacksPicture(jigsawId: string): void {
    this.noPicture.update((now) => new Set([...now, jigsawId]));
  }

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.users.list();
      this.list.set(list);
      if (!list.length) this.mode.set('make'); // nobody to choose from yet
    } catch {
      this.list.set([]);
      this.listFailed.set(true);
      this.mode.set('make');
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

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.create(this.username(), this.name(), this.email(), this.language());
    this.busy.set(false);
    if (error) return this.error.set(error);
    await this.goOn();
  }

  /** the user who plays is being edited, and what is in the form */
  readonly editing = signal(false);
  /** an e-mail address is kept but never shown: a new one can be typed, or the one there is can be taken away */
  readonly removeEmail = signal(false);

  edit(): void {
    const me = this.users.user();
    if (!me) return;
    this.name.set(me.name);
    this.username.set(me.username);
    this.email.set('');
    this.language.set(me.language);
    this.removeEmail.set(false);
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
  }

  /** Stop playing as the user who is chosen, to choose another. */
  leave(): void {
    this.users.leave();
  }
}
