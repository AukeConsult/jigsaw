import { Component, ElementRef, HostListener, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { CanvasShape } from '../canvas-shape/canvas-shape';
import { CANVAS_OBJECT_DRAG_TYPE } from '../core/drag';
import { CanvasObject } from '../models/shared/canvas-object';
import { CANVAS_MIN_SIDE } from '../models/shared/canvas';
import { CanvasDiagram } from '../models/shared/diagram';
import { Box, Point, ResizeHandle, resizeHandlePositions } from '../models/shared/geometry';
import { EndId, PlacedArrow, PlacedFigure, PlacedObject } from '../models/shared/placed';

/** the mouse pointer over each resize handle */
const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

/** how far outside the figure its resize handles sit, so they do not cover its connection points (pixels) */
const HANDLE_OFFSET_PX = 9;

/** how far outside the edge of an arrow its handles for the width across sit (pixels) */
const ACROSS_OFFSET_PX = 14;

/**
 * The canvas area: the grid, the objects placed on it, what is picked, and the tools the person uses on them (drag in from the palette, move,
 * resize, change the width of an arrow, pick with a rectangle, change the layer, delete). What the objects do (snap to each other, follow each
 * other, resize as a group) is done by the model classes (`CanvasDiagram` and the placed objects); the board turns what the person does into
 * calls to them and keeps the result in `placed`, which the page saves.
 */
@Component({
  selector: 'app-canvas-board',
  imports: [CanvasShape],
  templateUrl: './canvas-board.html',
})
export class CanvasBoard {
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /** pixels between the grid points (0 = no grid), and whether they are drawn */
  readonly gridSize = input.required<number>();
  readonly gridVisible = input.required<boolean>();
  /** the canvas objects in the palette: a drop asks for one of them by its id */
  readonly objects = input<readonly CanvasObject[]>([]);

  /** the objects placed on the canvas (as they are stored) */
  readonly placed = model.required<PlacedObject[]>();

  /** What the person should be told: why an object could not be put there, or '' when there is nothing to tell any more. */
  readonly notice = output<string>();

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('area');

  /** the ids of the picked objects: one (picked by a click), or several (picked by dragging a rectangle around them) */
  readonly selection = signal<string[]>([]);
  /** the picked object when it is only one */
  readonly selectedId = computed(() => (this.selection().length === 1 ? this.selection()[0] : null));
  /** the rectangle that is being dragged to pick objects */
  readonly marquee = signal<Box | null>(null);
  /** something is being moved or dragged in: every connection point is shown, so it can be seen where it can be fastened */
  readonly connecting = signal(false);

  /** the placed objects, as the classes that work on them */
  private readonly diagram = computed(() => CanvasDiagram.from(this.placed(), this.width(), this.height()));
  /** for each placed object, the ids of its connection points that something is fastened to */
  readonly boundPoints = computed(() => this.diagram().boundPoints());
  /** the placed objects as they are drawn: an arrow as long as it is stretched, turned by its angle, with its box at its centre */
  readonly view = computed(() =>
    this.diagram().items.map((item) => {
      const length = item instanceof PlacedArrow ? item.length : item.object.width;
      const angle = item instanceof PlacedArrow ? item.angle : 0;
      return {
        p: item.data,
        layer: item.layer,
        object: length === item.object.width ? item.object : { ...item.object, width: length },
        left: item.centerX - length / 2,
        top: item.centerY - item.object.height / 2,
        rotate: angle ? `rotate(${angle}rad)` : null,
        bend: item instanceof PlacedArrow ? item.bend : 0,
      };
    }),
  );

  /** the layer the picked objects are on, when they are all on the same one (the canvas itself is layer 0) */
  readonly selectedLayer = computed(() => {
    const layers = new Set(this.selection().map((id) => this.diagram().get(id)?.layer));
    return layers.size === 1 ? ([...layers][0] ?? null) : null;
  });
  /** the layer a new object goes on: the last one */
  readonly lastLayer = computed(() => this.diagram().lastLayer());

  /** the box around several picked objects (null when only one or none is picked) */
  readonly groupBox = computed(() => (this.selection().length > 1 ? this.diagram().boundsOf(this.selection()) : null));

  /**
   * the resize handles, a little outside what they resize, with the mouse pointer for each: those of the picked figure (an arrow is stretched by its
   * ends instead), or those of the box around several picked objects
   */
  readonly handles = computed(() => {
    const picked = this.selectedId() ? this.diagram().get(this.selectedId() as string) : undefined;
    const box = this.groupBox() ?? (picked instanceof PlacedFigure ? picked.box() : null);
    if (!box) return [];
    return resizeHandlePositions(box).map((h) => ({ id: h.id, x: h.x + h.dx * HANDLE_OFFSET_PX, y: h.y + h.dy * HANDLE_OFFSET_PX, cursor: RESIZE_CURSORS[h.id] }));
  });

  /** the handles for the width across of the picked arrow: one on each side of its line, a little outside its edge */
  readonly acrossHandles = computed(() => {
    const id = this.selectedId();
    const picked = id ? this.diagram().get(id) : undefined;
    if (!(picked instanceof PlacedArrow)) return [];
    return ([1, -1] as const).map((side) => ({ side, ...picked.acrossHandle(side, ACROSS_OFFSET_PX) }));
  });

  /** the middle of the picked arrow, the third point you drag to bend it (null when the picked object is not an arrow) */
  readonly bendHandle = computed(() => {
    const id = this.selectedId();
    const picked = id ? this.diagram().get(id) : undefined;
    return picked instanceof PlacedArrow ? picked.middle() : null;
  });

  /** the placed object that is being moved: the pointer's distance from its centre (or from the end that was grabbed), and the canvas area it is in */
  private moving: { id: string; dx: number; dy: number; area: HTMLElement; end?: EndId } | null = null;

  /** the handle that is being dragged to resize the picked figure or objects, and the canvas area it is in */
  private resizing: { ids: string[]; handle: ResizeHandle; area: HTMLElement; gx: number; gy: number } | null = null;

  /** the handle that is being dragged to change the width across of the picked arrow: its side, where on the handle it was grabbed, and the canvas area */
  private acrossing: { id: string; side: 1 | -1; grabbed: number; area: HTMLElement } | null = null;

  /** the middle of an arrow that is being dragged to bend it: the arrow, where on the handle it was grabbed (as a bend), and the canvas area */
  private bending: { id: string; grabbed: number; area: HTMLElement } | null = null;

  /** where a rectangle drag on the empty canvas started */
  private marqueeStart: { x: number; y: number; area: HTMLElement } | null = null;

  constructor() {
    // draw the grid again whenever the size or the grid changes (a new width or height clears the canvas)
    effect(() => {
      const element = this.canvas()?.nativeElement;
      const width = this.width();
      const height = this.height();
      if (!element || !(width >= CANVAS_MIN_SIDE) || !(height >= CANVAS_MIN_SIDE)) return;
      element.width = width;
      element.height = height;
      if (this.gridVisible()) this.drawGrid(element, this.gridSize());
    });
    // what is picked has to be on the canvas: another canvas was opened, or an object was taken away
    effect(() => {
      const there = new Set(this.placed().map((p) => p.id));
      const picked = untracked(() => this.selection());
      const kept = picked.filter((id) => there.has(id));
      if (kept.length !== picked.length) this.selection.set(kept);
    });
  }

  /** the distance between the points the centres stick to: the grid, or a pixel when the grid is not shown */
  private get step(): number {
    return this.gridVisible() && this.gridSize() > 0 ? this.gridSize() : 1;
  }

  /** A grid point every `step` pixels, starting at 0,0: one small tile of the grid filled over the whole canvas. */
  private drawGrid(element: HTMLCanvasElement, step: number): void {
    const ctx = element.getContext('2d');
    if (!ctx || step <= 0) return;
    const tile = document.createElement('canvas');
    tile.width = tile.height = step;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) return;
    tileCtx.fillStyle = '#6c757d';
    const dot = step >= 4 ? 2 : 1;
    tileCtx.fillRect(0, 0, dot, dot);
    const pattern = ctx.createPattern(tile, 'repeat'); // a pattern is a snapshot: the tile must be drawn before this
    if (!pattern) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, element.width, element.height);
  }

  /** a drop is allowed over the canvas area (only when an object from the palette is dragged), and the points where it could be fastened are shown */
  allowDrop(event: DragEvent): void {
    if (event.dataTransfer?.types.includes(CANVAS_OBJECT_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      this.connecting.set(true);
    }
  }

  leaveDrop(): void {
    this.connecting.set(false);
  }

  /** An object dropped on the canvas area stays there: the diagram puts a copy of it where it was dropped (see `CanvasDiagram.place`). */
  drop(event: DragEvent): void {
    this.connecting.set(false);
    const id = event.dataTransfer?.getData(CANVAS_OBJECT_DRAG_TYPE);
    const source = this.objects().find((o) => o.id === id);
    if (!source) return;
    event.preventDefault();
    const { id: _id, createdAt: _createdAt, ...object } = source;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const result = this.diagram().place(object, event.clientX - rect.left, event.clientY - rect.top, this.step);
    if ('error' in result) {
      this.notice.emit(result.error);
      return;
    }
    this.placed.set(result.diagram.toData());
    this.selection.set([result.id]);
    this.notice.emit('');
  }

  /** Grab a placed object (mouse, pen or finger): it is picked, and follows the pointer until it is let go. An arrow grabbed at an end moves that end alone. */
  startMove(event: PointerEvent, item: PlacedObject): void {
    const handle = event.currentTarget as HTMLElement;
    const area = handle.parentElement as HTMLElement;
    const rect = area.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this.selection.set([item.id]);
    this.connecting.set(true); // every point is shown while something is moved: it can be seen where it can be fastened
    const placed = this.diagram().get(item.id);
    const end = this.diagram().grabbedEnd(item.id, x, y);
    // the distance from the pointer to what is moved, so it does not jump to the pointer
    const grabbed = placed instanceof PlacedArrow && end ? placed.endPoint(end) : { x: item.centerX, y: item.centerY };
    this.moving = { id: item.id, dx: x - grabbed.x, dy: y - grabbed.y, area, end };
    this.capture(handle, event);
  }

  /** What is grabbed follows the pointer: the diagram moves the figure, the arrow or the end of the arrow (see `CanvasDiagram`). */
  moveMove(event: PointerEvent): void {
    const moving = this.moving;
    if (!moving) return;
    const diagram = this.diagram();
    const placed = diagram.get(moving.id);
    if (!placed) return;
    const rect = moving.area.getBoundingClientRect();
    const x = event.clientX - rect.left - moving.dx;
    const y = event.clientY - rect.top - moving.dy;
    let next = diagram;
    if (!(placed instanceof PlacedArrow)) next = diagram.moveFigure(moving.id, x, y, this.step);
    else if (moving.end) next = diagram.moveArrowEnd(moving.id, moving.end, x, y, this.step);
    else next = diagram.moveArrow(moving.id, x, y, this.step);
    this.apply(next);
  }

  endMove(): void {
    this.moving = null;
    this.connecting.set(false);
  }

  /** Grab a resize handle of the picked figure, or of the box around the picked objects. */
  startResize(event: PointerEvent, handle: ResizeHandle): void {
    const ids = this.selection();
    if (!ids.length) return;
    const target = event.currentTarget as HTMLElement;
    const area = target.parentElement as HTMLElement;
    const rect = area.getBoundingClientRect();
    const at = this.handles().find((h) => h.id === handle);
    // where on the handle it was grabbed, so the handle does not jump to the pointer
    this.resizing = { ids, handle, area, gx: event.clientX - rect.left - (at?.x ?? 0), gy: event.clientY - rect.top - (at?.y ?? 0) };
    this.connecting.set(false);
    this.capture(target, event);
  }

  /** The handle follows the pointer: the diagram resizes the figure, or all the picked objects (see `CanvasDiagram.resizeFigure` and `resizeGroup`). */
  moveResize(event: PointerEvent): void {
    const resizing = this.resizing;
    if (!resizing) return;
    const rect = resizing.area.getBoundingClientRect();
    const diagram = this.diagram();
    // the handle sits a little outside the figure: the edge of the figure is that far from where the handle is
    const dx = resizing.handle.includes('e') ? 1 : resizing.handle.includes('w') ? -1 : 0;
    const dy = resizing.handle.includes('s') ? 1 : resizing.handle.includes('n') ? -1 : 0;
    const x = event.clientX - rect.left - resizing.gx - dx * HANDLE_OFFSET_PX;
    const y = event.clientY - rect.top - resizing.gy - dy * HANDLE_OFFSET_PX;
    this.apply(
      resizing.ids.length === 1
        ? diagram.resizeFigure(resizing.ids[0], resizing.handle, x, y, this.step)
        : diagram.resizeGroup(resizing.ids, resizing.handle, x, y, this.step),
    );
  }

  endResize(): void {
    this.resizing = null;
  }

  /** Grab one of the two handles for the width across of the picked arrow. */
  startAcross(event: PointerEvent, side: 1 | -1): void {
    const id = this.selectedId();
    const arrow = id ? this.diagram().get(id) : undefined;
    if (!id || !(arrow instanceof PlacedArrow)) return;
    const target = event.currentTarget as HTMLElement;
    const area = target.parentElement as HTMLElement;
    const rect = area.getBoundingClientRect();
    const at: Point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // how far the pointer is from what it should be if the handle were exactly under it, so the width does not jump
    this.acrossing = { id, side, grabbed: arrow.acrossAt(at, side, ACROSS_OFFSET_PX) - arrow.object.height, area };
    this.capture(target, event);
  }

  /** The handle follows the pointer: the arrow gets the width across that puts the handle there (see `CanvasDiagram.resizeArrowAcross`). */
  moveAcross(event: PointerEvent): void {
    const acrossing = this.acrossing;
    if (!acrossing) return;
    const diagram = this.diagram();
    const arrow = diagram.get(acrossing.id);
    if (!(arrow instanceof PlacedArrow)) return;
    const rect = acrossing.area.getBoundingClientRect();
    const size = arrow.acrossAt({ x: event.clientX - rect.left, y: event.clientY - rect.top }, acrossing.side, ACROSS_OFFSET_PX) - acrossing.grabbed;
    this.apply(diagram.resizeArrowAcross(acrossing.id, size));
  }

  endAcross(): void {
    this.acrossing = null;
  }

  /** Grab the middle of the picked arrow to bend it. */
  startBend(event: PointerEvent): void {
    const id = this.selectedId();
    const arrow = id ? this.diagram().get(id) : undefined;
    if (!id || !(arrow instanceof PlacedArrow)) return;
    const target = event.currentTarget as HTMLElement;
    const area = target.parentElement as HTMLElement;
    const rect = area.getBoundingClientRect();
    // how far the pointer is from the middle of the curve, so the arrow does not jump when it is grabbed off centre
    this.bending = { id, grabbed: arrow.sidewaysOf({ x: event.clientX - rect.left, y: event.clientY - rect.top }) - arrow.bend, area };
    this.capture(target, event);
  }

  /** The middle follows the pointer: the arrow is bent so that its middle is there (see `CanvasDiagram.bendArrow`). */
  moveBend(event: PointerEvent): void {
    const bending = this.bending;
    if (!bending) return;
    const diagram = this.diagram();
    const arrow = diagram.get(bending.id);
    if (!(arrow instanceof PlacedArrow)) return;
    const rect = bending.area.getBoundingClientRect();
    this.apply(diagram.bendArrow(bending.id, arrow.sidewaysOf({ x: event.clientX - rect.left, y: event.clientY - rect.top }) - bending.grabbed));
  }

  endBend(): void {
    this.bending = null;
  }

  /** picks only this object */
  select(id: string): void {
    this.selection.set([id]);
  }

  /** Dragging on the empty canvas picks the objects the rectangle touches (the objects stop their own pointer events, so this is only the empty canvas). */
  startMarquee(event: PointerEvent): void {
    const area = event.currentTarget as HTMLElement;
    const rect = area.getBoundingClientRect();
    this.marqueeStart = { x: event.clientX - rect.left, y: event.clientY - rect.top, area };
    this.selection.set([]);
    this.capture(area, event);
  }

  moveMarquee(event: PointerEvent): void {
    const start = this.marqueeStart;
    if (!start) return;
    const rect = start.area.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const box: Box = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    this.marquee.set(box);
    this.selection.set(this.diagram().itemsIn(box));
  }

  endMarquee(): void {
    this.marqueeStart = null;
    this.marquee.set(null);
  }

  /** puts the picked objects on this layer (see `CanvasDiagram.setLayer`) */
  setLayer(value: string): void {
    const layer = Number(value);
    if (!this.selection().length || value.trim() === '' || !Number.isFinite(layer)) return;
    this.apply(this.diagram().setLayer(this.selection(), layer));
  }

  /**
   * The Delete key (or Backspace) removes the picked objects, when the person is not typing in a field. The canvas is saved without them by the
   * autosave, which replaces the whole saved canvas: nothing of them is left in the database.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return; // deleting text, not objects
    if (!this.selection().length) return;
    event.preventDefault();
    this.removeSelected();
  }

  /** removes the picked objects; an arrow that was fastened to a removed figure is free again */
  removeSelected(): void {
    const ids = this.selection();
    if (!ids.length) return;
    this.placed.set(this.diagram().removeAll(ids).toData());
    this.selection.set([]);
  }

  /** keeps the result of a tool when the diagram changed (the diagram gives back itself when nothing changed) */
  private apply(next: CanvasDiagram): void {
    if (next !== this.diagram()) this.placed.set(next.toData());
  }

  /** keeps getting the pointer moves when the pointer leaves the element it was pressed on */
  private capture(element: HTMLElement, event: PointerEvent): void {
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      /* not an active pointer: the moves are still received while it is over the element */
    }
  }
}
