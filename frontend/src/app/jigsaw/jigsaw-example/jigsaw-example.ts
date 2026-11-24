import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PuzzlePiece } from '../puzzle-piece/puzzle-piece';
import { JigsawCut } from '../../models/shared/jigsaw';
import { PiecePlace } from '../../models/shared/placed';

/** How much room the back colour has round the picture, as a share of a piece. */
const MARGIN = 1.2;
/** The pieces that are lifted out of the picture to show their shape and the back colour behind them: where they are (as a share of the columns and rows), and how far they are lifted (a share of a piece). */
const LIFTED: readonly { across: number; down: number; dx: number; dy: number }[] = [
  { across: 0.3, down: 0.4, dx: -0.55, dy: -0.45 },
  { across: 0.65, down: 0.3, dx: 0.5, dy: -0.6 },
  { across: 0.5, down: 0.7, dx: 0.35, dy: 0.6 },
];
/** What the board of a jigsaw keeps of the window, to guess how big it will draw the picture (the picture gets 2/3 of the width beside the store; the menu and the sidebar take some height). */
const BOARD_WIDTH_SHARE = 0.6;
const BOARD_HEIGHT_LEFT_PX = 160;
/** The board draws a jigsaw at most this many times its size (see `JigsawBoard`). */
const BOARD_SCALE_MAX = 4;
/** The most room the example gets on the page, in pixels (it is as big as it can be in this and in the width of the page). */
const MAX_HEIGHT_PX = 340;

/**
 * An example of the jigsaw before it is made: the cut picture put together from the pieces the jigsaw will have (their number and shape, drawn as on the board
 * with the line and the colours chosen), on the back colour inside the border, with a few pieces lifted out to show their shape. The shape of each piece is
 * chosen by chance, so this is an example, not the pieces the jigsaw will get. The example is as wide as the room it is in, and the lines keep their thickness
 * on the screen.
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
  /** the line round the pieces and the border, and the colour behind the pieces */
  readonly lineWidth = input.required<number>();
  readonly lineColor = input.required<string>();
  readonly backColor = input.required<string>();

  /** plain: just the cut picture as it will be, as wide as the room, with no pieces lifted out and no back colour or border round it (the form of a new jigsaw shows it in its card) */
  readonly plain = input(false);

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

  /** the room the back colour has round the picture, in the pixels of the jigsaw */
  private readonly margin = computed(() => (this.plain() ? 0 : this.size() * MARGIN));

  /** the pieces to draw: each with where it lies (the lifted ones are moved out of the picture, and drawn last, over the others) */
  readonly pieces = computed(() => {
    const all = (this.cut()?.placed ?? []).flatMap((p) => (p.piece ? [{ id: p.id, piece: p.piece as PiecePlace }] : []));
    const lifted = new Map<string, { dx: number; dy: number }>();
    if (!this.plain() && this.columns() >= 5 && this.rows() >= 4) {
      for (const l of LIFTED) {
        const col = Math.min(this.columns() - 2, Math.max(1, Math.floor(this.columns() * l.across)));
        const row = Math.min(this.rows() - 2, Math.max(1, Math.floor(this.rows() * l.down)));
        const found = all.find((p) => p.piece.col === col && p.piece.row === row);
        if (found) lifted.set(found.id, { dx: l.dx * this.size(), dy: l.dy * this.size() });
      }
    }
    const placed = all.map((p) => {
      const lift = lifted.get(p.id);
      const margin = this.margin();
      return {
        ...p,
        left: margin + p.piece.col * this.size() + (lift?.dx ?? 0),
        top: margin + p.piece.row * this.size() + (lift?.dy ?? 0),
        lifted: !!lift,
      };
    });
    return [...placed.filter((p) => !p.lifted), ...placed.filter((p) => p.lifted)];
  });

  /** the size of the example in the pixels of the jigsaw: the picture and the room round it */
  readonly area = computed(() => ({
    width: Math.max(1, this.columns() * this.size() + 2 * this.margin()),
    height: Math.max(1, this.rows() * this.size() + 2 * this.margin()),
  }));

  /** how many screen pixels a pixel of the jigsaw is drawn as: the example fits the room and is not too high */
  readonly scale = computed(() => {
    const area = this.area();
    if (this.plain()) return this.room() > 0 ? this.room() / area.width : 0;
    return this.room() > 0 ? Math.min(this.room() / area.width, MAX_HEIGHT_PX / area.height) : 0;
  });

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
