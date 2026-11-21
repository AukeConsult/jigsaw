import { Component, ElementRef, HostListener, OnDestroy, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Autosave } from '../../core/autosave';
import { isBoolean, readSession, writeSession } from '../../core/session-storage';
import { isWideScreen } from '../../core/theme';
import { CanvasBoard } from '../../canvas/canvas-board/canvas-board';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawPiecesService } from '../jigsaw-pieces.service';
import { JigsawService } from '../jigsaw.service';
import { PieceSync } from '../piece-sync';
import { CanvasArea, CanvasInput, CanvasSpec } from '../../models/shared/canvas';
import { JigsawCut, JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';
import { PlacedObject } from '../../models/shared/placed';

/**
 * Playing a jigsaw (`/jigsaw/:id`): the pieces in their store beside the picture, the sidebar with how far the game has come, and the helper banner. It
 * reads the jigsaw, its pieces and its picture, and keeps what the person does: where the pieces are (`PieceSync`) and how close a piece has to be
 * dropped to click into place (saved with the jigsaw). The settings of the jigsaw are made once, on the page for a new jigsaw.
 */
@Component({
  selector: 'app-jigsaw-play',
  imports: [FormsModule, RouterLink, CanvasBoard],
  templateUrl: './jigsaw-play.html',
})
export class JigsawPlay implements OnDestroy {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly pieceApi = inject(JigsawPiecesService);
  private readonly element = inject(ElementRef<HTMLElement>);
  /** the jigsaw that is open */
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  /** loading: being read, ready, missing: there is no such jigsaw, failed: it could not be read */
  readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  readonly item = signal<CanvasSpec | null>(null);
  /** the pieces (and anything else that is placed) on the board, as they are stored */
  readonly placed = signal<PlacedObject[]>([]);
  /** the address of the picture (null: none) */
  readonly picture = signal<string | null>(null);
  readonly message = signal<{ kind: 'success' | 'danger'; text: string } | null>(null);
  /** the sidebar is open: on a narrow screen it is folded away behind a bar until it is opened (kept for the session; on a wide screen it is always there) */
  readonly sidebarOpen = signal(readSession('jigsaw.sidebarOpen', false, isBoolean));
  /** debug is on (the Debug button): the numbers of the grid points and of the pieces are shown */
  readonly debug = signal(false);
  /** how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never): a setting of the jigsaw */
  readonly snapPercent = signal(CanvasArea.DEFAULT_SNAP_PERCENT);

  /** how thick the frame around the picture area is (chosen when the jigsaw was made; a jigsaw that has none gets the usual frame) */
  readonly frameWidth = computed(() => this.item()?.frameWidth ?? CanvasArea.DEFAULT_FRAME_WIDTH);
  readonly width = computed(() => this.item()?.width ?? 0);
  readonly height = computed(() => this.item()?.height ?? 0);
  readonly gridSize = computed(() => this.item()?.gridSize ?? 0);
  readonly snapRangePx = computed(() => CanvasArea.snapRangePx(this.snapPercent(), this.gridSize()));
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

  /** keeps where the pieces are in the database, a pause after the last move */
  readonly pieceSync = new PieceSync({ jigsawId: () => this.id, pieces: () => this.pieces(), api: this.pieceApi });

  /** what is saved of the jigsaw itself: nothing but the snap range changes while it is played */
  private readonly autosave = new Autosave<CanvasInput, CanvasSpec>({
    input: () => this.settings(),
    invalid: () => (this.item() ? new CanvasArea(this.settings()).error() : 'loading'),
    create: () => Promise.reject(new Error('A jigsaw is made on the page for a new jigsaw.')),
    update: (id, input) => this.service.update(id, input),
    saved: (spec) => this.item.set(spec),
  });
  readonly saveState = this.autosave.state;

  constructor() {
    afterNextRender(() => this.measureSidebar());
    effect(() => writeSession('jigsaw.sidebarOpen', this.sidebarOpen()));
    void this.load();
  }

  /** the settings of the jigsaw as the API takes them */
  private settings(): CanvasInput {
    const item = this.item();
    return {
      name: item?.name ?? '',
      width: this.width(),
      height: this.height(),
      gridSize: this.gridSize(),
      gridVisible: item?.gridVisible ?? true,
      placed: this.placed().filter((p) => !p.piece),
      ...(item?.storeWidth ? { storeWidth: item.storeWidth } : {}),
      snapPercent: this.snapPercent(),
      frameWidth: this.frameWidth(),
    };
  }

  /** Reads the jigsaw, its pieces and its picture: the game is as the person left it. */
  private async load(): Promise<void> {
    try {
      const item = (await this.service.list()).find((c) => c.id === this.id);
      if (!item) return this.status.set('missing');
      const saved = await this.pieceApi.list(this.id);
      this.item.set(item);
      this.snapPercent.set(item.snapPercent ?? CanvasArea.DEFAULT_SNAP_PERCENT);
      if (saved.length) {
        this.placed.set([...item.placed.filter((p) => !p.piece), ...saved.map((p) => JigsawPieces.toPlaced(p))]);
        this.pieceSync.markSaved(saved);
      } else {
        this.placed.set(item.placed);
        this.pieceSync.markSaved([]);
        if (item.placed.some((p) => p.piece)) this.pieceSync.queueReplace(Promise.resolve(new Map())); // an older save: its pieces go to the database, without graphics
      }
      this.autosave.markSaved(this.id); // reading is not a change
      this.status.set('ready');
      if (await this.images.has(this.id)) this.picture.set(this.images.url(this.id, 1));
    } catch {
      this.status.set('failed');
    }
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  measureSidebar(): void {
    if (!isWideScreen()) return this.sidebarHeight.set(null); // folded away on a narrow screen: it is as high as what is in it
    const top = (this.element.nativeElement as HTMLElement).getBoundingClientRect().top;
    this.sidebarHeight.set(Math.max(200, Math.floor(window.innerHeight - top)));
  }

  /** the page is closed: the moves of pieces that wait are saved now */
  @HostListener('window:pagehide')
  pageClosed(): void {
    this.pieceSync.leaving();
  }

  /** the page is hidden (another tab, the phone is locked, the app is left): the same, the page may not come back */
  @HostListener('document:visibilitychange')
  pageHidden(): void {
    if (document.visibilityState === 'hidden') this.pieceSync.leaving();
  }

  ngOnDestroy(): void {
    this.autosave.destroy();
    this.pieceSync.destroy();
  }

  /** what the board tells: why an object could not be put there ('' when there is nothing to tell) */
  tell(notice: string): void {
    this.message.set(notice ? { kind: 'danger', text: notice } : null);
  }

  /** The store is made wider (the pieces were collected over the whole frame): the jigsaw keeps the new width. */
  widenStore(storeWidth: number): void {
    const item = this.item();
    if (item) this.item.set({ ...item, storeWidth });
  }

  /** Reset: all the pieces are shuffled over the store frame again, on random places and layers (see `JigsawCut.reshuffle`). */
  reset(): void {
    const item = this.item();
    if (!item) return;
    const result = JigsawCut.reshuffle(this.placed(), item.width, item.height, item.gridSize);
    if ('error' in result) return this.tell(result.error);
    this.item.set({ ...item, storeWidth: result.storeWidth }); // the store is as wide as the pieces need
    this.placed.set(result.placed);
    this.message.set({ kind: 'success', text: 'All the pieces are shuffled again.' });
  }
}
