import { Component, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { SaveState } from '../core/autosave';
import { CANVAS_MAX_GRID, CANVAS_MAX_NAME, CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, CanvasArea, CanvasSpec } from '../models/shared/canvas';

/**
 * The settings of the open canvas (name, size, grid), how it is saved, and the list of the saved canvases to open or delete.
 * It keeps nothing of the canvas itself: the settings are two-way bound to the page, which saves them, and the page is told what the person
 * does (new canvas, open one, delete one).
 */
@Component({
  selector: 'app-canvas-panel',
  imports: [FormsModule, TranslocoDirective],
  templateUrl: './canvas-panel.html',
})
export class CanvasPanel {
  // the settings of the open canvas
  readonly name = model.required<string>();
  readonly width = model.required<number>();
  readonly height = model.required<number>();
  readonly gridSize = model.required<number>();
  readonly gridVisible = model.required<boolean>();

  /** why the settings are not allowed ('' when they are) */
  readonly error = input('');
  /** how the changes are being saved, and the saved canvas that is open (null for a new one) */
  readonly saveState = input<SaveState>('idle');
  readonly currentId = input<string | null>(null);
  /** something to tell the person (a canvas was deleted, something could not be done) */
  readonly message = input<{ kind: 'success' | 'danger'; text: string } | null>(null);
  readonly saved = input<readonly CanvasSpec[]>([]);
  /** the width and height are kept a whole number of grid steps (for a canvas whose grid points are half a step in from the edge) */
  readonly fitToGrid = input(false);
  /** the Debug button is shown (the jigsaw), and whether debug is on: it shows the grid numbers */
  readonly debugAllowed = input(false);
  readonly debug = model(false);
  /** a title shown at the top of the panel (none: no title) */
  readonly heading = input('');
  /** the panel is a sidebar docked at the left edge: it has no frame of its own, the page gives it the border */
  readonly docked = input(false);
  /** the canvas can have a background picture (the jcanvas): whether it has one, and what the person picks or takes away */
  readonly pictureAllowed = input(false);
  readonly hasPicture = input(false);
  readonly pickPicture = output<File>();
  readonly removePicture = output<void>();
  /** the person wants the picture cut into jigsaw pieces */
  readonly cutPicture = output<void>();
  /** the jigsaw has pieces: they can be shuffled all over again */
  readonly hasPieces = input(false);
  /** the pieces could not be saved (they are tried again): said under the settings */
  readonly piecesFailed = input(false);
  /** the game setting: how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never) */
  readonly snapPercent = model(50);
  /** a jigsaw: the person gives the number of pieces and the grid size is worked out from it (the grid size is not asked for) */
  readonly piecesMode = input(false);
  readonly pieceCount = model(0);
  /** how many pieces across and down the grid makes (for the line that tells the grid size) */
  readonly pieceGrid = input<{ columns: number; rows: number }>({ columns: 0, rows: 0 });
  /** the size (`size`) or the number of pieces (`pieces`) was changed: the grid size and the size of the canvas are worked out again */
  readonly layoutChange = output<'size' | 'pieces'>();
  /** how many pieces are matched, of how many (the state of the game; none: no pieces) */
  readonly matched = input<{ count: number; total: number } | null>(null);
  readonly resetPieces = output<void>();

  /** a file was chosen (the choice is cleared, so the same file can be chosen again) */
  picked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.pickPicture.emit(file);
  }

  readonly newCanvas = output<void>();
  readonly openCanvas = output<CanvasSpec>();
  readonly deleteCanvas = output<CanvasSpec>();

  /** the saved canvas whose Delete button was pressed and waits for "Yes" (deleting is for good) */
  readonly confirmingId = signal<string | null>(null);

  readonly minSide = CANVAS_MIN_SIDE;
  readonly maxSide = CANVAS_MAX_SIDE;
  readonly maxName = CANVAS_MAX_NAME;
  readonly maxGrid = CANVAS_MAX_GRID;

  /** When a setting is done (not on every key): the size is made a whole number of grid steps, when it has to be (see `CanvasArea.fittedSide`). */
  fit(): void {
    if (this.piecesMode()) return void this.layoutChange.emit('size'); // the grid size follows from the number of pieces
    if (!this.fitToGrid()) return;
    const grid = this.gridSize();
    this.width.set(CanvasArea.fittedSide(this.width(), grid));
    this.height.set(CanvasArea.fittedSide(this.height(), grid));
  }

  confirmDelete(item: CanvasSpec): void {
    this.confirmingId.set(null);
    this.deleteCanvas.emit(item);
  }
}

