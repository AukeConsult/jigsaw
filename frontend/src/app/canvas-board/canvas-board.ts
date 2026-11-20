import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, afterNextRender, HostListener, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { CanvasShape } from '../canvas-shape/canvas-shape';
import { PuzzlePiece } from '../puzzle-piece/puzzle-piece';
import { CANVAS_OBJECT_DRAG_TYPE } from '../core/drag';
import { CanvasObject } from '../models/shared/canvas-object';
import { CANVAS_MIN_SIDE, CanvasArea } from '../models/shared/canvas';
import { CanvasDiagram } from '../models/shared/diagram';
import { JigsawPieces, pieceGrid } from '../models/shared/jigsaw';
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
/** Grid points closer than this are not numbered: the numbers would run into each other. */
const MIN_NUMBERED_STEP_PX = 20;
const HANDLE_OFFSET_PX = 9;
/** What is kept free below the jigsaw pieces area at the bottom of the screen, in pixels. */
const SCREEN_MARGIN_PX = 8;
/** The helper picture is shown at this share of the size of the picture to begin with, and can be made as small as the first and as big as the second. */
const HELPER_SCALE_START = 0.25;
const HELPER_SCALE_MIN = 0.1;
const HELPER_SCALE_MAX = 0.5;
/** The space (Bootstrap's p-2) between the edge of the pieces area and what is in it, in pixels. */
const AREA_PADDING_PX = 8;

/** how far outside the edge of an arrow its handles for the width across sit (pixels) */
const ACROSS_OFFSET_PX = 14;

/** The three points that shape a bent arrow, from its start to its end, and the bends of an arrow that is not bent. */
const BEND_POINTS = ['start', 'middle', 'end'] as const;
type BendPoint = (typeof BEND_POINTS)[number];
const NOT_BENT = [0, 0, 0] as const;

/**
 * The canvas area: the grid, the objects placed on it, what is picked, and the tools the person uses on them (drag in from the palette, move,
 * resize, change the width of an arrow, pick with a rectangle, change the layer, delete). What the objects do (snap to each other, follow each
 * other, resize as a group) is done by the model classes (`CanvasDiagram` and the placed objects); the board turns what the person does into
 * calls to them and keeps the result in `placed`, which the page saves.
 */
@Component({
  selector: 'app-canvas-board',
  imports: [CanvasShape, PuzzlePiece, NgTemplateOutlet],
  templateUrl: './canvas-board.html',
})
export class CanvasBoard {
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /** pixels between the grid points (0 = no grid), and whether they are drawn */
  readonly gridSize = input.required<number>();
  readonly gridVisible = input.required<boolean>();
  /** whether the grid points are half a step in from the canvas edge (the first row and column of points are half a step from the border, as the last ones are from the far border); the jigsaw does this */
  readonly gridInset = input(false);
  /** whether each grid point is given a number (1, 2, 3 ... row by row from the top left, the points that are not drawn left out); only when the points are far enough apart to read it */
  readonly numberPoints = input(false);
  /** a jigsaw: how wide the store frame beside the canvas is (0: none); the canvas and the frame together are the jigsaw pieces area, where a piece can be moved anywhere */
  readonly storeWidth = input(0);
  /** a banner above the jigsaw pieces area, with a switch that shows or hides the helper picture (the whole picture at a quarter of its width and height) */
  readonly helperBanner = input(false);
  /** whether the helper picture is shown (on to begin with) */
  readonly helper = signal(true);
  /** where the floating frame of the helper picture is on the window (its top left corner, in pixels): it can be moved by its title */
  readonly helperFrame = signal({ x: Math.max(8, window.innerWidth - 260), y: 70 });
  /** how big the helper picture is, as a share of the size of the picture (from 1/10 to 1/2) */
  readonly helperScale = signal(HELPER_SCALE_START);
  /** the corner of the frame that is being dragged to change the size: where the pointer was, and the scale then */
  private helperSizing: { x: number; scale: number } | null = null;

  /** Grab the corner of the helper picture frame to change its size. */
  startHelperSize(event: PointerEvent): void {
    this.helperSizing = { x: event.clientX, scale: this.helperScale() };
    this.capture(event.currentTarget as HTMLElement, event);
    event.stopPropagation();
  }

  /** The picture is as wide as the corner has been pulled (the picture keeps its shape), at least 1/10 and at most 1/2 of the size of the picture. */
  moveHelperSize(event: PointerEvent): void {
    const sizing = this.helperSizing;
    if (!sizing || !(this.width() > 0)) return;
    const wanted = (sizing.scale * this.width() + (event.clientX - sizing.x)) / this.width();
    this.helperScale.set(Math.min(HELPER_SCALE_MAX, Math.max(HELPER_SCALE_MIN, wanted)));
  }

  endHelperSize(): void {
    this.helperSizing = null;
  }

  /** the frame that is being moved: where on its title it was grabbed */
  private helperGrab: { dx: number; dy: number } | null = null;

  /** Grab the title of the helper picture frame to move it. */
  startHelperFrame(event: PointerEvent): void {
    const frame = this.helperFrame();
    this.helperGrab = { dx: event.clientX - frame.x, dy: event.clientY - frame.y };
    this.capture(event.currentTarget as HTMLElement, event);
  }

  /** The frame follows the pointer, and stays on the window (its title can always be reached). */
  moveHelperFrame(event: PointerEvent): void {
    const grab = this.helperGrab;
    if (!grab) return;
    this.helperFrame.set({
      x: Math.min(Math.max(event.clientX - grab.dx, 0), window.innerWidth - 80),
      y: Math.min(Math.max(event.clientY - grab.dy, 0), window.innerHeight - 40),
    });
  }

  endHelperFrame(): void {
    this.helperGrab = null;
  }
  /** the jigsaw pieces area is as high as what is left of the visible screen, from where it starts to the bottom (the jigsaw does this) */
  readonly fillScreen = input(false);
  /** its height in pixels, when it fills the screen */
  readonly areaHeight = signal<number | null>(null);
  /** whether the layer field and the Remove picked button are shown above the canvas (the jigsaw has neither; the Delete key still removes what is picked) */
  readonly tools = input(true);
  /** the address of a picture to show behind the grid and the objects, covering the canvas (the jcanvas background) */
  readonly picture = input<string | null>(null);
  /** the canvas objects in the palette: a drop asks for one of them by its id */
  readonly objects = input<readonly CanvasObject[]>([]);

  /** the objects placed on the canvas (as they are stored) */
  readonly placed = model.required<PlacedObject[]>();

  /** What the person should be told: why an object could not be put there, or '' when there is nothing to tell any more. */
  readonly notice = output<string>();

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('area');
  /** the whole board: it keeps the pointer while something is moved, so the move goes on when the object changes place (canvas to store frame) */
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  /** the inside of the store frame (it moves up and down when the frame is scrolled) */
  private readonly storeInner = viewChild<ElementRef<HTMLElement>>('storeInner');

  /** the ids of the picked objects: one (picked by a click), or several (picked by dragging a rectangle around them) */
  readonly selection = signal<string[]>([]);
  /** the picked object when it is only one */
  readonly selectedId = computed(() => (this.selection().length === 1 ? this.selection()[0] : null));
  /** the rectangle that is being dragged to pick objects */
  readonly marquee = signal<Box | null>(null);
  /** something is being moved or dragged in: every connection point is shown, so it can be seen where it can be fastened */
  readonly connecting = signal(false);

  /** the placed objects, as the classes that work on them */
  /** the store frame beside the canvas, where the pieces of a jigsaw wait (null: none) */
  readonly store = computed(() => CanvasArea.storeFrame(this.width(), this.height(), this.gridSize(), this.storeWidth()));
  private readonly diagram = computed(() => {
    const extent = CanvasArea.extent(this.width(), this.height(), this.gridSize(), this.storeWidth()); // the whole jigsaw pieces area
    return CanvasDiagram.from(this.placed(), extent.width, extent.height);
  });
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
        bends: item instanceof PlacedArrow ? item.bends : NOT_BENT,
        piece: item instanceof PlacedFigure ? (item.data.piece ?? null) : null,
        matched: item instanceof PlacedFigure && !!item.data.piece && JigsawPieces.matched({ col: item.data.piece.col, row: item.data.piece.row, size: item.object.width, centerX: item.centerX, centerY: item.centerY }),
        inStore: !!this.store() && item.centerX >= (this.store()?.left ?? Infinity),
      };
    }),
  );

  /** how many pieces the picture is cut into across and down (a piece of the jigsaw shows its own part of the picture) */
  readonly pieceGrid = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** the picture shown behind the canvas: not when the picture is cut into pieces (the pieces are the picture then; the help frame shows it) */
  readonly backdrop = computed(() => (this.placed().some((p) => p.piece) ? null : this.picture()));

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
    if (this.selection().some((id) => this.diagram().get(id)?.data.piece)) return []; // a piece keeps its size
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

  /** the three points of the picked arrow you drag to curve it: a quarter, half and three quarters of the way (none when the picked object is not an arrow) */
  readonly bendHandles = computed(() => {
    const id = this.selectedId();
    const picked = id ? this.diagram().get(id) : undefined;
    if (!(picked instanceof PlacedArrow)) return [];
    return picked.shapePoints().map((point, i) => ({ which: BEND_POINTS[i], ...point }));
  });

  /** the placed object that is being moved: the pointer's distance from its centre (or from the end that was grabbed), and the canvas area it is in */
  private moving: { id: string; dx: number; dy: number; end?: EndId } | null = null;

  /** the handle that is being dragged to resize the picked figure or objects, and the canvas area it is in */
  private resizing: { ids: string[]; handle: ResizeHandle; area: HTMLElement; gx: number; gy: number } | null = null;

  /** the handle that is being dragged to change the width across of the picked arrow: its side, where on the handle it was grabbed, and the canvas area */
  private acrossing: { id: string; side: 1 | -1; grabbed: number; area: HTMLElement } | null = null;

  /** a point of an arrow that is being dragged to curve it: the arrow, which of its three points, where on the handle it was grabbed (as a bend), and the canvas area */
  private bending: { id: string; which: BendPoint; grabbed: number; area: HTMLElement } | null = null;

  /** where a rectangle drag on the empty canvas started */
  private marqueeStart: { x: number; y: number; area: HTMLElement } | null = null;

  constructor() {
    // the pieces area fills the screen: measured when the page is drawn, and again when the window is resized or scrolled
    afterNextRender(() => this.measureArea());
    // draw the grid again whenever the size or the grid changes (a new width or height clears the canvas)
    effect(() => {
      const element = this.canvas()?.nativeElement;
      const width = this.width();
      const height = this.height();
      if (!element || !(width >= CANVAS_MIN_SIDE) || !(height >= CANVAS_MIN_SIDE)) return;
      element.width = width;
      element.height = height;
      if (this.gridVisible()) this.drawGrid(element, this.gridSize(), this.gridInset(), this.numberPoints());
    });
    // what is picked has to be on the canvas: another canvas was opened, or an object was taken away
    effect(() => {
      const there = new Set(this.placed().map((p) => p.id));
      const picked = untracked(() => this.selection());
      const kept = picked.filter((id) => there.has(id));
      if (kept.length !== picked.length) this.selection.set(kept);
    });
  }

  /** Measures what is left of the visible screen below the top of the pieces area (when it fills the screen); the area is at least 200 px high. */
  @HostListener('window:resize')
  @HostListener('window:scroll')
  measureArea(): void {
    if (!this.fillScreen()) return this.areaHeight.set(null);
    const top = this.root().nativeElement.getBoundingClientRect().top;
    this.areaHeight.set(Math.max(200, Math.floor(window.innerHeight - top - SCREEN_MARGIN_PX)));
  }

  /** the distance between the points the centres stick to: the grid, or a pixel when the grid is not shown */
  private get step(): number {
    return this.gridVisible() && this.gridSize() > 0 ? this.gridSize() : 1;
  }

  /** where the grid points start on each axis: 0, or half a step for a grid whose points are half a step in from the edge (they are the points the centres stick to) */
  private get origin(): number {
    return this.gridInset() && this.gridVisible() && this.gridSize() > 0 ? this.gridSize() / 2 : 0;
  }

  /** A grid point every `step` pixels, starting at 0,0 (or half a step in when `inset`): one small tile of the grid filled over the whole canvas. */
  private drawGrid(element: HTMLCanvasElement, step: number, inset: boolean, numbered: boolean): void {
    const ctx = element.getContext('2d');
    if (!ctx || step <= 0) return;
    const tile = document.createElement('canvas');
    tile.width = tile.height = step;
    const tileCtx = tile.getContext('2d');
    if (!tileCtx) return;
    tileCtx.fillStyle = '#6c757d';
    const dot = step >= 4 ? 2 : 1;
    const at = inset ? Math.round(step / 2 - dot / 2) : 0;
    tileCtx.fillRect(at, at, dot, dot);
    const pattern = ctx.createPattern(tile, 'repeat'); // a pattern is a snapshot: the tile must be drawn before this
    if (!pattern) return;
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, element.width, element.height);
    if (numbered && step >= MIN_NUMBERED_STEP_PX) this.drawNumbers(ctx, element, step, inset ? step / 2 : 0);
  }

  /** Number the grid points 1, 2, 3 ... along each row from the top left; `first` is where the first row and column of points are. */
  private drawNumbers(ctx: CanvasRenderingContext2D, element: HTMLCanvasElement, step: number, first: number): void {
    ctx.fillStyle = '#495057';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center'; // centred under its point, so the numbers are as far from the edges as the points are
    ctx.textBaseline = 'top';
    let n = 0;
    for (let y = first; y < element.height; y += step) {
      for (let x = first; x < element.width; x += step) ctx.fillText(String(++n), x, y + 4);
    }
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
    const result = this.diagram().place(object, event.clientX - rect.left, event.clientY - rect.top, this.step, this.origin);
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
    const { x, y } = this.areaPoint(event);
    this.selection.set([item.id]);
    if (item.piece) this.apply(this.diagram().bringToFront(item.id)); // a piece that is picked up goes in front of the others and stays there when it is dropped
    this.connecting.set(true); // every point is shown while something is moved: it can be seen where it can be fastened
    const placed = this.diagram().get(item.id);
    const end = this.diagram().grabbedEnd(item.id, x, y);
    // the distance from the pointer to what is moved, so it does not jump to the pointer
    const grabbed = placed instanceof PlacedArrow && end ? placed.endPoint(end) : { x: item.centerX, y: item.centerY };
    this.moving = { id: item.id, dx: x - grabbed.x, dy: y - grabbed.y, end };
    this.capture(this.root().nativeElement, event); // not the object: it is made again in the store frame when it is moved there
  }

  /**
   * Where the pointer is on the jigsaw pieces area, in the pixels the objects are placed in: over the store frame (which can be scrolled) it is where
   * the frame is, beside the canvas; anywhere else it is on the part of the jigsaw pieces area that is left of the frame (the canvas and the blank space
   * under it), and not outside what the area shows.
   */
  private areaPoint(event: PointerEvent): Point {
    const store = this.store();
    const inner = this.storeInner()?.nativeElement;
    if (store && inner) {
      const frame = (inner.parentElement as HTMLElement).getBoundingClientRect();
      if (event.clientX >= frame.left && event.clientX <= frame.right && event.clientY >= frame.top && event.clientY <= frame.bottom) {
        const rect = inner.getBoundingClientRect(); // moves with the scrolling of the frame
        return { x: store.left + event.clientX - rect.left, y: event.clientY - rect.top };
      }
    }
    // not over the store frame: anywhere on the area that is left of it, the picture and the blank space under it, as far as the area shows
    const rect = (this.canvas()?.nativeElement as HTMLElement).getBoundingClientRect();
    const area = this.root().nativeElement.getBoundingClientRect();
    const reach = store ? store.left : this.width();
    const lowest = Math.max(this.height(), area.bottom - rect.top - AREA_PADDING_PX);
    return { x: Math.min(Math.max(event.clientX - rect.left, 0), reach), y: Math.min(Math.max(event.clientY - rect.top, 0), lowest) };
  }

  /** What is grabbed follows the pointer: the diagram moves the figure, the arrow or the end of the arrow (see `CanvasDiagram`). */
  moveMove(event: PointerEvent): void {
    const moving = this.moving;
    if (!moving) return;
    const diagram = this.diagram();
    const placed = diagram.get(moving.id);
    if (!placed) return;
    const point = this.areaPoint(event);
    const x = point.x - moving.dx;
    const y = point.y - moving.dy;
    let next = diagram;
    if (!(placed instanceof PlacedArrow)) next = diagram.moveFigure(moving.id, x, y, this.step, this.origin);
    else if (moving.end) next = diagram.moveArrowEnd(moving.id, moving.end, x, y, this.step, this.origin);
    else next = diagram.moveArrow(moving.id, x, y, this.step, this.origin);
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

  /** Grab one of the three points of the picked arrow to curve it. */
  startBend(event: PointerEvent, which: BendPoint): void {
    const id = this.selectedId();
    const arrow = id ? this.diagram().get(id) : undefined;
    if (!id || !(arrow instanceof PlacedArrow)) return;
    const target = event.currentTarget as HTMLElement;
    const area = target.parentElement as HTMLElement;
    const rect = area.getBoundingClientRect();
    // how far the pointer is from the point, so the arrow does not jump when it is grabbed off centre
    const bend = arrow.bends[BEND_POINTS.indexOf(which)];
    this.bending = { id, which, grabbed: arrow.sidewaysOf({ x: event.clientX - rect.left, y: event.clientY - rect.top }) - bend, area };
    this.capture(target, event);
  }

  /** The point follows the pointer: the arrow is curved so that the point is there (see `CanvasDiagram.bendArrow`). */
  moveBend(event: PointerEvent): void {
    const bending = this.bending;
    if (!bending) return;
    const diagram = this.diagram();
    const arrow = diagram.get(bending.id);
    if (!(arrow instanceof PlacedArrow)) return;
    const rect = bending.area.getBoundingClientRect();
    this.apply(diagram.bendArrow(bending.id, arrow.sidewaysOf({ x: event.clientX - rect.left, y: event.clientY - rect.top }) - bending.grabbed, bending.which));
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
