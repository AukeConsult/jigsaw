import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CanvasShape } from '../canvas-shape/canvas-shape';
import { CANVAS_OBJECT_DRAG_TYPE } from '../core/drag';
import { CanvasObject } from '../models/shared/canvas-object';

/** The canvas objects that can be put on a canvas (made on the Objects page): drag one onto the canvas. It keeps nothing, the canvas board takes the drop. */
@Component({
  selector: 'app-object-palette',
  imports: [RouterLink, CanvasShape],
  templateUrl: './object-palette.html',
})
export class ObjectPalette {
  readonly objects = input<readonly CanvasObject[]>([]);
  /** the objects could not be loaded */
  readonly failed = input(false);

  /** the object being dragged: the drop on the canvas asks which one it is */
  startDrag(event: DragEvent, object: CanvasObject): void {
    event.dataTransfer?.setData(CANVAS_OBJECT_DRAG_TYPE, object.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
}
