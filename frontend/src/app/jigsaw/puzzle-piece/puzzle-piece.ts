import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { JigsawCut } from '../../models/shared/jigsaw';
import { PiecePlace } from '../../models/shared/placed';
import { PieceStyle } from '../../models/shared/play-look';

/**
 * Draws one piece of a jigsaw: its outline, with the part of the picture that belongs to it. The picture covers the whole picture area (`columns` × `rows`
 * pieces of `size` pixels), so a piece shows the cell (col, row) of it wherever the piece lies. The tabs reach outside the square of the piece.
 */
@Component({
  selector: 'app-puzzle-piece',
  templateUrl: './puzzle-piece.html',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush, // every input is a signal: a piece is looked at again only when one of its own inputs changes, not at every move of another piece
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
  /** the piece lies on its own place (it is drawn like the others, with the line of the jigsaw) */
  readonly matched = input(false);
  /** the line round the piece: how thick (in pixels) and what colour (#rrggbb); none: the usual line */
  readonly lineWidth = input<number | null>(null);
  readonly lineColor = input<string | null>(null);
  /** the piece has just clicked into place: it blinks */
  readonly blinking = input(false);
  /** how the piece is drawn (the player's choice, `PIECE_STYLES`) */
  readonly skin = input<PieceStyle>('classic');
  /** a light round it while it is held */
  readonly glow = input(false);
  /** a flash round it that starts so many milliseconds from now (none: no flash) */
  readonly flash = input<number | null>(null);

  readonly path = computed(() => JigsawCut.path(this.size(), this.piece()));
  /** the number of the grid point the piece belongs on in the picture: the points are numbered 1, 2, 3 ... along each row, as they are on the picture area */
  readonly number = computed(() => this.piece().row * this.columns() + this.piece().col + 1);
  /** how big the number is drawn, in pixels (it has to fit on a small piece and not be huge on a big one) */
  readonly numberSize = computed(() => Math.max(8, Math.min(18, Math.round(this.size() * 0.3))));
  /** the picture is cut by this outline (an id of its own, as every piece is in the same page) */
  readonly clipId = computed(() => `clip-${this.id()}`);
  readonly grainId = computed(() => `grain-${this.id()}`);
  /** the two bands of shine across a glossy piece, from above its square to below it (the tabs too) */
  readonly gloss = computed(() => {
    const s = this.size();
    const band = (top: number, width: number) => [[top, -0.3], [top + width, -0.3], [top + width - 0.75, 1.3], [top - 0.75, 1.3]].map(([x, y]) => `${x * s},${y * s}`).join(' ');
    return { wide: band(-0.06, 0.475), narrow: band(0.9, 0.11), shade: band(1.7, 0.4) }; // the last is a faint shade low to the right, so a light part of a picture shows the shine too
  });
}
