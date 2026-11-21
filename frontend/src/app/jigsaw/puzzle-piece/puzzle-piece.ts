import { Component, computed, input } from '@angular/core';
import { JigsawCut } from '../../models/shared/jigsaw';
import { PiecePlace } from '../../models/shared/placed';

/**
 * Draws one piece of a jigsaw: its outline, with the part of the picture that belongs to it. The picture covers the whole canvas (`columns` × `rows`
 * pieces of `size` pixels), so a piece shows the cell (col, row) of it wherever the piece lies. The tabs reach outside the square of the piece.
 */
@Component({
  selector: 'app-puzzle-piece',
  templateUrl: './puzzle-piece.html',
})
export class PuzzlePiece {
  readonly id = input.required<string>();
  readonly piece = input.required<PiecePlace>();
  /** the side of the piece in pixels */
  readonly size = input.required<number>();
  /** how many pieces the picture is cut into across and down */
  readonly columns = input.required<number>();
  readonly rows = input.required<number>();
  /** the address of the picture (none: the piece is a plain grey one) */
  readonly picture = input<string | null>(null);
  /** whether the number of its grid point is drawn on it (only in debug) */
  readonly numbered = input(false);
  /** the piece lies on its own place: it is drawn with a green outline */
  readonly matched = input(false);
  /** the line round the piece: how thick (in pixels) and what colour (#rrggbb); none: the usual line */
  readonly lineWidth = input<number | null>(null);
  readonly lineColor = input<string | null>(null);
  /** the piece has just clicked into place: it blinks */
  readonly blinking = input(false);

  readonly path = computed(() => JigsawCut.path(this.size(), this.piece()));
  /** the number of the grid point the piece belongs on in the picture: the points are numbered 1, 2, 3 ... along each row, as they are on the canvas */
  readonly number = computed(() => this.piece().row * this.columns() + this.piece().col + 1);
  /** how big the number is drawn, in pixels (it has to fit on a small piece and not be huge on a big one) */
  readonly numberSize = computed(() => Math.max(8, Math.min(18, Math.round(this.size() * 0.3))));
  /** the picture is cut by this outline (an id of its own, as every piece is in the same page) */
  readonly clipId = computed(() => `clip-${this.id()}`);
}
