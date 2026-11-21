import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fitPicture } from '../fit-picture';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawPiecesService } from '../jigsaw-pieces.service';
import { JigsawService } from '../jigsaw.service';
import { PictureCropper } from '../picture-cropper/picture-cropper';
import { renderPieceGraphics } from '../piece-graphics';
import { CANVAS_MAX_NAME, CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, CanvasArea, CanvasInput } from '../../models/shared/canvas';
import { SourceRect } from '../../models/shared/geometry';
import { JigsawCut, JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';

/** The biggest picture the API keeps for a jigsaw (about 5 MB; a larger one is made smaller first). */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024 - 64 * 1024;
/** The preview of the cut picture is small. */
const PREVIEW_BYTES = 300 * 1024;

/**
 * Making a new jigsaw: the person fills in the settings in the main frame (the name, the size, how many pieces, the picture and how close a piece has to be
 * dropped to click into place), then saves. Saving makes the jigsaw (its settings), puts its picture in Storage, cuts it into pieces and keeps them in
 * the database with their graphics, and opens it to play. If a step fails what was made is taken away again: there is no half made jigsaw.
 */
@Component({
  selector: 'app-jigsaw-new',
  imports: [FormsModule, RouterLink, PictureCropper],
  templateUrl: './jigsaw-new.html',
})
export class JigsawNew implements OnDestroy {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly pieceApi = inject(JigsawPiecesService);
  private readonly router = inject(Router);

  readonly name = signal('Untitled');
  readonly width = signal(800);
  readonly height = signal(600);
  /** how many pieces the picture is cut into (the grid size is worked out from it) */
  readonly pieceCount = signal(16 * 12);
  readonly gridSize = signal(50);
  readonly gridVisible = signal(true);
  /** how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never) */
  readonly snapPercent = signal(CanvasArea.DEFAULT_SNAP_PERCENT);
  /** how thick the frame around the picture area is, in pixels (0: none) */
  readonly frameWidth = signal(CanvasArea.DEFAULT_FRAME_WIDTH);
  readonly maxFrame = CanvasArea.MAX_FRAME_WIDTH;

  /** the size of the canvas as the person gave it (the canvas itself is made a whole number of pieces wide and high, which can differ a little) */
  private askedSize = { width: 800, height: 600 };
  readonly pieceInfo = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** the picture file that was chosen, and the cut of it that was found (with the shape of the canvas it was found for) */
  readonly file = signal<File | null>(null);
  readonly cut = signal<{ rect: SourceRect; shape: number } | null>(null);
  /** a small picture of the cut, as an address of the page (null: none yet) */
  readonly preview = signal<string | null>(null);
  readonly cropping = signal(false);

  readonly saving = signal(false);
  readonly error = signal('');

  readonly minSide = CANVAS_MIN_SIDE;
  readonly maxSide = CANVAS_MAX_SIDE;
  readonly maxName = CANVAS_MAX_NAME;

  /** the cut was found for another shape of canvas: the size changed since, so the picture has to be adjusted again */
  readonly stale = computed(() => {
    const c = this.cut();
    return !!c && Math.abs(c.shape - this.width() / this.height()) > 0.002;
  });

  /** the settings as the API takes them (the store of the pieces is added when the picture is cut) */
  private settings(storeWidth?: number): CanvasInput {
    return {
      name: this.name().trim(),
      width: this.width(),
      height: this.height(),
      gridSize: this.gridSize(),
      gridVisible: this.gridVisible(),
      placed: [],
      snapPercent: this.snapPercent(),
      frameWidth: this.frameWidth(),
      ...(storeWidth ? { storeWidth } : {}),
    };
  }

  /** why the settings are not allowed ('' when they are) */
  readonly problem = computed(() => new CanvasArea(this.settings()).error());

  readonly canSave = computed(() => !this.saving() && !this.problem() && !!this.file() && !!this.cut() && !this.stale());

  /**
   * The person gave a size or a number of pieces: the grid size is worked out from the number of pieces, and the canvas is made a whole number of pieces
   * wide and high (see `JigsawCut.layoutFor`). The number shown is the number of pieces that really comes out.
   */
  relayout(changed: 'width' | 'height' | 'pieces'): void {
    // the sides as the person typed them, each on its own: not what the canvas was made last time (that is a little different when the pieces are whole squares)
    if (changed === 'width') this.askedSize = { ...this.askedSize, width: this.width() };
    if (changed === 'height') this.askedSize = { ...this.askedSize, height: this.height() };
    const layout = JigsawCut.layoutFor(this.askedSize.width, this.askedSize.height, this.pieceCount());
    this.width.set(layout.width);
    this.height.set(layout.height);
    this.gridSize.set(layout.grid);
    this.pieceCount.set(layout.columns * layout.rows);
  }

  /** A picture file was chosen: it is shown behind a frame of the shape of the canvas to find the cut. */
  choosePicture(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (!file) return;
    this.file.set(file);
    this.cut.set(null);
    this.setPreview(null);
    this.cropping.set(true);
  }

  /** The cut was found. */
  async useCut(rect: SourceRect): Promise<void> {
    this.cropping.set(false);
    this.cut.set({ rect, shape: this.width() / this.height() });
    const file = this.file();
    if (!file) return;
    try {
      this.setPreview(URL.createObjectURL(await fitPicture(file, this.width(), this.height(), PREVIEW_BYTES, rect)));
    } catch {
      this.setPreview(null);
    }
  }

  private setPreview(address: string | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(address);
  }

  ngOnDestroy(): void {
    this.setPreview(null);
  }

  /** Save: the jigsaw is made, its picture and pieces are kept, and it is opened to play. */
  async save(): Promise<void> {
    const file = this.file();
    const cut = this.cut();
    if (!this.canSave() || !file || !cut) return;
    this.error.set('');
    this.saving.set(true);
    const cutting = JigsawCut.cut(this.width(), this.height(), this.gridSize());
    if ('error' in cutting) {
      this.error.set(cutting.error);
      this.saving.set(false);
      return;
    }
    const pieces = cutting.placed.flatMap((p) => JigsawPieces.of(p, cutting.columns) ?? []);
    let madeId: string | null = null;
    try {
      const picture = await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut.rect); // cut to the shape of the canvas
      const made = await this.service.create(this.settings(cutting.storeWidth));
      madeId = made.id;
      await this.images.upload(made.id, picture);
      const address = URL.createObjectURL(picture);
      let graphics: Map<string, string>;
      try {
        graphics = await renderPieceGraphics(address, pieces, cutting.columns, cutting.rows);
      } finally {
        URL.revokeObjectURL(address);
      }
      await this.pieceApi.replace(made.id, pieces.map((p) => (graphics.has(p.id) ? { ...p, graphic: graphics.get(p.id) } : p)));
      await this.router.navigate(['/jigsaw', made.id]);
    } catch {
      if (madeId) await this.service.remove(madeId).catch(() => undefined); // nothing half made is left
      this.error.set('Could not make the jigsaw. Nothing was saved: check the picture and try again.');
      this.saving.set(false);
    }
  }
}
