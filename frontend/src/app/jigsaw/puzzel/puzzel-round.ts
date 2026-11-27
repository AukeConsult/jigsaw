import { PlayLookSetup } from '../../models/shared/play-look';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { tr, translationsLoaded } from '../../core/i18n';
import { JigsawKinds } from '../../models/shared/jigsaw-kind';
import { JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';
import { JigsawSettings, JigsawSpec } from '../../models/shared/jigsaw-settings';
import { PlacedObject } from '../../models/shared/placed';
import { PlaySpec, Plays } from '../../models/shared/play';
import { clockOf } from '../duration';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { AuthService } from '../../logons/auth.service';
import { PieceSync, PieceSyncApi } from '../piece-sync';
import { PlaysService } from '../plays.service';
import { SNAP_LEVELS, snapLevelOf } from '../snap-level';

/**
 * **One round that is open, and everything that goes with playing it**: the jigsaw and the round as the database has them, the pieces on the board (`placed`), the difficulty and the look, how many pieces are matched, the time played, the
 * moves of pieces that are kept in the database (`PieceSync`) and the things a player may do with the round (make it private or public, reset it, delete it, start an own round). It is the one logic of playing, **apart from the page that shows it**
 * (the app's puzzle page): the page provides its own (`providers: [PuzzelRound]`), opens a round with `open`, and shows it with the components `app-puzzel-board` (the board) and `app-puzzel-details` (the details). What is saved
 * is saved as the round is left, or a pause after it changes; the page that provides this leaves with it.
 */
@Injectable()
export class PuzzelRound {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly auth = inject(AuthService);

  /** the jigsaw and the round that are open */
  jigsawId = '';
  playId = '';

  /** loading: being read, ready, missing: there is no such jigsaw or round, failed: it could not be read */
  readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  /** the jigsaw (its store is as wide as this round has made it; a round of a picture has the picture area, grid and store of its own cut) and the round */
  readonly item = signal<JigsawSpec | null>(null);
  readonly play = signal<PlaySpec | null>(null);
  /** the privacy of the round is being saved */
  readonly privacyBusy = signal(false);
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
  /** the cheat is on: the numbers of the grid points and of the pieces are shown, to help find the pieces */
  readonly debug = signal(false);

  /** the difficulty, the jigsaw's own (not a choice of a round): how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never) */
  readonly snapPercent = signal(JigsawSettings.DEFAULT_SNAP_PERCENT);
  /** the look the round is drawn with: the line round each piece (how thick in pixels, and what colour, #rrggbb) and the background colour of the picture area; read from the round, there is no choice of them on the page (see `TODO.md`) */
  readonly lineWidth = signal(JigsawSettings.DEFAULT_LINE_WIDTH);
  readonly lineColor = signal(JigsawSettings.DEFAULT_LINE_COLOR);
  readonly backColor = signal(JigsawSettings.DEFAULT_BACK_COLOR);
  /** the difficulty in words (it is shown, not chosen: it belongs to the jigsaw) */
  private readonly loadedTick = translationsLoaded();
  readonly levelLabel = computed(() => {
    this.loadedTick(); // made again when the language file arrives
    const level = SNAP_LEVELS.find((l) => l.key === snapLevelOf(this.snapPercent()));
    return level ? tr('jigsawLevels.snap.' + level.key, level.label) : '';
  });

  readonly width = computed(() => this.item()?.width ?? 0);
  readonly height = computed(() => this.item()?.height ?? 0);
  readonly gridSize = computed(() => this.item()?.gridSize ?? 0);
  readonly snapRangePx = computed(() => JigsawSettings.snapRangePx(this.snapPercent(), this.gridSize()));
  /** how many pieces the grid makes across and down */
  readonly pieceInfo = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));
  /** the entry is only a picture: it is cut in each round */
  readonly isPicture = computed(() => !!this.item() && JigsawKinds.isPicture(this.item()!));

  /** the pieces on the board as the database has them */
  private readonly pieces = computed(() => this.placed().flatMap((p) => JigsawPieces.of(p, this.pieceInfo().columns) ?? []));
  /** how many pieces are matched (on their own place) of how many there are: the state of the round */
  readonly matched = computed(() => {
    const pieces = this.pieces();
    return { count: pieces.filter((p) => JigsawPieces.matched(p)).length, total: pieces.length };
  });
  /** every piece is in its place */
  readonly solved = computed(() => this.matched().total > 0 && this.matched().count === this.matched().total);

  /** where the moves of pieces are saved: the positions of this round */
  private readonly syncApi: PieceSyncApi = {
    move: (playId, moves) => this.plays.move(this.jigsawId, playId, moves),
    moveWhileLeaving: (playId, moves) => this.plays.moveWhileLeaving(this.jigsawId, playId, moves),
  };

  /** keeps where the pieces are in the database, a pause after the last move (the id it works with is the round's) */
  readonly pieceSync = new PieceSync({ jigsawId: () => (this.viewOnly() ? null : this.playId || null), pieces: () => this.pieces(), api: this.syncApi }); // another player's round is never saved from here (no id: nothing is sent)

  /** how long the round has been played, in milliseconds: counted while the round is open on the screen (the page is shown), it is the user's own and it is not solved */
  readonly elapsedMs = signal(0);
  readonly clock = computed(() => clockOf(this.elapsedMs()));
  /** the time the database has, and when the clock was last read (performance.now(); 0: the clock is not running) */
  private timeSaved = 0;
  private lastTick = 0;
  private readonly clockTimer = setInterval(() => this.tickClock(), 1000);

  constructor() {
    // what waits is saved when the page is closed, or hidden (it may not come back); when it is shown again the clock starts from now
    const closed = () => this.saveBeforeLeaving();
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        this.tickClock(); // the time up to now counts; the clock stops while the page is hidden
        this.saveBeforeLeaving();
      } else {
        this.lastTick = 0;
      }
    };
    window.addEventListener('pagehide', closed);
    document.addEventListener('visibilitychange', hidden);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('pagehide', closed);
      document.removeEventListener('visibilitychange', hidden);
      clearInterval(this.clockTimer);
      this.saveTimeNow();
      this.pieceSync.destroy();
    });
  }

  /** Opens a round of a jigsaw (what was open is left: what waits to be saved goes to the round that is left, and so does the time). The round is as the person left it. */
  open(jigsawId: string, playId: string): void {
    this.pieceSync.leaving();
    this.saveTimeNow();
    this.jigsawId = jigsawId;
    this.playId = playId;
    void this.load();
  }

  /**
   * Opens **the round of the account that plays, in a jigsaw** (the route `/play/jigsaw/:id`): the round that is going, else the one that is solved (it can be looked at), else a new one. What it
   * says: `opened` (the round is being read), `logon` (nobody plays: an account is needed), `choose` (a picture has no round yet: the number of pieces and the difficulty are chosen first, which the page of the picture does), or `missing`.
   */
  async openFor(jigsawId: string): Promise<'opened' | 'logon' | 'choose' | 'missing'> {
    this.jigsawId = jigsawId;
    this.status.set('loading');
    try {
      await this.users.load(); // who plays is read first (the page may be opened by its address): the account that played last, and the earlier login
      await this.auth.ready;
      const jigsaw = await this.service.get(jigsawId);
      if (!jigsaw) {
        this.status.set('missing');
        return 'missing';
      }
      const me = this.users.acting();
      if (!me) return 'logon';
      const rounds = await this.plays.list(jigsawId, me.id); // the newest first
      let round = rounds.find((r) => r.status !== 'solved') ?? rounds[0] ?? null;
      if (!round) {
        if (JigsawKinds.isPicture(jigsaw)) return 'choose';
        try {
          round = await this.plays.start(jigsawId, me.id);
        } catch (err) {
          if ((err as { status?: number }).status === 403) return 'choose'; // a picture of a package the account has not got: the page before the puzzle says so
          throw err;
        }
      }
      this.open(jigsawId, round.id);
      return 'opened';
    } catch {
      this.status.set('failed');
      return 'opened'; // the page shows that it failed
    }
  }

  /** Reads the jigsaw, the round with its pieces, and the picture. */
  private async load(): Promise<void> {
    this.status.set('loading');
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
      this.placed.set([...jigsaw.placed.filter((p) => !p.piece), ...detail.pieces.map((p) => JigsawPieces.toPlaced(p))]);
      this.pieceSync.markSaved(detail.pieces);
      this.elapsedMs.set(detail.play.elapsedMs ?? 0);
      this.timeSaved = this.elapsedMs();
      this.lastTick = 0;
      this.status.set('ready');
      this.picture.set((await this.images.has(jigsaw)) ? this.images.url(jigsaw, 1) : null);
    } catch {
      this.status.set('failed');
    }
  }

  /** the clock runs: the round is ready, is the user's own, is not solved, and the page is on the screen */
  private clockRuns(): boolean {
    return this.status() === 'ready' && !!this.play() && this.item()?.timed !== false && !this.viewOnly() && !this.solved() && document.visibilityState === 'visible';
  }

  /** what waits is saved now: the moves of pieces and the time played (the page is closed or hidden and may not come back) */
  private saveBeforeLeaving(): void {
    this.pieceSync.leaving();
    this.saveTimeNow();
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
    void this.plays.saveTimeWhileLeaving(this.jigsawId, this.playId, ms).catch(() => (this.timeSaved = Math.min(this.timeSaved, ms - 1))); // not saved, and the page is still there: tried again at the next tick
  }

  /** Says something to the player (nothing: what was said is taken away). */
  tell(notice: string): void {
    this.message.set(notice ? { kind: 'danger', text: notice } : null);
  }

  /** The player makes the round private or public (saved at once; the round is told what the server says). */
  async setPrivate(isPrivate: boolean): Promise<void> {
    const round = this.play();
    if (!round || this.viewOnly() || this.privacyBusy() || !!round.private === isPrivate) return;
    this.privacyBusy.set(true);
    try {
      this.play.set(await this.plays.setPrivate(this.jigsawId, round.id, isPrivate));
    } catch {
      this.play.set({ ...round }); // not saved: the switch goes back to what is saved
    } finally {
      this.privacyBusy.set(false);
    }
  }

  /** the table and the sound of this round only (null: it follows the player's preference) */
  readonly ownLook = computed(() => this.play()?.look ?? null);

  /** The player gives the round its own table and sound, or takes them away (null): shown at once and saved; what is not saved goes back. */
  async setLook(look: PlayLookSetup | null): Promise<void> {
    const round = this.play();
    if (!round || this.viewOnly()) return;
    this.play.set(Plays.withLook(round, look));
    try {
      await this.plays.setLook(this.jigsawId, round.id, look);
    } catch {
      if (this.play()?.id === round.id) this.play.set({ ...round });
      this.tell(tr('jigsawPlay.lookNotSaved', 'Could not save the settings of this round.'));
    }
  }

  /** The store is made wider (the pieces were collected over the whole frame): this round keeps the new width. */
  widenStore(storeWidth: number): void {
    const item = this.item();
    if (!item) return;
    this.item.set({ ...item, storeWidth });
    void this.plays.move(this.jigsawId, this.playId, [], storeWidth).catch(() => undefined);
  }

  /** The round is deleted for good (the jigsaw and the other rounds stay). True when it is gone; when it could not be, the player is told. */
  async deleteRound(): Promise<boolean> {
    if (this.viewOnly()) return false;
    try {
      await this.plays.remove(this.jigsawId, this.playId);
    } catch {
      this.tell(tr('jigsawPlay.couldNotDelete', 'Could not delete the round: try again.'));
      return false;
    }
    // nothing of this round is saved any more: what waited to be saved has nowhere to go
    this.pieceSync.markSaved([]);
    this.timeSaved = this.elapsedMs(); // the round is gone: nothing of its time is saved
    return true;
  }

  /** Looking at another player's round: the user's own round of this jigsaw is started, and given back (the page goes to it); null when it could not be started (the player is told). */
  async startOwn(): Promise<PlaySpec | null> {
    const me = this.users.user();
    if (!me) return null;
    this.pieceSync.leaving();
    try {
      return await this.plays.start(this.jigsawId, me.id);
    } catch {
      this.tell(tr('jigsawPage.couldNotStart', 'Could not start a round: try again.'));
      return null;
    }
  }

  /** This round starts over (the same round, not another): the pieces are scattered again and the time is nothing again. */
  async startOver(): Promise<void> {
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
