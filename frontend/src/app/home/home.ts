import { Component, ElementRef, HostListener, OnDestroy, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Autosave } from '../core/autosave';
import { CanvasBoard } from '../canvas-board/canvas-board';
import { CanvasPanel } from '../canvas-panel/canvas-panel';
import { PictureCropper } from '../picture-cropper/picture-cropper';
import { CanvasListService } from '../core/canvas-list.service';
import { CanvasObjectsService } from '../core/canvas-objects.service';
import { JigsawImageService } from '../core/jigsaw-image.service';
import { JigsawPiecesService } from '../core/jigsaw-pieces.service';
import { PieceSync } from '../core/piece-sync';
import { renderPieceGraphics } from '../core/piece-graphics';
import { fitPicture } from '../core/fit-picture';
import { JigsawService } from '../core/jigsaw.service';
import { ObjectPalette } from '../object-palette/object-palette';
import { SourceRect } from '../models/shared/geometry';
import { JigsawCut, JigsawPiece, JigsawPieces, pieceGrid } from '../models/shared/jigsaw';
import { CANVAS_DEFAULT_GRID, CanvasArea, CanvasInput, CanvasSpec } from '../models/shared/canvas';
import { CanvasObject } from '../models/shared/canvas-object';
import { PlacedObject } from '../models/shared/placed';

/** The biggest picture the API keeps for a jcanvas (about 5 MB; a larger one is made smaller first). */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024 - 64 * 1024;

/**
 * The canvas page (also the jigsaw page, which keeps its canvases in another collection): three parts side by side, the panel (the settings and the saved canvases), the board (the canvas with its objects) and the
 * palette (the objects to drag in). The page holds the open canvas (its settings and its placed objects), saves the changes by themselves, and
 * opens, starts and deletes saved canvases; each part works on what it is given.
 */
@Component({
  selector: 'app-home',
  imports: [TranslocoDirective, CanvasPanel, CanvasBoard, ObjectPalette, PictureCropper],
  templateUrl: './home.html',
})
export class Home implements OnInit, OnDestroy {
  /** what the route says: the page's heading and where its canvases are kept (`canvas-list`, or `jigsaw`); the page works the same on both */
  private readonly route = inject(ActivatedRoute).snapshot.data as { heading?: string; collection?: string; gridInset?: boolean; numberPoints?: boolean; palette?: boolean; background?: boolean; tools?: boolean; fillScreen?: boolean; sidebar?: boolean };
  readonly heading = this.route.heading ?? 'Canvas';
  /** whether the grid points are half a step in from the canvas edge (on the jigsaw) */
  readonly gridInset = this.route.gridInset ?? false;
  /** whether the grid points are numbered (on the jigsaw) */
  readonly numberPoints = this.route.numberPoints ?? false;
  /** debug is on (the Debug button): the grid numbers are shown, when the page has them; off, they are not */
  readonly debug = signal(false);
  /** whether the list of canvas objects to drag in is shown at the side (not on the jigsaw) */
  readonly palette = this.route.palette ?? true;
  /** whether the layer field and the Remove picked button are shown above the canvas (not on the jigsaw) */
  readonly tools = this.route.tools ?? true;
  /** whether the pieces area is as high as the visible screen (on the jigsaw) */
  readonly fillScreen = this.route.fillScreen ?? false;
  /** whether the settings panel is a sidebar docked at the left edge, with the title at its top, as high as the visible screen (on the jigsaw) */
  readonly sidebar = this.route.sidebar ?? false;
  /** the height of the sidebar in pixels: from where the page starts (under the top menu) to the bottom of the window */
  readonly sidebarHeight = signal<number | null>(null);
  private readonly element = inject(ElementRef<HTMLElement>);

  @HostListener('window:resize')
  @HostListener('window:scroll')
  measureSidebar(): void {
    if (!this.sidebar) return;
    const top = (this.element.nativeElement as HTMLElement).getBoundingClientRect().top;
    this.sidebarHeight.set(Math.max(200, Math.floor(window.innerHeight - top)));
  }
  /** whether the canvas can have a background picture (on the jigsaw) */
  readonly background = this.route.background ?? false;

  private readonly images = inject(JigsawImageService);
  /** the address of the background picture of the open canvas (null: none) */
  readonly picture = signal<string | null>(null);
  private pictureVersion = 0;
  private readonly canvasList = inject(CanvasListService);
  private readonly jigsaw = inject(JigsawService);
  private readonly service = this.route.collection === 'jigsaw' ? this.jigsaw : this.canvasList;
  private readonly objectsService = inject(CanvasObjectsService);
  private readonly pieceApi = inject(JigsawPiecesService);

  // the open canvas
  readonly name = signal('Untitled');
  readonly width = signal(800);
  readonly height = signal(600);
  readonly gridSize = signal(CANVAS_DEFAULT_GRID);
  readonly gridVisible = signal(true);
  /** a jigsaw: how wide the store frame beside the canvas is (0: none) */
  readonly storeWidth = signal(0);
  /** the canvas objects placed on the canvas (as they are stored) */
  readonly placed = signal<PlacedObject[]>([]);

  /** the canvas objects that can be put on the canvas */
  readonly objects = signal<CanvasObject[]>([]);
  readonly objectsFailed = signal(false);

  readonly saved = signal<CanvasSpec[]>([]);
  readonly message = signal<{ kind: 'success' | 'danger'; text: string } | null>(null);

  /** why the current name and size cannot be saved ('' when they can) */
  readonly error = computed(() => new CanvasArea(this.input()).error());

  /** the changes of the open canvas are saved by themselves (a new canvas is created by its first change) */
  private readonly autosave = new Autosave<CanvasInput, CanvasSpec>({
    input: () => this.input(),
    invalid: () => this.error(),
    create: (input) => this.service.create(input),
    update: (id, input) => this.service.update(id, input),
    saved: (item) => this.saved.update((list) => (list.some((c) => c.id === item.id) ? list.map((c) => (c.id === item.id ? item : c)) : [item, ...list])),
  });
  readonly currentId = this.autosave.currentId;
  readonly saveState = this.autosave.state;

  /** the pieces of the jigsaw on the page, as the database has them (the jigsaw document holds none: they are documents of their own under it) */
  private readonly pieces = computed(() => {
    const { columns } = pieceGrid(this.width(), this.height(), this.gridSize());
    return this.placed().flatMap((p) => JigsawPieces.of(p, columns) ?? []);
  });
  /** keeps the pieces in the database: all of them with their graphics after a cut, after that the pieces that were moved */
  private readonly pieceSync = new PieceSync({ jigsawId: () => this.currentId(), pieces: () => this.pieces(), api: this.pieceApi });
  /** how many pieces are matched (on their own place) of how many there are: the state of the game (null: no pieces) */
  readonly matched = computed(() => {
    const pieces = this.pieces();
    return pieces.length ? { count: pieces.filter((p) => JigsawPieces.matched(p)).length, total: pieces.length } : null;
  });

  /** the settings of the open canvas, as the API takes them */
  private input(): CanvasInput {
    return { name: this.name().trim(), width: this.width(), height: this.height(), gridSize: this.gridSize(), gridVisible: this.gridVisible(), placed: this.placed().filter((p) => !p.piece), ...(this.storeWidth() ? { storeWidth: this.storeWidth() } : {}) };
  }

  constructor() {
    afterNextRender(() => this.measureSidebar());
  }

  async ngOnInit(): Promise<void> {
    this.objectsService.list().then((list) => this.objects.set(list), () => this.objectsFailed.set(true));
    try {
      this.saved.set(await this.service.list());
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not load the saved canvases.' });
    }
  }

  ngOnDestroy(): void {
    this.autosave.destroy();
    this.pieceSync.destroy();
  }

  /** what the board tells: why an object could not be put there ('' when there is nothing to tell) */
  tell(notice: string): void {
    this.message.set(notice ? { kind: 'danger', text: notice } : null);
  }

  async removeCanvas(item: CanvasSpec): Promise<void> {
    try {
      await this.service.remove(item.id);
      this.saved.update((list) => list.filter((c) => c.id !== item.id));
      if (this.currentId() === item.id) this.autosave.markSaved(null); // the open canvas is gone: what is on the page is a new one, saved when it changes
      this.message.set({ kind: 'success', text: `Deleted "${item.name}".` });
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not delete the canvas.' });
    }
  }

  /** a new, empty canvas (the one that was open has been saved by itself) */
  newCanvas(): void {
    this.name.set('Untitled');
    this.width.set(800);
    this.height.set(600);
    this.gridSize.set(CANVAS_DEFAULT_GRID);
    this.gridVisible.set(true);
    this.placed.set([]);
    this.storeWidth.set(0);
    this.message.set(null);
    this.picture.set(null);
    this.autosave.markSaved(null);
    this.pieceSync.markSaved([]);
  }

  open(item: CanvasSpec): void {
    this.placed.set(item.placed);
    this.storeWidth.set(item.storeWidth ?? 0);
    this.name.set(item.name);
    this.width.set(item.width);
    this.height.set(item.height);
    this.gridSize.set(item.gridSize);
    this.gridVisible.set(item.gridVisible);
    this.message.set(null);
    this.autosave.markSaved(item.id); // opening is not a change
    if (this.gridInset) this.fitSizeToGrid(); // but a size that does not fit the grid is fitted, and that is saved like a change
    void this.showPictureOf(item.id);
    void this.loadPieces(item);
  }

  /**
   * Reinstates the game of a saved jigsaw: its pieces are read from the database (where each is, on which layer, with its edges and number) and put on
   * the board. A jigsaw that an older version saved has its pieces in its own document: they are moved to the database.
   */
  private async loadPieces(item: CanvasSpec): Promise<void> {
    if (!this.background) return;
    this.pieceSync.markSaved(this.pieces());
    try {
      const saved = await this.pieceApi.list(item.id);
      if (this.currentId() !== item.id) return; // another canvas was opened meanwhile
      if (saved.length) {
        this.placed.set([...item.placed.filter((p) => !p.piece), ...saved.map((p) => JigsawPieces.toPlaced(p))]);
        this.pieceSync.markSaved(saved);
      } else if (item.placed.some((p) => p.piece)) {
        this.pieceSync.queueReplace(Promise.resolve(new Map())); // an older save: its pieces go to the database, without graphics
      }
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not load the pieces of the jigsaw.' });
    }
  }

  /** The width and height made a whole number of grid steps (see `CanvasArea.fittedSide`), so the points are as far from every edge. */
  private fitSizeToGrid(): void {
    this.width.set(CanvasArea.fittedSide(this.width(), this.gridSize()));
    this.height.set(CanvasArea.fittedSide(this.height(), this.gridSize()));
  }

  /** shows the background picture of a saved canvas, when it has one */
  private async showPictureOf(id: string): Promise<void> {
    this.picture.set(null);
    if (!this.background || !(await this.images.has(id))) return;
    if (this.currentId() === id) this.picture.set(this.images.url(id, ++this.pictureVersion));
  }

  /** the picture that was chosen and is being cut (null: none): the person finds the cut in the cropper, then it becomes the background */
  readonly cropping = signal<File | null>(null);

  /** The person chose a picture file: they are shown it behind a frame of the shape of the canvas to find the cut. */
  choosePicture(file: File): void {
    this.cropping.set(file);
  }

  /** The cut was found: the picture is cut so and saved. */
  async usePicture(cut: SourceRect): Promise<void> {
    const file = this.cropping();
    this.cropping.set(null);
    if (file) await this.setPicture(file, cut);
  }

  /** The picture the person chose becomes the background (cut as `cut` says, or in the middle): a canvas that is not saved yet is saved first (the picture belongs to its id). */
  async setPicture(file: File, cut?: SourceRect): Promise<void> {
    try {
      if (!this.currentId()) {
        const problem = this.error();
        if (problem) return this.tell(problem);
        const item = await this.service.create(this.input());
        this.autosave.markSaved(item.id);
        this.saved.update((list) => [item, ...list.filter((c) => c.id !== item.id)]);
      }
      const id = this.currentId() as string;
      await this.images.upload(id, await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut)); // cut to the shape of the canvas first
      this.picture.set(this.images.url(id, ++this.pictureVersion));
      this.message.set(null);
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not use that picture (a jpeg, png or webp).' });
    }
  }

  /**
   * Cuts the picture into jigsaw pieces, one for each cell of the grid, and scatters them over the canvas (see `JigsawCut`). They replace what is on the
   * canvas, and are saved with it like any change.
   */
  cut(): void {
    const result = JigsawCut.cut(this.width(), this.height(), this.gridSize());
    if ('error' in result) return this.tell(result.error);
    this.storeWidth.set(result.storeWidth);
    this.pieceSync.queueReplace(this.graphicsOf(result.placed.flatMap((p) => JigsawPieces.of(p, result.columns) ?? []), result.columns, result.rows)); // the pieces and their graphics go to the database
    this.placed.set(result.placed);
    this.message.set({ kind: 'success', text: `Cut into ${result.placed.length} pieces, in the store beside the picture.` });
  }

  /** the graphics of the pieces, drawn from the picture (none when there is no picture, or it cannot be read) */
  private async graphicsOf(pieces: JigsawPiece[], columns: number, rows: number): Promise<Map<string, string>> {
    const picture = this.picture();
    if (!picture) return new Map();
    try {
      return await renderPieceGraphics(picture, pieces, columns, rows);
    } catch {
      return new Map();
    }
  }

  /** the canvas has jigsaw pieces (cut from the picture) */
  readonly hasPieces = computed(() => this.placed().some((p) => p.piece));

  /** Reset: all the pieces are shuffled over the store frame again, on random places and layers (see `JigsawCut.reshuffle`). */
  reset(): void {
    const result = JigsawCut.reshuffle(this.placed(), this.width(), this.height(), this.gridSize());
    if ('error' in result) return this.tell(result.error);
    this.storeWidth.set(result.storeWidth);
    this.placed.set(result.placed);
    this.message.set({ kind: 'success', text: 'All the pieces are shuffled again.' });
  }

  async clearPicture(): Promise<void> {
    const id = this.currentId();
    if (!id) return;
    try {
      await this.images.remove(id);
      this.picture.set(null);
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not take the picture away.' });
    }
  }
}
