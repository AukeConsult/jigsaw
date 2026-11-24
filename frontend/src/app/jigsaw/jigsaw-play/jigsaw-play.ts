import { Component, DestroyRef, ElementRef, HostListener, OnDestroy, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr, translationsLoaded } from '../../core/i18n';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Autosave } from '../../core/autosave';
import { isWideScreen, onAnyScroll } from '../../core/theme';
import { JigsawBoard } from '../../board/jigsaw-board/jigsaw-board';
import { LINE_LEVELS, lineLevelOf } from '../line-level';
import { SNAP_LEVELS, snapLevelOf } from '../snap-level';
import { JigsawHelper } from '../jigsaw-helper';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { PieceSync, PieceSyncApi } from '../piece-sync';
import { clockOf } from '../duration';
import { PlaysService } from '../plays.service';
import { JigsawSettings, JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawKinds } from '../../models/shared/jigsaw-kind';
import { JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';
import { PlacedObject } from '../../models/shared/placed';
import { PlayOverrides, PlaySpec } from '../../models/shared/play';

/**
 * Playing one game of a jigsaw (`/jigsaw/:id/play/:playId`): the pieces in their store beside the picture, the sidebar with how far the game has come, and the
 * helper banner. The jigsaw (picture, size, pieces) is fixed; the game holds where the pieces are (`PieceSync` keeps that in the database) and the few things a
 * player may choose for themselves: the difficulty and the look (the line, the colours). Those are saved with the game, not with the jigsaw.
 */
@Component({
  selector: 'app-jigsaw-play',
  imports: [FormsModule, RouterLink, JigsawBoard, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-play.html',
})
export class JigsawPlay implements OnDestroy {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly element = inject(ElementRef<HTMLElement>);
  /** the jigsaw and the game that are open (they change when another game is opened from here) */
  jigsawId = '';
  playId = '';

  /** loading: being read, ready, missing: there is no such jigsaw or game, failed: it could not be read */
  readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  /** the jigsaw (its store is as wide as this game has made it) and the game */
  readonly item = signal<JigsawSpec | null>(null);
  readonly play = signal<PlaySpec | null>(null);
  /** the round is another player's: it can be looked at, never changed */
  readonly viewOnly = computed(() => {
    const play = this.play();
    const me = this.users.user();
    return !!play && play.userId !== me?.id;
  });
  /** the pieces (and anything else that is placed) on the board, as this round has them */
  readonly placed = signal<PlacedObject[]>([]);
  /** the address of the picture (null: none) */
  readonly picture = signal<string | null>(null);
  readonly message = signal<{ kind: 'success' | 'danger'; text: string } | null>(null);
  /** the top menu: its Sidebar switch opens the folded sidebar of a narrow screen */
  protected readonly tools = inject(JigsawHelper);
  /** the cheat is on (the Cheat switch): the numbers of the grid points and of the pieces are shown, to help find the pieces */
  readonly debug = signal(false);
  /** New game was pressed: the person is asked to approve before another game is started */
  readonly confirmingStartOver = signal(false);
  /** Delete game was pressed: the person is asked to approve before the game is deleted */
  readonly confirmingDelete = signal(false);

  /** the difficulty, the jigsaw's own (not a choice of a round): how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never) */
  readonly snapPercent = signal(JigsawSettings.DEFAULT_SNAP_PERCENT);
  /** the line round each piece: how thick in pixels, and what colour (#rrggbb), and the background colour of the picture area */
  readonly lineWidth = signal(JigsawSettings.DEFAULT_LINE_WIDTH);
  readonly lineColor = signal(JigsawSettings.DEFAULT_LINE_COLOR);
  readonly backColor = signal(JigsawSettings.DEFAULT_BACK_COLOR);
  /** what this game has chosen for itself (the rest is the jigsaw's): only this is sent when it is saved */
  private readonly own = signal<PlayOverrides>({});
  /** the thicknesses of the line to choose from, in words, and the one the line is closest to */
  readonly lineLevels = LINE_LEVELS;
  readonly lineLevel = computed(() => lineLevelOf(this.lineWidth()));
  /** the difficulty in words (it is shown, not chosen: it belongs to the jigsaw) */
  private readonly loadedTick = translationsLoaded();
  readonly levelLabel = computed(() => {
    this.loadedTick(); // made again when the language file arrives
    const level = SNAP_LEVELS.find((l) => l.key === snapLevelOf(this.snapPercent()));
    return level ? tr('jigsawLevels.snap.' + level.key, level.label) : '';
  });

  chooseLine(width: number): void {
    if (this.viewOnly()) return;
    this.lineWidth.set(width);
    this.own.update((o) => ({ ...o, lineWidth: width }));
  }

  chooseLineColor(color: string): void {
    if (this.viewOnly()) return;
    this.lineColor.set(color);
    this.own.update((o) => ({ ...o, lineColor: color }));
  }

  chooseBackColor(color: string): void {
    if (this.viewOnly()) return;
    this.backColor.set(color);
    this.own.update((o) => ({ ...o, backColor: color }));
  }

  readonly width = computed(() => this.item()?.width ?? 0);
  readonly height = computed(() => this.item()?.height ?? 0);
  readonly gridSize = computed(() => this.item()?.gridSize ?? 0);
  readonly snapRangePx = computed(() => JigsawSettings.snapRangePx(this.snapPercent(), this.gridSize()));
  /** how many pieces the grid makes across and down */
  readonly pieceInfo = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** the pieces on the board as the database has them */
  private readonly pieces = computed(() => this.placed().flatMap((p) => JigsawPieces.of(p, this.pieceInfo().columns) ?? []));
  /** how many pieces are matched (on their own place) of how many there are: the state of the game */
  readonly matched = computed(() => {
    const pieces = this.pieces();
    return { count: pieces.filter((p) => JigsawPieces.matched(p)).length, total: pieces.length };
  });

  /** the height of the sidebar in pixels: from where the page starts (under the top menu) to the bottom of the window */
  readonly sidebarHeight = signal<number | null>(null);

  /** where the moves of pieces are saved: the positions of this game */
  private readonly syncApi: PieceSyncApi = {
    replace: () => Promise.reject(new Error('The pieces of a jigsaw are cut when the jigsaw is made.')),
    move: (playId, moves) => this.plays.move(this.jigsawId, playId, moves),
    moveWhileLeaving: (playId, moves) => this.plays.moveWhileLeaving(this.jigsawId, playId, moves),
  };

  /** keeps where the pieces are in the database, a pause after the last move (the id it works with is the game's) */
  readonly pieceSync = new PieceSync({ jigsawId: () => (this.viewOnly() ? null : this.playId || null), pieces: () => this.pieces(), api: this.syncApi }); // another player's round is never saved from here (no id: nothing is sent)

  /** what the game chooses for itself is saved with the game, a pause after the last change */
  private readonly autosave = new Autosave<PlayOverrides, { id: string }>({
    input: () => this.own(),
    invalid: () => (this.play() ? '' : 'loading'),
    create: () => Promise.reject(new Error('A game is started from the page of the jigsaw.')),
    update: async (playId, input) => {
      const saved = await this.plays.saveSettings(this.jigsawId, playId, input);
      return { id: saved.play.id };
    },
    saved: () => undefined,
  });
  readonly saveState = this.autosave.state;

  /** how long the round has been played, in milliseconds: counted while the round is open on the screen (the page is shown), it is the user's own and it is not solved */
  readonly elapsedMs = signal(0);
  readonly clock = computed(() => clockOf(this.elapsedMs()));
  /** the time the database has, and when the clock was last read (performance.now(); 0: the clock is not running) */
  private timeSaved = 0;
  private lastTick = 0;
  private clockTimer: ReturnType<typeof setInterval> | undefined;
  /** the clock runs: the round is ready, is the user's own, is not solved, and the page is on the screen */
  private clockRuns(): boolean {
    const m = this.matched();
    return this.status() === 'ready' && !!this.play() && this.item()?.timed !== false && !this.viewOnly() && !(m.total > 0 && m.count === m.total) && document.visibilityState === 'visible';
  }

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.measureSidebar());
    onAnyScroll(this.destroyRef, () => this.measureSidebar());
    this.clockTimer = setInterval(() => this.tickClock(), 1000);
    effect(() => this.tools.clock.set(this.status() === 'ready' && this.item()?.timed !== false ? this.clock() : null)); // the menu at the top shows it
    effect(() => this.tools.viewing.set(this.status() === 'ready' && this.viewOnly() ? this.play()?.userName || tr('jigsawPlay.anotherPlayer', 'another player') : null)); // the menu at the top says whose round it is
    // another game can be opened from this page (a new game): the page is the same, the ids change
    this.route.paramMap.subscribe((params) => {
      this.pieceSync.leaving(); // what waits to be saved goes to the game that is left
      this.saveTimeNow(); // and so does the time
      this.jigsawId = params.get('id') ?? '';
      this.playId = params.get('playId') ?? '';
      this.tools.open(this.jigsawId); // the switches of the helper are as they were left on this jigsaw
      void this.load();
    });
  }

  /** Reads the jigsaw, the game with its pieces, and the picture: the game is as the person left it. */
  private async load(): Promise<void> {
    this.status.set('loading');
    this.confirmingStartOver.set(false);
    this.confirmingDelete.set(false);
    this.message.set(null);
    this.placed.set([]);
    this.pieceSync.markSaved([]);
    try {
      const jigsaw = await this.service.get(this.jigsawId);
      if (!jigsaw) return this.status.set('missing');
      const detail = await this.plays.get(this.jigsawId, this.playId).catch((err) => (err?.status === 404 ? null : Promise.reject(err)));
      if (!detail) return this.status.set('missing');
      this.item.set({ ...jigsaw, ...detail.layout, storeWidth: detail.play.storeWidth, ...(detail.play.timed === false ? { timed: false } : {}) }); // a round of a picture has the picture area, grid and store of its own cut
      this.play.set(detail.play);
      this.snapPercent.set(detail.settings.snapPercent);
      this.lineWidth.set(detail.settings.lineWidth);
      this.lineColor.set(detail.settings.lineColor);
      this.backColor.set(detail.settings.backColor);
      this.own.set({ ...detail.play.overrides });
      this.placed.set([...jigsaw.placed.filter((p) => !p.piece), ...detail.pieces.map((p) => JigsawPieces.toPlaced(p))]);
      this.pieceSync.markSaved(detail.pieces);
      this.autosave.markSaved(this.playId); // reading is not a change
      this.elapsedMs.set(detail.play.elapsedMs ?? 0);
      this.timeSaved = this.elapsedMs();
      this.lastTick = 0;
      this.status.set('ready');
      this.picture.set((await this.images.has(jigsaw)) ? this.images.url(jigsaw, 1) : null);
    } catch {
      this.status.set('failed');
    }
  }

  @HostListener('window:resize')
  measureSidebar(): void {
    if (!isWideScreen()) return this.sidebarHeight.set(null); // folded away on a narrow screen: it is as high as what is in it
    const top = (this.element.nativeElement as HTMLElement).getBoundingClientRect().top;
    this.sidebarHeight.set(Math.max(200, Math.floor(window.innerHeight - top)));
  }

  /** the page is closed: the moves of pieces that wait are saved now */
  @HostListener('window:pagehide')
  pageClosed(): void {
    this.pieceSync.leaving();
    this.saveTimeNow();
  }

  /** the page is hidden (another tab, the phone is locked, the app is left): the same, the page may not come back */
  @HostListener('document:visibilitychange')
  pageHidden(): void {
    if (document.visibilityState === 'hidden') {
      this.tickClock(); // the time up to now counts; the clock stops while the page is hidden
      this.pieceSync.leaving();
      this.saveTimeNow();
    } else {
      this.lastTick = 0;
    }
  }

  /** Adds the time since the last look at the clock, while it runs; the time is saved every ten seconds. */
  private tickClock(): void {
    const now = performance.now();
    if (!this.clockRuns()) {
      this.lastTick = 0;
      if (this.elapsedMs() > this.timeSaved && this.status() === 'ready') this.saveTime(); // the round was just solved: the time it took is saved
      return;
    }
    if (this.lastTick) this.elapsedMs.update((ms) => ms + Math.round(now - this.lastTick));
    this.lastTick = now;
    if (this.elapsedMs() - this.timeSaved >= 10_000) this.saveTime();
  }

  private saveTime(): void {
    const ms = this.elapsedMs();
    if (this.viewOnly() || !this.playId || ms <= this.timeSaved) return;
    this.timeSaved = ms;
    void this.plays.saveTime(this.jigsawId, this.playId, ms).catch(() => (this.timeSaved = Math.min(this.timeSaved, ms - 1))); // not saved: tried again at the next tick
  }

  /** The time is saved at once, for a page that is being left (the request goes on after the page is gone). */
  private saveTimeNow(): void {
    const ms = this.elapsedMs();
    if (this.viewOnly() || !this.playId || ms <= this.timeSaved) return;
    this.timeSaved = ms;
    this.plays.saveTimeWhileLeaving(this.jigsawId, this.playId, ms);
  }

  ngOnDestroy(): void {
    clearInterval(this.clockTimer);
    this.tools.clock.set(null);
    this.tools.viewing.set(null);
    this.tools.open(''); // no jigsaw: the switches are not saved for the next one
    this.saveTimeNow();
    this.autosave.destroy();
    this.pieceSync.destroy();
  }

  tell(notice: string): void {
    this.message.set(notice ? { kind: 'danger', text: notice } : null);
  }

  /** The store is made wider (the pieces were collected over the whole frame): this game keeps the new width. */
  widenStore(storeWidth: number): void {
    const item = this.item();
    if (!item) return;
    this.item.set({ ...item, storeWidth });
    void this.plays.move(this.jigsawId, this.playId, [], storeWidth).catch(() => undefined);
  }

  /** Delete game: this game is deleted for good (the jigsaw and the other games stay), and the person goes to the page of the jigsaw. Asked for first. */
  async deleteGame(): Promise<void> {
    this.confirmingDelete.set(false);
    if (this.viewOnly()) return;
    try {
      await this.plays.remove(this.jigsawId, this.playId);
    } catch {
      return this.tell(tr('jigsawPlay.couldNotDelete', 'Could not delete the round: try again.'));
    }
    // nothing of this game is saved any more: what waited to be saved has nowhere to go
    this.pieceSync.markSaved([]);
    this.autosave.markSaved(null);
    this.timeSaved = this.elapsedMs(); // the round is gone: nothing of its time is saved
    await this.router.navigate(['/jigsaw', this.jigsawId]);
  }

  /** Looking at another player's round: start the user's own round of this jigsaw (and go to it). */
  async startOwn(): Promise<void> {
    const me = this.users.user();
    if (!me) return;
    this.pieceSync.leaving();
    if (JigsawKinds.isPicture(this.item() ?? {})) return void (await this.router.navigate(['/jigsaw', this.jigsawId])); // a picture is cut as the person chooses: the page of the picture asks
    try {
      const game = await this.plays.start(this.jigsawId, me.id);
      await this.router.navigate(['/jigsaw', this.jigsawId, 'play', game.id]);
    } catch {
      this.tell(tr('jigsawPage.couldNotStart', 'Could not start a round: try again.'));
    }
  }

  /** New round: this round starts over (the same round, not another): the pieces are scattered again and the time is nothing again. Asked for first. */
  async startOver(): Promise<void> {
    this.confirmingStartOver.set(false);
    if (this.viewOnly()) return;
    // what waited to be saved belongs to the round as it was: it is dropped, as is the time not yet saved
    this.pieceSync.markSaved([]);
    this.timeSaved = this.elapsedMs();
    try {
      await this.plays.restart(this.jigsawId, this.playId);
    } catch {
      return this.tell(tr('jigsawPlay.couldNotStart', 'Could not reset the round: try again.'));
    }
    await this.load();
  }
}
