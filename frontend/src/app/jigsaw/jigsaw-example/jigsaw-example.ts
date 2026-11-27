import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PuzzlePiece } from '../puzzle-piece/puzzle-piece';
import { JigsawCut } from '../../models/shared/jigsaw';
import { PiecePlace } from '../../models/shared/placed';

/** What the board of a jigsaw keeps of the window, to guess how big it will draw the picture (the picture gets 2/3 of the width beside the store; what is round the board takes some height). */
const BOARD_WIDTH_SHARE = 0.6;
const BOARD_HEIGHT_LEFT_PX = 160;
/** The board draws a jigsaw at most this many times its size (see `JigsawBoard`). */
const BOARD_SCALE_MAX = 4;

/**
 * An example of the jigsaw before it is made, shown in the form of a picture: the cut picture put together from the pieces the jigsaw will have (their number and shape, drawn as on the board with its line). The shape of
 * each piece is chosen by chance, so this is an example, not the pieces the jigsaw will get. The example is as wide as the room it is in, and the lines keep their thickness on the screen.
 */
@Component({
  selector: 'app-jigsaw-example',
  imports: [PuzzlePiece, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawExample')],
  templateUrl: './jigsaw-example.html',
})
export class JigsawExample {
  /** the cut picture (in the shape of the picture area) */
  readonly picture = input.required<string>();
  /** the picture area: its size and the grid that cuts it into pieces */
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly gridSize = input.required<number>();
  /** the line round the pieces */
  readonly lineWidth = input.required<number>();
  readonly lineColor = input.required<string>();

  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  /** how wide the room for the example is, in pixels */
  private readonly room = signal(0);

  /** the pieces the settings give (the edges are drawn by chance, and only again when the size or the grid changes) */
  private readonly cut = computed(() => {
    const result = JigsawCut.cut(this.width(), this.height(), this.gridSize());
    return 'error' in result ? null : result;
  });

  readonly columns = computed(() => this.cut()?.columns ?? 0);
  readonly rows = computed(() => this.cut()?.rows ?? 0);
  readonly size = computed(() => this.gridSize());

  /** the pieces to draw, each with where it lies */
  readonly pieces = computed(() =>
    (this.cut()?.placed ?? []).flatMap((p) => {
      const piece = p.piece as PiecePlace | undefined;
      return piece ? [{ id: p.id, piece, left: piece.col * this.size(), top: piece.row * this.size() }] : [];
    }),
  );

  /** the size of the example in the pixels of the jigsaw */
  readonly area = computed(() => ({ width: Math.max(1, this.columns() * this.size()), height: Math.max(1, this.rows() * this.size()) }));

  /** how many screen pixels a pixel of the jigsaw is drawn as: the example is as wide as the room */
  readonly scale = computed(() => (this.room() > 0 ? this.room() / this.area().width : 0));

  /**
   * How thick the line is drawn in the example, in pixels on the screen. The line of the board has the same thickness on the screen whatever the window, and the
   * example is smaller than the board, so its line is thinner in the same proportion: the pieces look as thick-lined as they will on the board.
   */
  readonly drawnLine = computed(() => {
    const example = this.scale();
    const area = { width: Math.max(1, this.width()), height: Math.max(1, this.height()) };
    const board = Math.min(BOARD_SCALE_MAX, (window.innerWidth * BOARD_WIDTH_SHARE) / area.width, Math.max(100, window.innerHeight - BOARD_HEIGHT_LEFT_PX) / area.height);
    return example > 0 && board > 0 ? this.lineWidth() * Math.min(1, example / board) : this.lineWidth();
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host().nativeElement;
      const watch = new ResizeObserver(() => this.room.set(element.clientWidth));
      watch.observe(element);
      this.room.set(element.clientWidth);
      destroyRef.onDestroy(() => watch.disconnect());
    });
  }
}
