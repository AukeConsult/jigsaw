import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, HostListener, inject, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { CanvasShape } from '../canvas-shape/canvas-shape';
import { PuzzlePiece } from '../../jigsaw/puzzle-piece/puzzle-piece';
import { readSession, writeSession } from '../../core/session-storage';
import { JigsawHelper } from '../../jigsaw/jigsaw-helper';
import { cssNumber, cssVar } from '../../core/theme';
import { CANVAS_OBJECT_DRAG_TYPE } from '../drag';
import { CanvasObject } from '../../models/shared/canvas-object';
import { CANVAS_MAX_SIDE, CANVAS_MIN_SIDE, CanvasArea } from '../../models/shared/canvas';
import { COLLECT_GAP, COLLECT_MARGIN, COLLECT_SCATTER, CanvasDiagram } from '../../models/shared/diagram';
import { JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';
import { Box, Point, ResizeHandle, resizeHandlePositions } from '../../models/shared/geometry';
import { EndId, PlacedArrow, PlacedFigure, PlacedObject } from '../../models/shared/placed';

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
/** The store frame below the picture is at least this high, in stored pixels. */
const STORE_MIN_HEIGHT_PX = 100;
/** The room the scroll bar of the store frame takes beside its pieces, in pixels. */
const STORE_SCROLLBAR_PX = 16;
/** The jigsaw pieces area is never drawn smaller than this share of the stored size (the picture is fitted to the screen down to here), and never bigger than the stored size. */
const SCALE_MIN = 0.1;
/** A jigsaw is drawn at most this many times bigger than its stored size. */
const SCALE_MAX = 4;
/** The store frame is beside the picture as long as the picture (2/3 of the room) can be drawn at this scale or bigger; on a narrower screen it goes below the picture. */
const BESIDE_MIN_SCALE = 0.5;
/** With the store frame beside the picture, the picture gets this share of the room to begin with and the frame the rest (the frame scrolls sideways when the pieces need more). */
const BESIDE_PICTURE_SHARE = 2 / 3;
/** With the store frame below the picture it is this many grid steps high (a short strip) and scrolls sideways only: the store is cut into bands as high as the strip, laid side by side. */
const STACKED_STORE_ROWS = 4;
/** The helper picture is shown at this share of the size of the picture to begin with, and can be made as small as the first and as big as the second. */
const HELPER_SCALE_START = 0.25;
/** How long a piece blinks when it clicks into place, in milliseconds (the length of the animation). */
const BLINK_MS = 700;
const HELPER_SCALE_MIN = 0.1;
const HELPER_SCALE_MAX = 0.5;

// what is read back from the session is checked: anything else is left out and the board starts as if nothing was kept
const isPlace = (v: unknown): v is { x: number; y: number } =>
  !!v && typeof v === 'object' && Number.isFinite((v as { x: unknown }).x) && Number.isFinite((v as { y: unknown }).y) && (v as { x: number }).x >= 0 && (v as { y: number }).y >= 0 && (v as { x: number }).x <= window.innerWidth - 80 && (v as { y: number }).y <= window.innerHeight - 40;
const isScale = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= HELPER_SCALE_MIN && v <= HELPER_SCALE_MAX;
/** The space (Bootstrap's p-2) between the edge of the pieces area and what is in it, in pixels. */
const AREA_PADDING_PX = 8;
/** The border of the store frame (Bootstrap's `border`), in pixels. */
const FRAME_BORDER_PX = 1;
/** How far the tabs of a piece reach out of its square, as a share of its side (with some to spare). */
const TAB_REACH = 0.4;

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
  /** the store is made wider (Collect pieces uses the whole width of the frame): the new width in pixels, for the page to keep */
  readonly storeWidthChange = output<number>();
  /** how thick the frame around the picture area is, in pixels (0: none): a line in a colour that can be seen, outside the area, so nothing moves when it is there */
  readonly frameWidth = input(0);
  /** a jigsaw: how close to its own grid point a piece has to be dropped to click into place, in pixels (0: never) */
  readonly snapRange = input(0);
  /** a banner above the jigsaw pieces area, with a switch that shows or hides the helper picture (the whole picture at a quarter of its width and height) */
  readonly helperBanner = input(false);
  /** whether the helper picture is shown (on to begin with) */
  private readonly jigsawHelper = inject(JigsawHelper);
  readonly helper = this.jigsawHelper.helper; // the switch is in the top menu (see `JigsawHelper`)
  /** where the floating frame of the helper picture is on the window (its top left corner, in pixels): it can be moved by its title */
  readonly helperFrame = signal(readSession('jigsaw.helperFrame', { x: Math.max(8, window.innerWidth - 260), y: 70 }, isPlace));
  /** the pieces that clicked into place a moment ago: they blink */
  readonly blinking = signal<ReadonlySet<string>>(new Set());
  /** The pieces blink for a moment, and the device vibrates when it can. */
  private blink(ids: string[]): void {
    this.blinking.update((now) => new Set([...now, ...ids]));
    try {
      navigator.vibrate?.(40);
    } catch {
      /* the device cannot vibrate: the blink is enough */
    }
    setTimeout(() => this.blinking.update((now) => new Set([...now].filter((id) => !ids.includes(id)))), BLINK_MS);
  }

  /** helper: show only the corner and edge pieces (the pieces from the inside of the picture are hidden); off to begin with, not saved */
  readonly edgesOnly = this.jigsawHelper.edgesOnly; // the switch is in the top menu
  /** the board has jigsaw pieces */
  readonly hasPieces = computed(() => this.placed().some((p) => p.piece));
  /** the pieces that are hidden because only corner and edge pieces are shown: the ones from the inside of the picture */
  readonly hiddenIds = computed(() => (this.edgesOnly() ? new Set(this.placed().filter((p) => p.piece && !JigsawPieces.isBorder(p.piece)).map((p) => p.id)) : new Set<string>()));
  /** the pieces that lie in the store frame and are shown (not hidden by "only corner and edge pieces"): the ones that are collected */
  readonly storePieceIds = computed(() => {
    const store = this.store();
    const hidden = this.hiddenIds();
    return store ? this.placed().filter((p) => p.piece && p.centerX >= store.left && !hidden.has(p.id)).map((p) => p.id) : [];
  });

  /**
   * Collect pieces (a button of the helper banner): the pieces that lie in the store frame are put together at the top of it, close to each other (see
   * `CanvasDiagram.collectPieces`), and the frame is scrolled to its top so they are seen. Saved like any move of pieces.
   */
  collectPieces(): void {
    const store = this.store();
    if (!store) return;
    // beside the picture the frame can be wider than the store the pieces were spread over: the pieces are collected over all of the frame that shows (the
    // store is made that wide, and the page keeps it); below the picture the strip has the width of the store
    // (when the pieces would not all fit in the rows of that width, the store is made wider than the frame, which scrolls sideways)
    const pitch = Math.round((1 + COLLECT_GAP + COLLECT_SCATTER) * this.gridSize());
    const margin = Math.round(COLLECT_MARGIN * this.gridSize());
    const rows = Math.max(1, Math.floor((store.height - 2 * margin) / Math.max(1, pitch)));
    const needed = Math.ceil(Math.ceil((this.storePieceIds().length * 1.1) / rows) * pitch + 2 * margin); // a little to spare for groups of pieces
    const width = this.stacked() ? store.width : Math.min(CANVAS_MAX_SIDE - store.left, Math.max(STORE_MIN_HEIGHT_PX, this.storeFrameWidth() - STORE_SCROLLBAR_PX, needed));
    const extent = CanvasArea.extent(this.width(), this.height(), this.gridSize(), Math.max(width, store.width));
    const before = CanvasDiagram.from(this.placed(), extent.width, extent.height);
    const next = before.collectPieces(this.storePieceIds(), { left: store.left, top: 0, width }, Math.random);
    if (width > store.width) this.storeWidthChange.emit(width);
    if (next !== before) this.placed.set(next.toData());
    const frame = this.storeInner()?.nativeElement.parentElement;
    if (frame) {
      frame.scrollTop = 0;
      frame.scrollLeft = 0;
    }
  }

  /** how many pieces there are, and how many of them are shown (for the helper banner) */
  readonly pieceCounts = computed(() => {
    const total = this.placed().filter((p) => p.piece).length;
    return { total, shown: total - this.hiddenIds().size };
  });

  /** how big the helper picture is, as a share of the size of the picture (from 1/10 to 1/2) */
  readonly helperScale = signal(readSession('jigsaw.helperScale', HELPER_SCALE_START, isScale));
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
    const shown = this.width() * this.scale(); // the picture is this wide on the screen when the helper picture is its whole size
    const wanted = (sizing.scale * shown + (event.clientX - sizing.x)) / shown;
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
  /** how far the store frame is scrolled, in pixels */
  readonly storeScroll = signal(0);
  /** how high the store frame is on the page */
  readonly storeViewHeight = computed(() => (this.stacked() ? Math.max(STORE_MIN_HEIGHT_PX, Math.round(STACKED_STORE_ROWS * (this.gridSize() || STORE_MIN_HEIGHT_PX))) : this.areaHeight() ? Math.floor(((this.areaHeight() ?? 0) - 2) / this.scale() - 2 * AREA_PADDING_PX) : this.height()));
  /** what the pieces area has room for on the screen: its width (the area border is not counted) */
  private readonly room = signal<{ width: number; height: number } | null>(null);
  /**
   * How big the pieces area is drawn compared with the stored pixels (at most 1): the picture, with the space round it, is fitted to the room there is, in its own
   * proportions, so it is whole on any screen. Everything on the area is drawn at this scale (the pieces, the grid, the frames); what the person does on it is
   * turned back to stored pixels, so the jigsaw is the same on every screen.
   */
  readonly scale = computed(() => {
    const room = this.room();
    const store = this.store();
    // as wide as what is drawn: the picture and the store frame, side by side or one above the other
    const wide = this.width() + 2 * AREA_PADDING_PX; // the store frame is not counted: it takes the room that is left (beside the picture) or the room below, and scrolls sideways
    const share = store && !this.stacked() ? BESIDE_PICTURE_SHARE : 1; // the picture gets 2/3 of the room when the store is beside it
    const high = this.height() + 2 * AREA_PADDING_PX;
    if (!room || !(room.width > 0) || !(wide > 0)) return 1;
    const left = (this.areaHeight() ?? 0) - 2; // the height the area has, when it fills the screen
    const below = this.stacked() ? (1 + STACKED_STORE_ROWS) * (this.gridSize() || STORE_MIN_HEIGHT_PX) : 0; // the strip of the store below the picture needs room too
    const fit = Math.min((room.width * share) / wide, left > 0 ? left / (high + below) : Infinity);
    return Math.min(store ? SCALE_MAX : 1, Math.max(SCALE_MIN, fit)); // a jigsaw is drawn bigger than its stored size when the room is there: the picture gets 2/3 of the width
  });
  /**
   * Whether the store frame is below the picture instead of beside it: when both side by side would have to be drawn smaller than `BESIDE_MIN_SCALE` to fit the
   * room (a narrow screen). Only how it is drawn changes: the pieces keep the places they are stored at, and `place` puts them where the frame is shown.
   */
  readonly stacked = computed(() => {
    const store = this.store();
    const room = this.room();
    if (!store || !room || !(room.width > 0)) return false;
    return (room.width * BESIDE_PICTURE_SHARE) / (this.width() + 2 * AREA_PADDING_PX) < BESIDE_MIN_SCALE;
  });
  private readonly destroyRef = inject(DestroyRef);
  /** how big the layer of the pieces is: the whole area, so it scrolls with it */
  readonly overlay = computed(() => {
    const store = this.store();
    if (store && this.stacked()) {
      // the layer of the pieces is the whole area, also the free space under the strip, where a piece can be put anywhere
      const shown = this.areaHeight() ? ((this.areaHeight() ?? 0) - 2) / this.scale() : 0;
      return { width: 2 * AREA_PADDING_PX + this.storeFrameWidth(), height: Math.max(shown, 2 * AREA_PADDING_PX + this.height() + this.gridSize() + this.storeViewHeight()) };
    }
    return {
      width: 2 * AREA_PADDING_PX + this.width() + this.gridSize() + (store ? this.storeFrameWidth() : 0),
      height: 2 * AREA_PADDING_PX + Math.max(this.height(), this.storeViewHeight()),
    };
  });

  /** how wide the store frame is on the page: below the picture it is as wide as the room (and scrolls sideways when the pieces need more), beside it as wide as the pieces need */
  readonly storeFrameWidth = computed(() => {
    const store = this.store();
    const room = this.room();
    if (!store) return 0;
    if (!room) return store.width + STORE_SCROLLBAR_PX;
    // below the picture the frame is as wide as the room; beside it, it goes on to the right edge of the area (the room that is left of the picture, minus the padding)
    if (this.stacked()) return Math.max(STORE_MIN_HEIGHT_PX, Math.floor(room.width / this.scale() - 2 * AREA_PADDING_PX));
    return Math.max(STORE_MIN_HEIGHT_PX, Math.floor(room.width / this.scale() - store.left - 2 * AREA_PADDING_PX));
  });
  /** the picture stays where it is and the store frame has the rest of the area: the area does not scroll (only when the store is below and the area fills the screen) */
  readonly fixed = computed(() => this.stacked() && !!this.areaHeight());
  /** how far the store frame is scrolled sideways, in pixels (below the picture it scrolls only sideways) */
  readonly storeScrollX = signal(0);
  /** below the picture the store is cut into bands as high as the strip (the store seen through the frame), laid side by side: how high a band is, in stored pixels */
  private readonly bandHeight = computed(() => Math.max(1, this.storeViewHeight() - 2 * FRAME_BORDER_PX));
  /** how many bands the store has below the picture */
  private readonly bandCount = computed(() => Math.max(1, Math.ceil((this.store()?.height ?? 0) / this.bandHeight())));
  /** the size of the inside of the store frame: the store as it is, or the bands side by side */
  readonly storeInnerSize = computed(() => {
    const store = this.store();
    if (!store) return { width: 0, height: 0 };
    return this.stacked() ? { width: this.bandCount() * store.width, height: this.bandHeight() } : { width: store.width, height: store.height };
  });
  /** the band a place in the store (this far down) is in */
  private bandOf(y: number): number {
    return Math.min(this.bandCount() - 1, Math.max(0, Math.floor(y / this.bandHeight())));
  }

  onStoreScroll(event: Event): void {
    const frame = event.target as HTMLElement;
    this.storeScroll.set(frame.scrollTop);
    this.storeScrollX.set(frame.scrollLeft);
  }

  /**
   * Where an object goes in the layer of the pieces, which lies on top of the canvas and the store frame: how far to move it from where it is placed
   * (`shift` across, `shiftY` down), what to cut off a piece of the store that is partly out of the frame at the top or the bottom (`clip`: only there, not at the
   * sides, so a piece can lie over the edge), and whether it is out of the frame altogether (`hidden`: a piece that has been scrolled out of sight).
   */
  place(v: { inStore: boolean; left: number; top: number; object: { width: number } }): { shift: number; shiftY: number; clip: string | null; hidden: boolean } {
    const store = this.store();
    if (!store || !v.inStore) return { shift: -AREA_PADDING_PX, shiftY: -AREA_PADDING_PX, clip: null, hidden: false }; // on the canvas: the canvas is where the area's padding ends
    const size = v.object.width;
    const reach = Math.ceil(size * TAB_REACH);
    const scroll = this.storeScroll();
    const shown = this.storeViewHeight() - 2 * FRAME_BORDER_PX; // the height of what the frame shows
    const stacked = this.stacked();
    // where the piece is in the store as the frame has it: as stored, or in its band (below the picture; a piece is shown whole, not cut by the edge of its band)
    const band = stacked ? this.bandOf(v.top + size / 2) : 0;
    const inLeft = v.left - store.left + band * store.width;
    const inTop = stacked ? Math.min(Math.max(v.top - band * this.bandHeight(), 0), Math.max(0, this.bandHeight() - size)) : v.top;
    const top = inTop - scroll; // where the piece is in what the frame shows
    if (top + size + reach <= 0 || top - reach >= shown) return { shift: 0, shiftY: 0, clip: null, hidden: true };
    const cutTop = Math.max(0, -top);
    const cutBottom = Math.max(0, top + size - shown);
    // the store frame scrolls sideways: a piece is cut at the right edge of the frame, and at the left edge when it is scrolled (not scrolled, a piece of a group
    // that lies over the picture and the store can lie over the left edge)
    const scrollX = this.storeScrollX();
    const across = inLeft - scrollX; // where the piece is across what the frame shows
    const shownAcross = this.storeFrameWidth() - 2 * FRAME_BORDER_PX - (stacked ? 0 : STORE_SCROLLBAR_PX); // beside the picture the frame has a scroll bar at its side
    if ((scrollX > 0 || stacked) && across + size + reach <= 0) return { shift: 0, shiftY: 0, clip: null, hidden: true };
    if (across - reach >= shownAcross) return { shift: 0, shiftY: 0, clip: null, hidden: true };
    const cutLeft = scrollX > 0 || stacked ? Math.max(0, -across) : 0;
    const cutRight = Math.max(0, across + size - shownAcross);
    const sideReach = reach + size;
    const frameLeft = stacked ? AREA_PADDING_PX : AREA_PADDING_PX + this.width() + this.gridSize(); // the frame is beside the canvas, a grid step from it, or below it
    const frameTop = stacked ? AREA_PADDING_PX + this.height() + this.gridSize() : AREA_PADDING_PX;
    return {
      shift: v.left - (frameLeft + FRAME_BORDER_PX + across),
      shiftY: v.top - (frameTop + FRAME_BORDER_PX + top),
      clip: cutTop || cutBottom || cutLeft || cutRight ? `inset(${[cutTop, cutRight, cutBottom, cutLeft].map((cut) => (cut > 0 ? cut : -sideReach) + 'px').join(' ')})` : null, // only the sides that are cut are clipped: the tabs of a piece reach out of its square
      hidden: false,
    };
  }

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
        hidden: this.hiddenIds().has(item.id),
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
  readonly groupBox = computed(() => (this.selection().length > 1 && !this.selection().some((id) => this.diagram().get(id)?.data.piece) ? this.diagram().boundsOf(this.selection()) : null));

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
  private moving: { id: string; ids: string[]; dx: number; dy: number; screen?: { dx: number; dy: number }; end?: EndId; matchedAtStart: ReadonlySet<string>; stuckAtStart: ReadonlySet<string> } | null = null;

  /** the handle that is being dragged to resize the picked figure or objects, and the canvas area it is in */
  private resizing: { ids: string[]; handle: ResizeHandle; area: HTMLElement; gx: number; gy: number } | null = null;

  /** the handle that is being dragged to change the width across of the picked arrow: its side, where on the handle it was grabbed, and the canvas area */
  private acrossing: { id: string; side: 1 | -1; grabbed: number; area: HTMLElement } | null = null;

  /** a point of an arrow that is being dragged to curve it: the arrow, which of its three points, where on the handle it was grabbed (as a bend), and the canvas area */
  private bending: { id: string; which: BendPoint; grabbed: number; area: HTMLElement } | null = null;

  /** where a rectangle drag on the empty canvas started */
  private marqueeStart: { x: number; y: number } | null = null;

  constructor() {
    // the pieces area fills the screen: measured when the page is drawn, and again when the window is resized or scrolled
    afterNextRender(() => {
      this.measureArea();
      // the room for the area changes with the window, and with the sidebar and the page around it
      const watch = new ResizeObserver(() => this.measureArea());
      watch.observe(this.root().nativeElement);
      this.destroyRef.onDestroy(() => watch.disconnect());
    });
    // what the person chose for the helper stays for the session: when the page is reloaded or left and come back to, the switches, and the place and size of the frame, are as they were
    // the top menu shows the helper while this board has it, and what it needs to know about the board; it asks for the pieces to be collected
    const helper = this.jigsawHelper;
    effect(() => helper.active.set(this.helperBanner()));
    effect(() => helper.hasPicture.set(!!this.picture()));
    effect(() => helper.hasPieces.set(this.hasPieces()));
    effect(() => helper.counts.set(this.pieceCounts()));
    effect(() => helper.canCollect.set(this.storePieceIds().length > 0));
    this.destroyRef.onDestroy(() => helper.active.set(false));
    let collected = helper.collectRequests();
    effect(() => {
      const asked = helper.collectRequests();
      if (asked === collected) return;
      collected = asked;
      untracked(() => this.collectPieces());
    });
    effect(() => writeSession('jigsaw.helperFrame', this.helperFrame()));
    effect(() => writeSession('jigsaw.helperScale', this.helperScale()));
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
    const root = this.root().nativeElement;
    this.areaHeight.set(this.fillScreen() ? Math.max(200, Math.floor(window.innerHeight - root.getBoundingClientRect().top - SCREEN_MARGIN_PX)) : null);
    const width = root.clientWidth; // the room is what the page gives the area: it does not grow with its content
    if (this.room()?.width !== width) this.room.set({ width, height: 0 });
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
    tileCtx.fillStyle = cssVar('--app-grid-dot', 'gray'); // the colours and the font come from the look (styles.scss)
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
    ctx.fillStyle = cssVar('--app-grid-number', 'gray');
    ctx.font = `${cssNumber('--app-grid-number-size', 10)}px ${cssVar('--app-font-sans', 'sans-serif')}`;
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
    const result = this.diagram().place(object, (event.clientX - rect.left) / this.scale(), (event.clientY - rect.top) / this.scale(), this.step, this.origin);
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
    // grabbing one of several picked objects moves them all; grabbing another object picks only that one
    const picked = this.selection();
    const inSelection = picked.length > 1 && picked.includes(item.id);
    if (!inSelection) this.selection.set([item.id]);
    // the pieces that stick together move together: a piece takes the group it is stuck to with it (Shift takes the piece alone, which pulls it loose)
    const wanted = inSelection ? [...picked] : [item.id];
    const ids = item.piece && !event.shiftKey ? this.diagram().stuckGroup(wanted) : wanted;
    if (item.piece) {
      // a piece that is picked up goes in front of the others and stays there when it is dropped (a group keeps its order)
      let diagram = this.diagram();
      for (const id of [...ids].sort((a, b) => (diagram.get(a)?.layer ?? 0) - (diagram.get(b)?.layer ?? 0))) diagram = diagram.bringToFront(id);
      this.apply(diagram);
    }
    this.connecting.set(true); // every point is shown while something is moved: it can be seen where it can be fastened
    const placed = this.diagram().get(item.id);
    const end = this.diagram().grabbedEnd(item.id, x, y);
    // the distance from the pointer to what is moved, so it does not jump to the pointer
    const grabbed = placed instanceof PlacedArrow && end ? placed.endPoint(end) : { x: item.centerX, y: item.centerY };
    // a piece follows the pointer on the screen: how far the pointer is from the middle of the piece as it is drawn, so the piece does not jump when the pointer
    // goes from one part of the area to another (the strip of the store, the picture and the free space map to the stored places in different ways)
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const screen = item.piece ? { dx: event.clientX - (box.left + box.width / 2), dy: event.clientY - (box.top + box.height / 2) } : undefined;
    this.moving = { id: item.id, ids, dx: x - grabbed.x, dy: y - grabbed.y, screen, end, matchedAtStart: this.matchedAmong(this.diagram(), ids), stuckAtStart: new Set(this.diagram().stuckGroup(ids)) };
    this.capture(this.root().nativeElement, event); // not the object: it is made again in the store frame when it is moved there
  }

  /**
   * Where the pointer is on the jigsaw pieces area, in the pixels the objects are placed in: over the store frame (which can be scrolled) it is where
   * the frame is, beside the canvas; anywhere else it is on the part of the jigsaw pieces area that is left of the frame (the canvas and the blank space
   * under it), and not outside what the area shows.
   */
  private areaPoint(event: { clientX: number; clientY: number }): Point {
    const store = this.store();
    const inner = this.storeInner()?.nativeElement;
    if (store && inner) {
      const frame = (inner.parentElement as HTMLElement).getBoundingClientRect();
      if (event.clientX >= frame.left && event.clientX <= frame.right && event.clientY >= frame.top && event.clientY <= frame.bottom) {
        const rect = inner.getBoundingClientRect(); // moves with the scrolling of the frame
        const across = (event.clientX - rect.left) / this.scale();
        const down = (event.clientY - rect.top) / this.scale();
        if (!this.stacked()) return { x: store.left + across, y: down };
        const band = Math.min(this.bandCount() - 1, Math.max(0, Math.floor(across / store.width))); // below the picture: the band the pointer is over
        return { x: store.left + Math.min(across - band * store.width, store.width), y: Math.min(down + band * this.bandHeight(), store.height) };
      }
    }
    // not over the store frame: anywhere on the area that is left of it, the picture and the blank space under it, as far as the area shows
    const rect = (this.canvas()?.nativeElement as HTMLElement).getBoundingClientRect();
    const area = this.root().nativeElement.getBoundingClientRect();
    const reach = store && !this.stacked() ? store.left : this.width(); // below the picture the store strip is not beside it: the area is as wide as the picture
    const lowest = Math.max(this.height(), (area.bottom - rect.top) / this.scale() - AREA_PADDING_PX); // a piece goes anywhere on the area, down to the bottom of the screen
    return { x: Math.min(Math.max((event.clientX - rect.left) / this.scale(), 0), reach), y: Math.min(Math.max((event.clientY - rect.top) / this.scale(), 0), lowest) };
  }

  /** What is grabbed follows the pointer: the diagram moves the figure, the arrow or the end of the arrow (see `CanvasDiagram`). */
  moveMove(event: PointerEvent): void {
    const moving = this.moving;
    if (!moving) return;
    const diagram = this.diagram();
    const placed = diagram.get(moving.id);
    if (!placed) return;
    const screen = moving.screen;
    const point = screen ? this.areaPoint({ clientX: event.clientX - screen.dx, clientY: event.clientY - screen.dy }) : this.areaPoint(event); // a piece: where its middle is
    const x = screen ? point.x : point.x - moving.dx;
    const y = screen ? point.y : point.y - moving.dy;
    let next = diagram;
    if (moving.ids.length > 1) {
      // several picked objects, or pieces that stick together: all move by as much as the one that is held (see `CanvasDiagram.moveGroup`)
      this.apply(diagram.moveGroup(moving.ids, x - placed.centerX, y - placed.centerY));
      return;
    }
    if (!(placed instanceof PlacedArrow)) next = diagram.moveFigure(moving.id, x, y, this.step, this.origin);
    else if (moving.end) next = diagram.moveArrowEnd(moving.id, moving.end, x, y, this.step, this.origin);
    else next = diagram.moveArrow(moving.id, x, y, this.step, this.origin);
    this.apply(next);
  }

  /**
   * What is moved is let go. A piece (or the group of pieces that stick together) that is dropped within the range of its own grid point, or of a place
   * where it fits a neighbour, clicks into place (see `CanvasDiagram.dropPieces` and `snapRange`): it goes exactly there, the pieces that now stick
   * together blink, and the device vibrates. A piece does not click while it is moved, only when it is dropped.
   */
  endMove(): void {
    const moving = this.moving;
    this.moving = null;
    this.connecting.set(false);
    if (!moving) return;
    const ids = moving.ids;
    const before = this.diagram();
    const dropped = before.dropPieces(ids, this.snapRange());
    if (dropped !== before) this.apply(dropped);
    const fresh = [...this.matchedAmong(dropped, ids)].filter((id) => !moving.matchedAtStart.has(id)); // in place now, and was not when it was picked up
    const joined = dropped.stuckGroup(ids).filter((id) => !moving.stuckAtStart.has(id)); // pieces that stick to what was moved now, and did not when it was picked up
    const blinking = new Set([...fresh, ...joined, ...(joined.length ? [moving.id] : [])]);
    if (blinking.size) this.blink([...blinking]);
  }

  /** which of these objects are jigsaw pieces on their own place */
  private matchedAmong(diagram: CanvasDiagram, ids: readonly string[]): Set<string> {
    return new Set(
      ids.filter((id) => {
        const p = diagram.get(id);
        const piece = p instanceof PlacedFigure ? p.data.piece : undefined;
        return !!piece && !!p && JigsawPieces.matched({ col: piece.col, row: piece.row, size: p.object.width, centerX: p.centerX, centerY: p.centerY });
      }),
    );
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
    this.resizing = { ids, handle, area, gx: (event.clientX - rect.left) / this.scale() - (at?.x ?? 0), gy: (event.clientY - rect.top) / this.scale() - (at?.y ?? 0) };
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
    const x = (event.clientX - rect.left) / this.scale() - resizing.gx - dx * HANDLE_OFFSET_PX;
    const y = (event.clientY - rect.top) / this.scale() - resizing.gy - dy * HANDLE_OFFSET_PX;
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
    const at: Point = { x: (event.clientX - rect.left) / this.scale(), y: (event.clientY - rect.top) / this.scale() };
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
    const size = arrow.acrossAt({ x: (event.clientX - rect.left) / this.scale(), y: (event.clientY - rect.top) / this.scale() }, acrossing.side, ACROSS_OFFSET_PX) - acrossing.grabbed;
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
    this.bending = { id, which, grabbed: arrow.sidewaysOf({ x: (event.clientX - rect.left) / this.scale(), y: (event.clientY - rect.top) / this.scale() }) - bend, area };
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
    this.apply(diagram.bendArrow(bending.id, arrow.sidewaysOf({ x: (event.clientX - rect.left) / this.scale(), y: (event.clientY - rect.top) / this.scale() }) - bending.grabbed, bending.which));
  }

  endBend(): void {
    this.bending = null;
  }

  /** picks only this object */
  select(id: string): void {
    this.selection.set([id]);
  }

  /** Dragging on the empty canvas or the empty store frame picks the objects the rectangle touches (the objects stop their own pointer events, so this is only what is empty). */
  startMarquee(event: PointerEvent): void {
    const { x, y } = this.areaPoint(event); // on the canvas, or on the store frame (which can be scrolled)
    this.marqueeStart = { x, y };
    this.selection.set([]);
    this.capture(this.root().nativeElement, event);
  }

  moveMarquee(event: PointerEvent): void {
    const start = this.marqueeStart;
    if (!start) return;
    const { x, y } = this.areaPoint(event);
    const box: Box = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    this.marquee.set(box);
    this.selection.set(this.diagram().itemsIn(box).filter((id) => !this.hiddenIds().has(id))); // what is hidden is not picked
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
