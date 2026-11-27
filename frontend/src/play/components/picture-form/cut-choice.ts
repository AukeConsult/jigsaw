import { computed, signal } from '@angular/core';
import { SIZE_PRESETS } from '../../../app/jigsaw/size-presets';
import { SNAP_LEVELS, snapLevelOf, snapPercentOf } from '../../../app/jigsaw/snap-level';
import { CutShape, CutShapes } from '../../../app/models/shared/cut-shape';
import { JigsawCut, PieceLayout, pieceGrid } from '../../../app/models/shared/jigsaw';
import { JigsawSettings } from '../../../app/models/shared/jigsaw-settings';

/**
 * How a **ready jigsaw** is cut into pieces, as it is chosen in the form (the size of the picture area is the one the form asks for, `fitTo`, the same as for a picture): how many pieces, how easy it is to click a piece into place, the shape of the pieces, and whether a clock counts the rounds. The picture area is
 * made a whole number of pieces wide and high (`JigsawCut.layoutOf`), so the size and the grid that come out can differ a little from the size asked for. (A picture has none of this: each round chooses its own cut.)
 */
export class CutChoice {
  readonly levels = SNAP_LEVELS;

  /** the size as it was asked for (the picture area itself is made to fit whole pieces) */
  private readonly asked = signal<{ width: number; height: number }>({ width: SIZE_PRESETS[0].width, height: SIZE_PRESETS[0].height });
  /** the standard numbers of pieces for this shape, as columns × rows (`JigsawCut.pieceChoices`) */
  readonly pieceOptions = computed(() => JigsawCut.pieceChoices(this.asked().width, this.asked().height).map((c) => ({ ...c, key: `${c.columns}x${c.rows}` })));
  readonly pieceChoice = signal<string>('16x12');

  /** the picture area as it comes out, and the grid it is cut by */
  readonly width = signal<number>(SIZE_PRESETS[0].width);
  readonly height = signal<number>(SIZE_PRESETS[0].height);
  readonly gridSize = signal(50);
  readonly pieceInfo = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size */
  readonly snapPercent = signal(JigsawSettings.DEFAULT_SNAP_PERCENT);
  readonly level = computed(() => snapLevelOf(this.snapPercent()));
  /** a clock counts how long each round takes */
  readonly timed = signal(true);
  /** what the tabs of the pieces look like */
  readonly cutShape = signal<CutShape>('classic');

  constructor() {
    this.choosePieces(this.pieceChoice());
  }

  /** A saved jigsaw is changed: the choices show what it has. */
  show(saved: { width: number; height: number; gridSize: number; snapPercent?: number; timed?: boolean; cutShape?: CutShape }): void {
    const { width, height, gridSize } = saved;
    const grid = pieceGrid(width, height, gridSize);
    this.asked.set({ width, height });
    this.pieceChoice.set(`${grid.columns}x${grid.rows}`);
    this.width.set(width);
    this.height.set(height);
    this.gridSize.set(gridSize);
    this.snapPercent.set(saved.snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT);
    this.timed.set(saved.timed !== false);
    this.cutShape.set(CutShapes.of(saved.cutShape));
  }

  /** This size is asked for: the picture area gets that shape, and the standard number of pieces nearest to the one there was is kept. */
  fitTo({ width, height }: { width: number; height: number }): void {
    const before = this.pieceInfo().columns * this.pieceInfo().rows;
    this.asked.set({ width, height });
    const options = this.pieceOptions();
    const near = options.length ? options.reduce((best, o) => (Math.abs(o.count - before) < Math.abs(best.count - before) ? o : best)) : null;
    if (near) this.choosePieces(near.key);
    else this.applyLayout(JigsawCut.layoutFor(width, height, before));
  }

  /** A standard number of pieces was chosen (columns × rows): the picture area is made to fit exactly that many pieces. */
  choosePieces(key: string): void {
    const option = this.pieceOptions().find((o) => o.key === key);
    if (!option) return;
    this.pieceChoice.set(key);
    const asked = this.asked();
    this.applyLayout(JigsawCut.layoutOf(asked.width, asked.height, option.columns, option.rows));
  }

  /** A difficulty was chosen: the snap range is set to it. */
  chooseLevel(key: string): void {
    const percent = snapPercentOf(key);
    if (percent !== null) this.snapPercent.set(percent);
  }

  private applyLayout(layout: PieceLayout): void {
    this.width.set(layout.width);
    this.height.set(layout.height);
    this.gridSize.set(layout.grid);
  }
}
