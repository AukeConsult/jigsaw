import { Component, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { SaveState } from '../../core/autosave';
import { CANVAS_MAX_GRID, CANVAS_MAX_NAME, CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, CanvasSpec } from '../../models/shared/canvas';

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

  readonly newCanvas = output<void>();
  readonly openCanvas = output<CanvasSpec>();
  readonly deleteCanvas = output<CanvasSpec>();

  /** the saved canvas whose Delete button was pressed and waits for "Yes" (deleting is for good) */
  readonly confirmingId = signal<string | null>(null);

  readonly minSide = CANVAS_MIN_SIDE;
  readonly maxSide = CANVAS_MAX_SIDE;
  readonly maxName = CANVAS_MAX_NAME;
  readonly maxGrid = CANVAS_MAX_GRID;

  confirmDelete(item: CanvasSpec): void {
    this.confirmingId.set(null);
    this.deleteCanvas.emit(item);
  }
}
