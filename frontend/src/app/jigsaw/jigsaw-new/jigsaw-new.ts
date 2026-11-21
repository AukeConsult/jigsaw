import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fitPicture } from '../fit-picture';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawPiecesService } from '../jigsaw-pieces.service';
import { JigsawService } from '../jigsaw.service';
import { SNAP_LEVELS, snapLevelOf, snapPercentOf } from '../snap-level';
import { LINE_LEVELS, lineLevelOf } from '../line-level';
import { JigsawExample } from '../jigsaw-example/jigsaw-example';
import { PictureCropper } from '../picture-cropper/picture-cropper';
import { renderPieceGraphics } from '../piece-graphics';
import { CANVAS_MAX_NAME, CANVAS_MAX_PICTURE_NAME, CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, CanvasArea, CanvasInput } from '../../models/shared/canvas';
import { SourceRect } from '../../models/shared/geometry';
import { JigsawCut, JigsawPieces, PieceLayout, pieceGrid } from '../../models/shared/jigsaw';

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
  imports: [FormsModule, RouterLink, PictureCropper, JigsawExample],
  templateUrl: './jigsaw-new.html',
})
export class JigsawNew implements OnDestroy {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly pieceApi = inject(JigsawPiecesService);
  private readonly router = inject(Router);

  /** the standard shapes to choose from (the canvas is then made a whole number of pieces wide and high, which can differ a little) */
  readonly sizePresets = [
    { key: 'standard', label: 'Standard 4:3 (800 × 600)', width: 800, height: 600 },
    { key: 'photo', label: 'Photo 3:2 (900 × 600)', width: 900, height: 600 },
    { key: 'wide', label: 'Wide 16:9 (960 × 540)', width: 960, height: 540 },
    { key: 'square', label: 'Square 1:1 (700 × 700)', width: 700, height: 700 },
    { key: 'portrait', label: 'Portrait 3:4 (600 × 800)', width: 600, height: 800 },
    { key: 'panorama', label: 'Panorama 3:1 (1200 × 400)', width: 1200, height: 400 },
    { key: 'large', label: 'Large 4:3 (1200 × 900)', width: 1200, height: 900 },
  ] as const;
  /** the size as the person asked for it (the canvas itself is made a whole number of pieces wide and high, which can differ a little) */
  private readonly asked = signal({ width: 800, height: 600 });
  /** the standard numbers of pieces to choose from: whole columns and rows in the shape of the canvas (see `JigsawCut.pieceChoices`) */
  readonly pieceOptions = computed(() => JigsawCut.pieceChoices(this.asked().width, this.asked().height).map((c) => ({ ...c, key: `${c.columns}x${c.rows}` })));
  /** which standard size and number of pieces is chosen ('custom': typed by hand; a number of pieces is 'columns x rows') */
  readonly sizeChoice = signal<string>('standard');
  readonly pieceChoice = signal<string>('16x12');

  /** the name is needed, and starts empty (nothing is filled in for the person) */
  readonly name = signal('');
  /** who made the jigsaw (the name of the author, optional) */
  readonly author = signal('');
  readonly width = signal(800);
  readonly height = signal(600);
  /** how many pieces the picture is cut into (the grid size is worked out from it) */
  readonly pieceCount = signal(16 * 12);
  readonly gridSize = signal(50);
  /** how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never) */
  readonly snapPercent = signal(CanvasArea.DEFAULT_SNAP_PERCENT);
  readonly levels = SNAP_LEVELS;
  readonly level = computed(() => snapLevelOf(this.snapPercent()));

  /** A difficulty was chosen: the snap range is set to it. */
  chooseLevel(key: string): void {
    const percent = snapPercentOf(key);
    if (percent !== null) this.snapPercent.set(percent);
  }
  /** how thick the frame around the picture area is, in pixels (0: none) */
  /** the line round each piece: how thick in pixels, and what colour (#rrggbb) */
  readonly lineWidth = signal(CanvasArea.DEFAULT_LINE_WIDTH);
  readonly lineColor = signal(CanvasArea.DEFAULT_LINE_COLOR);
  /** the background colour of the picture area (#rrggbb) */
  readonly backColor = signal(CanvasArea.DEFAULT_BACK_COLOR);
  /** the thicknesses of the line to choose from, in words, and the one the line is closest to */
  readonly lineLevels = LINE_LEVELS;
  readonly lineLevel = computed(() => lineLevelOf(this.lineWidth()));

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
      ...(this.author().trim() ? { author: this.author().trim() } : {}),
      ...(this.file()?.name.trim() ? { pictureName: this.file()!.name.trim().slice(0, CANVAS_MAX_PICTURE_NAME) } : {}), // kept with the jigsaw as information
      width: this.width(),
      height: this.height(),
      gridSize: this.gridSize(),
      gridVisible: false, // the grid points were only for debugging: a new jigsaw does not show them
      placed: [],
      snapPercent: this.snapPercent(),
      lineWidth: this.lineWidth(),
      lineColor: this.lineColor(),
      backColor: this.backColor(),
      ...(storeWidth ? { storeWidth } : {}),
    };
  }

  /** why the settings are not allowed ('' when they are) */
  readonly problem = computed(() => new CanvasArea(this.settings()).error());

  /** the name is missing: said under the name field (the shared check talks about a canvas, this is a jigsaw) */
  readonly nameMissing = computed(() => !this.name().trim());

  /** the problem for the box above the buttons: the missing name is already said under its own field */
  readonly otherProblem = computed(() => (this.nameMissing() ? '' : this.problem()));

  readonly canSave = computed(() => !this.saving() && !this.problem() && !!this.file() && !!this.cut() && !this.stale());

  /**
   * The person gave a size or a number of pieces: the grid size is worked out from the number of pieces, and the canvas is made a whole number of pieces
   * wide and high (see `JigsawCut.layoutFor`). The number shown is the number of pieces that really comes out.
   */
  relayout(changed: 'width' | 'height' | 'pieces'): void {
    // the sides as the person typed them, each on its own: not what the canvas was made last time (that is a little different when the pieces are whole squares)
    if (changed === 'width') this.asked.update((a) => ({ ...a, width: this.width() }));
    if (changed === 'height') this.asked.update((a) => ({ ...a, height: this.height() }));
    if (changed !== 'pieces' && this.pieceChoice() !== 'custom') return this.choosePiecesNear(); // a standard number stays a standard number of the new shape
    const asked = this.asked();
    this.applyLayout(JigsawCut.layoutFor(asked.width, asked.height, this.pieceCount()));
  }

  private applyLayout(layout: PieceLayout): void {
    this.width.set(layout.width);
    this.height.set(layout.height);
    this.gridSize.set(layout.grid);
    this.pieceCount.set(layout.columns * layout.rows);
  }

  /** The shape changed: the standard number of pieces nearest to the one there was is taken from the numbers of the new shape. */
  private choosePiecesNear(): void {
    const wanted = this.pieceCount();
    const options = this.pieceOptions();
    if (!options.length) return this.pieceChoice.set('custom');
    const near = options.reduce((best, o) => (Math.abs(o.count - wanted) < Math.abs(best.count - wanted) ? o : best));
    this.choosePieces(near.key);
  }

  /** A standard size was chosen: the canvas gets that shape, and the grid is worked out again for the number of pieces. */
  chooseSize(key: string): void {
    this.sizeChoice.set(key);
    const preset = this.sizePresets.find((p) => p.key === key);
    if (!preset) return;
    this.asked.set({ width: preset.width, height: preset.height });
    this.width.set(preset.width);
    this.height.set(preset.height);
    if (this.pieceChoice() !== 'custom') return this.choosePiecesNear();
    this.relayout('pieces');
  }

  /** A standard number of pieces was chosen (columns × rows): the canvas is made to fit exactly that many pieces. */
  choosePieces(value: string): void {
    this.pieceChoice.set(value);
    const option = this.pieceOptions().find((o) => o.key === value);
    if (!option) return;
    const asked = this.asked();
    this.applyLayout(JigsawCut.layoutOf(asked.width, asked.height, option.columns, option.rows));
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
        graphics = await renderPieceGraphics(address, pieces, cutting.columns, cutting.rows, { width: this.lineWidth(), color: this.lineColor() });
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
