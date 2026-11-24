import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, HostListener, inject, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { switchMap } from 'rxjs';
import { tr } from '../../core/i18n';
import { PuzzlePiece } from '../../jigsaw/puzzle-piece/puzzle-piece';
import { isBoolean, readPreference, writePreference } from '../../core/preferences';
import { JigsawHelper } from '../../jigsaw/jigsaw-helper';
import { bottomBarHeight, cssNumber, cssVar, onAnyScroll } from '../../core/theme';
import { FREE_SPACE_COLUMNS_MAX, JIGSAW_MAX_SIDE, JIGSAW_MIN_SIDE, JigsawSettings } from '../../models/shared/jigsaw-settings';
import { Puzzle } from '../../models/shared/puzzle';
import { JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';
import { Box, Point } from '../../models/shared/geometry';
import { PlacedObject } from '../../models/shared/placed';

/** Grid points closer than this are not numbered: the numbers would run into each other. */
const MIN_NUMBERED_STEP_PX = 20;
/** What is kept free below the jigsaw pieces area at the bottom of the screen, in pixels. */
const SCREEN_MARGIN_PX = 8;
/** The store frame below the picture is at least this high, in stored pixels. */
const STORE_MIN_HEIGHT_PX = 100;
/** The room the scroll bar of the store frame takes beside its pieces, in pixels. */
const STORE_SCROLLBAR_PX = 16;
/** A press on the empty store frame that moves less than this is a click (stored pixels). */
const CLICK_MAX_PX = 6;
/** The jigsaw pieces area is never drawn smaller than this share of the stored size (the picture is fitted to the screen down to here), and never bigger than the stored size. */
const SCALE_MIN = 0.1;
/** A jigsaw is drawn at most this many times bigger than its stored size. */
const SCALE_MAX = 4;
/** With the store frame beside the picture, the picture gets this share of the room to begin with and the frame the rest (the frame scrolls sideways when the pieces need more). */
const BESIDE_PICTURE_SHARE = 2 / 3;
/** With the store frame below the picture it is at least this many grid steps high (it goes on down to the bottom of the screen) and scrolls sideways only: the store is cut into bands as high as the strip, laid side by side. */
const STACKED_STORE_ROWS = 4;
/** The free space beside the picture (with the store below it) is a place for pieces when it is at least this many grid steps wide. */
const ZONE_MIN_STEPS = 1;
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

/** Where it is kept on the device that a piece has been moved (the first-move hint is then not shown any more). */
const HAS_MOVED_KEY = 'jigsaw.hasMoved';

/**
 * The jigsaw pieces area: the grid, the pieces placed on it, what is picked, and what the person does with them (move, pick with a rectangle,
 * collect). What the pieces do (stick together, click into place, move as a group) is done by the model classes (`Puzzle` and the placed
 * objects); the board turns what the person does into calls to them and keeps the result in `placed`, which the page saves.
 */
@Component({
  selector: 'app-jigsaw-board',
  imports: [PuzzlePiece, NgTemplateOutlet],
  providers: [provideTranslocoScope('jigsawBoard')],
  templateUrl: './jigsaw-board.html',
})
export class JigsawBoard {
  /**
   * The text of a key in the language of the app, or '' while its file is not loaded (the template writes `t(...) || 'English'`). It is a method, not the
   * `*transloco` directive, so the template is not made inside an embedded view: the queries of the board (`root`, `area`) find their elements at once.
   */
  protected t(key: string, params?: Record<string, unknown>): string {
    return tr(key, '', params);
  }

  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /** pixels between the grid points (0 = no grid), and whether they are drawn */
  readonly gridSize = input.required<number>();
  readonly gridVisible = input.required<boolean>();
  /** whether the grid points are half a step in from the edge of the picture area (the first row and column of points are half a step from the border, as the last ones are from the far border); the jigsaw does this */
  readonly gridInset = input(false);
  /** whether each grid point is given a number (1, 2, 3 ... row by row from the top left, the points that are not drawn left out); only when the points are far enough apart to read it */
  readonly numberPoints = input(false);
  /** a jigsaw: how wide the store frame beside the picture area is (0: none); the picture area and the frame together are the jigsaw pieces area, where a piece can be moved anywhere */
  readonly storeWidth = input(0);
  /** the store is made wider (collecting the pieces uses the whole width of the frame): the new width in pixels, for the page to keep */
  readonly storeWidthChange = output<number>();
  /** how thick the frame around the picture area is, in pixels (0: none): a line in a colour that can be seen, outside the area, so nothing moves when it is there */
  /** a jigsaw: the line round each piece, how thick in pixels and what colour (none: the usual line) */
  readonly lineWidth = input<number | null>(null);
  readonly lineColor = input<string | null>(null);
  /** a jigsaw: the background colour of the picture area (none: white) */
  readonly backColor = input<string | null>(null);
  /** the round is only looked at (it is another player's): nothing on the board can be moved, picked or collected */
  readonly viewOnly = input(false);
  /** the person has moved a piece on this device before (kept): until then the store says what to do, in words that can be read */
  protected readonly hasMoved = signal(readPreference(HAS_MOVED_KEY, false, isBoolean));
  /** a jigsaw: how close to its own grid point a piece has to be dropped to click into place, in pixels (0: never) */
  readonly snapRange = input(0);
  /** a banner above the jigsaw pieces area, with a switch that shows or hides the helper picture (the whole picture at a quarter of its width and height) */
  readonly helperBanner = input(false);
  /** whether the helper picture is shown (on to begin with) */
  private readonly jigsawHelper = inject(JigsawHelper);
  readonly helper = this.jigsawHelper.helper; // the switch is in the top menu (see `JigsawHelper`)
  /** where the floating frame of the helper picture is on the window (its top left corner, in pixels): it can be moved by its title */
  readonly helperFrame = signal(readPreference('jigsaw.helperFrame', { x: Math.max(8, window.innerWidth - 260), y: 70 }, isPlace));
  /** how big the window is now (it can change after the page was opened: a phone turned, a window made smaller) */
  private readonly viewport = signal({ width: window.innerWidth, height: window.innerHeight });
  /** where the helper picture frame is drawn: where it was put, but always on the window as it is now (so it is never left outside it when the window gets smaller) */
  readonly shownHelperFrame = computed(() => {
    const frame = this.helperFrame();
    const view = this.viewport();
    return { x: Math.max(0, Math.min(frame.x, view.width - 80)), y: Math.max(0, Math.min(frame.y, view.height - 40)) };
  });

  @HostListener('window:resize')
  measureViewport(): void {
    this.viewport.set({ width: window.innerWidth, height: window.innerHeight });
  }

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
  readonly hiddenIds = computed(() => {
    if (!this.edgesOnly()) return new Set<string>();
    const grid = pieceGrid(this.width(), this.height(), this.gridSize()); // the border is also known from where the cell is, not only from the flat sides the piece has
    return new Set(this.placed().filter((p) => p.piece && !JigsawPieces.isBorder(p.piece, grid)).map((p) => p.id));
  });
  /** the pieces that lie in the store frame and are shown (not hidden by "only corner and edge pieces"): the ones that are collected */
  readonly storePieceIds = computed(() => {
    const store = this.store();
    const hidden = this.hiddenIds();
    return store ? this.placed().filter((p) => p.piece && p.centerX >= store.left && !hidden.has(p.id)).map((p) => p.id) : [];
  });

  /**
   * Collect pieces (a click on the empty store frame): all the pieces that lie in the store (the whole scroll area, not only what is shown) are put together at the start of it, close to each other (see
   * `Puzzle.collectPieces`: from the top down when the store scrolls up and down, from the left to the right when it scrolls sideways), and the frame is scrolled to its start so they are seen. Saved like any move of pieces.
   */
  collectPieces(): void {
    this.collect(true);
  }

  /**
   * The overall check, run by itself: a moment after the window has stopped changing (and when the round is opened) a piece that is in none of the places a person can see and reach is brought
   * back into the store (`Puzzle.strayPieces`), so a resize never leaves a piece lost. Only the strays move, and nothing is scrolled.
   */
  private bringBackStrays(): void {
    if (this.moving || this.viewOnly()) return;
    this.collect(false);
  }

  /** Puts pieces together in the store: with `all` the pieces of the store and the strays (a click on the empty store), without it only the strays (the automatic check). */
  private collect(all: boolean): void {
    if (this.viewOnly()) return;
    const store = this.store();
    if (!store) return;
    // below the picture the strip scrolls sideways: all the pieces of the store (every band, not only what is shown) are put from the left end, column by column, in the order they lie across it.
    // Beside the picture the store is shown in slices as wide as the frame, one under the other: the pieces are put in rows inside the first slice, and when it is full in the next one, so no row
    // is split over two slices (the store is made wide enough for as many slices as the pieces need, which the page keeps)
    const stacked = this.stacked();
    const slice = this.sliceWidth();
    // the pieces are put with room to spare across (beside the picture), and then the store is made as wide as the slices they really took: no empty slice is left at the end
    const roomWidth = stacked ? store.width : JIGSAW_MAX_SIDE - store.left;
    const extent = JigsawSettings.extent(this.width(), this.height(), this.gridSize(), Math.max(roomWidth, store.width));
    const before = Puzzle.from(this.placed(), extent.width, extent.height);
    // an overall check: a piece that is in none of the places a person can see and reach (it strayed when the window was made smaller, or the store was changed) is brought back with the rest
    const hidden = this.hiddenIds();
    const strays = before.strayPieces(this.visiblePlaces()).filter((id) => !hidden.has(id));
    const ids = all ? [...new Set([...this.storePieceIds(), ...strays])] : strays;
    if (!ids.length) return;
    const across = stacked ? { bandHeight: this.bandHeight(), stride: this.bandStride() } : undefined;
    const down = stacked ? undefined : { sliceWidth: slice, sliceHeight: this.sliceStride() }; // a slice is packed down to where the next one begins, so the two do not lie over each other
    const next = before.collectPieces(ids, { left: store.left, top: 0, width: stacked ? store.width : slice }, Math.random, across, down);
    const taken = stacked ? 0 : Math.max(0, ...ids.map((id) => (next.get(id)?.centerX ?? store.left) - store.left)); // how far across the pieces go
    const width = stacked ? store.width : Math.max(store.width, Math.min(JIGSAW_MAX_SIDE - store.left, Math.ceil((taken + 1) / slice) * slice));
    if (width > store.width) this.storeWidthChange.emit(width);
    if (next !== before) this.placed.set(next.toData());
    const frame = this.storeInner()?.nativeElement.parentElement;
    if (all && frame) {
      frame.scrollTop = 0;
      frame.scrollLeft = 0;
    }
  }

  /**
   * The places where the middle of a piece can be and be seen and reached, in stored pixels: the picture area with the room under or beside it (as far as the area shows), the free space beside the
   * picture (when the store is below it), and the store. A piece anywhere else has strayed (`Puzzle.strayPieces`).
   */
  private visiblePlaces(): { left: number; top: number; width: number; height: number }[] {
    const store = this.store();
    if (!store) return [];
    const zone = this.zone();
    const stacked = this.stacked();
    const areaHeight = stacked ? (zone ? zone.base : this.height() + this.gridSize()) : this.overlay().height;
    return [
      { left: 0, top: 0, width: store.left, height: areaHeight },
      // the free space beside the picture stands for stored places under the picture: across from 0 (not from `origin`, which is where it is drawn), from `base` down (see `areaPoint`)
      ...(zone ? [{ left: 0, top: zone.base, width: zone.column, height: zone.columns * zone.height }] : []),
      { left: store.left, top: 0, width: store.width, height: store.height },
    ];
  }

  /** how many pieces there are, and how many of them are shown (for the helper banner) */
  readonly pieceCounts = computed(() => {
    const total = this.placed().filter((p) => p.piece).length;
    return { total, shown: total - this.hiddenIds().size };
  });

  /** how big the helper picture is, as a share of the size of the picture (from 1/10 to 1/2) */
  readonly helperScale = signal(readPreference('jigsaw.helperScale', HELPER_SCALE_START, isScale));
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
    const frame = this.shownHelperFrame();
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
  /** the address of a picture to show behind the grid and the objects, covering the picture area (the jigsaw background) */
  readonly picture = input<string | null>(null);

  /** the pieces placed on the picture area (as they are stored) */
  readonly placed = model.required<PlacedObject[]>();

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('area');
  /** the whole board: it keeps the pointer while something is moved, so the move goes on when the object changes place (picture area to store frame) */
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');
  /** how far the store frame is scrolled, in pixels */
  readonly storeScroll = signal(0);
  /** how high the store frame is on the page */
  readonly storeViewHeight = computed(() => (this.stacked() ? this.stripHeight() : this.areaHeight() ? Math.floor(((this.areaHeight() ?? 0) - 2) / this.scale() - 2 * AREA_PADDING_PX) : this.height()));
  /**
   * How high the strip of the store is below the picture, in stored pixels: all that is left of the area under the picture, down to the bottom of the screen, and at
   * least `STACKED_STORE_ROWS` grid steps. The store is shown in bands as high as this, so when the window changes size the pieces are spread over the bands again.
   */
  private readonly stripHeight = computed(() => {
    const least = Math.max(STORE_MIN_HEIGHT_PX, Math.round(STACKED_STORE_ROWS * (this.gridSize() || STORE_MIN_HEIGHT_PX)));
    const area = this.areaHeight();
    if (!area) return least;
    return Math.max(least, Math.floor((area - 2) / this.scale() - 2 * AREA_PADDING_PX - this.height() - this.gridSize()));
  });
  /** what the pieces area has room for on the screen: its width (the area border is not counted) */
  private readonly room = signal<{ width: number; height: number; view: number } | null>(null);
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
   * Whether the store frame is below the picture instead of beside it: on a screen narrower than `--app-store-below` (styles.scss; the same width as where the
   * sidebar of the jigsaw is folded away). Only how it is drawn changes: the pieces keep the places they are stored at, and `place` puts them where the frame is shown.
   */
  readonly stacked = computed(() => {
    const store = this.store();
    const room = this.room();
    if (!store || !room || !(room.width > 0)) return false;
    return room.view < cssNumber('--app-store-below', 1200);
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
      width: 2 * AREA_PADDING_PX + this.width() + this.gutter() + (store ? this.storeFrameWidth() : 0),
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
  /**
   * The free space beside the picture, as a place for pieces. With the store below the picture, the picture is often drawn smaller than the width of the screen (its height decides how
   * big it is), and the room beside it is empty: pieces can be put there too, and never outside it. It stands for the model's free space under the picture (stored places with a centre
   * further down than `base`, which are not in the store) so nothing new is stored: `left` is where it starts, across from the picture, `width` and `height` its size, all in stored pixels
   * (`frameLeft` and `frameTop` are where it begins on the area, with the padding; it has no frame or colour of its own, and the store has none either: the pieces lie on the board). Nothing when the store is beside the picture, or the room is too narrow for it.
   */
  readonly zone = computed(() => {
    const store = this.store();
    if (!store || !this.stacked()) return null;
    const grid = Math.max(this.gridSize(), 10);
    const half = this.gridSize() / 2; // a piece is as big as a grid step: its middle is half a step from its edge
    const left = this.width(); // where the picture area ends: the free space is next to it, with no gap and no padding between: a piece with its middle further across is in the free space
    const origin = left - half; // the free space begins half a piece before that, so a piece whose middle is at `left` is at the left edge of what a piece can be (nothing jumps there)
    const room = this.storeFrameWidth() - origin; // all the room beside the picture, however wide
    if (room < ZONE_MIN_STEPS * grid) return null;
    // the places a column stands for are under the picture (across from 0 to the width of the picture), so a room wider than the picture is cut into columns, each as wide as the picture and one under the other in
    // the stored places; each column begins one piece before the end of the one before, so a piece that is moved from one to the next is at the end of the one where the next begins: it follows the pointer all
    // the way, with no jump (the same as the bands of the strip, `bandStride`)
    const column = this.width();
    const stride = Math.max(1, column - this.gridSize());
    const columns = room <= column ? 1 : Math.min(FREE_SPACE_COLUMNS_MAX, 1 + Math.ceil((room - column) / stride));
    const width = Math.min(room, column + (columns - 1) * stride);
    // `base`: the stored places from there down are the free space (the picture area goes on to there, so a piece goes on from the gutter above the store without a jump); `height`: down to where a piece with
    // its middle on the top edge of the store would end, so a piece can be taken all the way from the free space to the store (the height of one column; the next column is this far further down)
    return {
      left, origin, width, columns, column, stride, height: JigsawSettings.freeSpaceColumnHeight(this.height(), this.gridSize()), base: JigsawSettings.freeSpaceTop(this.height(), this.gridSize()),
      frameLeft: AREA_PADDING_PX + origin, frameTop: AREA_PADDING_PX,
    };
  });

  /** the picture stays where it is and the store frame has the rest of the area: the area does not scroll (only when the store is below and the area fills the screen) */
  readonly fixed = computed(() => this.stacked() && !!this.areaHeight());
  /** how far the store frame is scrolled sideways, in pixels (below the picture it scrolls only sideways) */
  readonly storeScrollX = signal(0);
  /** below the picture the store is cut into bands as high as the strip (the store seen through the frame), laid side by side: how high a band is, in stored pixels */
  private readonly bandHeight = computed(() => Math.max(1, this.storeViewHeight() - 2 * FRAME_BORDER_PX));
  /** how many bands the store has below the picture */
  private readonly bandCount = computed(() => Math.max(1, Math.ceil((this.store()?.height ?? 0) / this.bandHeight())));
  /**
   * Beside the picture the frame scrolls up and down only: when the store is wider than the frame shows, it is cut into slices as wide as the frame, one under
   * the other (the way it is cut into bands below the picture), so the pieces are arranged inside the view. How wide a slice is, in stored pixels:
   */
  private readonly sliceWidth = computed(() => Math.max(1, this.storeFrameWidth() - STORE_SCROLLBAR_PX - 2 * FRAME_BORDER_PX));
  /** how many slices the store has beside the picture (1: the store is not wider than the frame, nothing is cut) */
  readonly sliceCount = computed(() => {
    const store = this.store();
    return !store || this.stacked() ? 1 : Math.max(1, Math.ceil(store.width / this.sliceWidth()));
  });
  /**
   * Beside the picture the slices lie one under the other, each this far from the next: a slice is as high as the store minus one piece, because the middle of a piece is never nearer the top or
   * the bottom of the store than half a piece. So a piece that is moved from one slice to the next is at the bottom of the one where the next begins: it follows the pointer all the way, and the
   * scroller is one frame, with no jump at the seam (the same as the bands below the picture, `bandStride`).
   */
  private readonly sliceStride = computed(() => Math.max(1, (this.store()?.height ?? 0) - this.gridSize()));
  /** the slice a place this far down the scroller (where the middle of a piece is) is in */
  private sliceOfDown(down: number): number {
    return Math.min(this.sliceCount() - 1, Math.max(0, Math.floor((down - this.gridSize() / 2) / this.sliceStride())));
  }
  /** the size of the inside of the store frame: the store as it is, or the bands side by side (below the picture), or the slices one under the other (beside it) */
  readonly storeInnerSize = computed(() => {
    const store = this.store();
    if (!store) return { width: 0, height: 0 };
    if (this.stacked()) return { width: this.bandCount() * this.bandStride() + this.gridSize() / 2, height: this.bandHeight() };
    return this.sliceCount() > 1 ? { width: this.sliceWidth(), height: (this.sliceCount() - 1) * this.sliceStride() + store.height } : { width: store.width, height: store.height };
  });
  /**
   * Below the picture the bands of the store lie side by side, each this far from the next: a band is as wide as the store minus half a piece, because the middle of a piece is never further across
   * than that in the store (the piece is whole inside the area). So a piece that is moved from one band to the next is at the end of the one where the next begins: it follows the pointer all the way, with no jump.
   */
  private readonly bandStride = computed(() => Math.max(1, (this.store()?.width ?? 0) - this.gridSize() / 2));
  /** the band a place in the store (this far down) is in */
  private bandOf(y: number): number {
    return Math.min(this.bandCount() - 1, Math.max(0, Math.floor(y / this.bandHeight())));
  }

  /** below the picture: the store is scrolled away from its left end, so there is more to see to the left */
  readonly canScrollLeft = computed(() => this.stacked() && this.storeScrollX() > 1);
  /** below the picture: the store goes on past the right edge of the frame */
  readonly canScrollRight = computed(() => this.stacked() && this.storeScrollX() + this.storeFrameWidth() - 2 * FRAME_BORDER_PX < this.storeInnerSize().width - 1);

  /** The store frame is scrolled a step (most of what it shows) to the left (-1) or to the right (1). */
  scrollStore(frame: HTMLElement, direction: -1 | 1): void {
    frame.scrollBy({ left: direction * frame.clientWidth * 0.8, behavior: 'smooth' });
  }

  onStoreScroll(event: Event): void {
    const frame = event.target as HTMLElement;
    this.storeScroll.set(frame.scrollTop);
    this.storeScrollX.set(frame.scrollLeft);
  }

  /**
   * Where an object goes in the layer of the pieces, which lies on top of the picture area and the store frame: how far to move it from where it is placed
   * (`shift` across, `shiftY` down), what to cut off a piece of the store that is partly out of the frame at the top or the bottom (`clip`: only there, not at the
   * sides, so a piece can lie over the edge), and whether it is out of the frame altogether (`hidden`: a piece that has been scrolled out of sight).
   */
  place(v: { anchor?: string; p?: { id: string }; inStore: boolean; left: number; top: number; object: { width: number } }): { shift: number; shiftY: number; clip: string | null; hidden: boolean } {
    // a group of pieces that stick together is one piece: it is put where the piece that stands for it is, all the pieces by the same shift, so a group is never torn when it passes the edge
    // of the picture, the free space or the store (the store cuts a piece at its edge: a piece of a group is not cut by itself)
    const anchor = v.anchor && v.p && v.anchor !== v.p.id ? this.viewById().get(v.anchor) : undefined;
    if (anchor) return { ...this.placeOwn(anchor), clip: null };
    return this.placeOwn(v);
  }

  private placeOwn(v: { inStore: boolean; left: number; top: number; object: { width: number } }): { shift: number; shiftY: number; clip: string | null; hidden: boolean } {
    const store = this.store();
    const size = v.object.width;
    const zone = this.zone();
    // a piece of the free space beside the picture: its place under the picture in the model is drawn beside the picture, where the free space is
    if (zone && !v.inStore && v.top + size / 2 >= zone.base) {
      const k = Math.min(zone.columns - 1, Math.max(0, Math.floor((v.top + size / 2 - zone.base) / zone.height))); // the column of the free space it is in: the next one is drawn further across
      return { shift: -(zone.frameLeft + k * zone.stride), shiftY: zone.base + k * zone.height - zone.frameTop, clip: null, hidden: false };
    }
    if (!store || !v.inStore) return { shift: -AREA_PADDING_PX, shiftY: -AREA_PADDING_PX, clip: null, hidden: false }; // on the picture area: the picture area is where the area's padding ends
    const reach = Math.ceil(size * TAB_REACH);
    const scroll = this.storeScroll();
    const shown = this.storeViewHeight() - 2 * FRAME_BORDER_PX; // the height of what the frame shows
    const stacked = this.stacked();
    // where the piece is in the store as the frame has it: as stored, or in its band (below the picture; a piece is shown whole, not cut by the edge of its band)
    const band = stacked ? this.bandOf(v.top + size / 2) : 0;
    const slices = this.sliceCount();
    const slice = slices > 1 ? Math.min(slices - 1, Math.max(0, Math.floor((v.left + size / 2 - store.left) / this.sliceWidth()))) : 0; // beside the picture: the slice it is in
    const inLeft = slices > 1 ? Math.min(Math.max(v.left - store.left - slice * this.sliceWidth(), 0), Math.max(0, this.sliceWidth() - size)) : v.left - store.left + band * this.bandStride();
    const inTop = stacked ? Math.min(Math.max(v.top - band * this.bandHeight(), 0), Math.max(0, this.bandHeight() - size)) : v.top + slice * this.sliceStride();
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
    const frameLeft = stacked ? AREA_PADDING_PX : AREA_PADDING_PX + this.width() + this.gutter(); // the frame is beside the picture area, a small gap from it, or below it
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
  /** the rectangle that is being dragged to pick objects */
  readonly marquee = signal<Box | null>(null);

  /** the placed objects, as the classes that work on them */
  /** the room between the picture area and the store frame beside it (`JigsawSettings.storeGap`) */
  protected readonly gutter = computed(() => JigsawSettings.storeGap(this.gridSize()));
  /** the store frame beside the picture area, where the pieces of a jigsaw wait (null: none) */
  readonly store = computed(() => JigsawSettings.storeFrame(this.width(), this.height(), this.gridSize(), this.storeWidth()));
  private readonly puzzle = computed(() => {
    const extent = JigsawSettings.extent(this.width(), this.height(), this.gridSize(), this.storeWidth()); // the whole jigsaw pieces area
    const settled = Puzzle.from(this.placed(), extent.width, extent.height).settled(); // no free piece below a fixed one, and none outside the area
    const zone = this.zone();
    const store = this.store();
    if (!store) return settled;
    // a piece in the free space beside the picture is always inside what is shown of it (the space shows less of the model than it stands for)
    if (zone) {
      // every column of the free space on its own: the free pieces whose middle is in it are pulled into what is shown of it (the last column takes what lies further down, and is as wide as the room is)
      let confined = settled;
      for (let k = 0; k < zone.columns; k++) {
        const top = zone.base + k * zone.height;
        const last = k === zone.columns - 1;
        confined = confined.confine({ left: 0, top, width: store.left, height: last ? extent.height - top : zone.height }, { left: 0, top, width: last ? zone.width - k * zone.stride : zone.column, height: zone.height });
      }
      return confined;
    }
    // the store is below the picture and there is no room beside it (a narrow window, or the window was made smaller): a free piece lies on the picture or in the gutter above the store, never further down, where nothing of the area is shown
    if (this.stacked()) return settled.confine({ left: 0, top: this.height(), width: store.left, height: extent.height }, { left: 0, top: 0, width: store.left, height: this.height() + 2 * this.gridSize() });
    return settled;
  });
  /** the pieces that were held, the last first: the one that is held, or was held last, stands for its group (see `Puzzle.groupAnchors`) */
  private readonly anchorPrefs = signal<readonly string[]>([]);
  /** for every object, the one that stands for its group: pieces that stick together are one piece, so where the group is shown is decided by one of them */
  private readonly groupAnchors = computed(() => this.puzzle().groupAnchors(this.anchorPrefs()));
  /** the placed objects as they are drawn, with their box at their centre */
  readonly view = computed(() =>
    this.puzzle().items.map((item) => ({
      anchor: this.groupAnchors().get(item.id) ?? item.id,
      p: item.data,
      layer: item.layer,
      object: item.object,
      left: item.left,
      top: item.top,
      piece: item.data.piece ?? null,
      matched: !!item.data.piece && JigsawPieces.matched({ col: item.data.piece.col, row: item.data.piece.row, size: item.object.width, centerX: item.centerX, centerY: item.centerY }),
      hidden: this.hiddenIds().has(item.id),
      inStore: !!this.store() && item.centerX >= (this.store()?.left ?? Infinity),
    })),
  );

  /** the drawn objects by id (a piece of a group looks up the piece that stands for the group) */
  private readonly viewById = computed(() => new Map(this.view().map((v) => [v.p.id, v] as const)));

  /** how many pieces the picture is cut into across and down (a piece of the jigsaw shows its own part of the picture) */
  readonly pieceGrid = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** the picture shown behind the picture area: not when the picture is cut into pieces (the pieces are the picture then; the help frame shows it) */
  readonly backdrop = computed(() => (this.placed().some((p) => p.piece) ? null : this.picture()));

  /** the placed object that is being moved: the pointer's distance from its centre (or from the end that was grabbed), and the picture area it is in */
  private moving: { id: string; ids: string[]; dx: number; dy: number; screen?: { dx: number; dy: number }; matchedAtStart: ReadonlySet<string>; stuckAtStart: ReadonlySet<string> } | null = null;

  /** where a rectangle drag on the empty picture area started */
  private marqueeStart: { x: number; y: number } | null = null;
  /** whether that drag started on the empty store frame: a click there (no drag) collects the pieces */
  private marqueeInStore = false;

  constructor() {
    // the overall check of where the pieces are: a moment after what decides the places that can be seen (the window, the store, the free space) or where the pieces are has stopped changing
    effect((onCleanup) => {
      this.visiblePlaces();
      this.placed();
      if (!this.room() || !this.areaHeight() || !this.placed().length) return; // not measured yet: the places are not known
      const timer = setTimeout(() => this.bringBackStrays(), 600);
      onCleanup(() => clearTimeout(timer));
    });
    // the texts of the board are read through `t()` (not the `*transloco` directive, which is what loads a scope), so the board loads its own file, for each language chosen
    const transloco = inject(TranslocoService);
    transloco.langChanges$.pipe(switchMap((lang) => transloco.load(`jigsawBoard/${lang}`)), takeUntilDestroyed(this.destroyRef)).subscribe();
    onAnyScroll(this.destroyRef, () => this.measureArea()); // the page may scroll inside the window (a phone), not the window
    // the pieces area fills the screen: measured when the page is drawn, and again when the window is resized or scrolled
    afterNextRender(() => {
      this.measureArea();
      // the room for the area changes with the window, and with the sidebar and the page around it
      const watch = new ResizeObserver(() => this.measureArea());
      watch.observe(this.root().nativeElement);
      this.destroyRef.onDestroy(() => watch.disconnect());
    });
    // what the person chose for the helper stays for the session: when the page is reloaded or left and come back to, the switches, and the place and size of the frame, are as they were
    // the top menu shows the helper while this board has it, and what it needs to know about the board
    const helper = this.jigsawHelper;
    effect(() => helper.active.set(this.helperBanner()));
    effect(() => helper.hasPicture.set(!!this.picture()));
    effect(() => helper.hasPieces.set(this.hasPieces()));
    effect(() => helper.counts.set(this.pieceCounts()));
    this.destroyRef.onDestroy(() => helper.active.set(false));
    // beside the picture the frame can be wider than the store the pieces were spread over (a wide screen): the store is made as wide as the frame, so a piece can go all the way across it (the page keeps it)
    effect(() => {
      const store = this.store();
      if (!store || this.stacked() || this.viewOnly()) return;
      const wanted = Math.min(JIGSAW_MAX_SIDE - store.left, this.storeFrameWidth() - STORE_SCROLLBAR_PX);
      if (wanted > store.width) untracked(() => this.storeWidthChange.emit(wanted));
    });
    effect(() => writePreference('jigsaw.helperFrame', this.helperFrame()));
    effect(() => writePreference('jigsaw.helperScale', this.helperScale()));
    // draw the grid again whenever the size or the grid changes (a new width or height clears the canvas)
    effect(() => {
      const element = this.canvas()?.nativeElement;
      const width = this.width();
      const height = this.height();
      if (!element || !(width >= JIGSAW_MIN_SIDE) || !(height >= JIGSAW_MIN_SIDE)) return;
      element.width = width;
      element.height = height;
      if (this.gridVisible()) this.drawGrid(element, this.gridSize(), this.gridInset(), this.numberPoints());
    });
    // what is picked has to be on the picture area: another jigsaw was opened, or an object was taken away
    effect(() => {
      const there = new Set(this.placed().map((p) => p.id));
      const picked = untracked(() => this.selection());
      const kept = picked.filter((id) => there.has(id));
      if (kept.length !== picked.length) this.selection.set(kept);
    });
  }

  /** Measures what is left of the visible screen below the top of the pieces area (when it fills the screen); the area is at least 200 px high. */
  @HostListener('window:resize')
  measureArea(): void {
    const root = this.root().nativeElement;
    this.areaHeight.set(this.fillScreen() ? Math.max(200, Math.floor(window.innerHeight - bottomBarHeight() - root.getBoundingClientRect().top - SCREEN_MARGIN_PX)) : null);
    const width = root.clientWidth; // the room is what the page gives the area: it does not grow with its content
    const now = this.room();
    if (now?.width !== width || now.view !== window.innerWidth) this.room.set({ width, height: 0, view: window.innerWidth });
  }

  /** the distance between the points the centres stick to: the grid, or a pixel when the grid is not shown */
  private get step(): number {
    return this.gridVisible() && this.gridSize() > 0 ? this.gridSize() : 1;
  }

  /** where the grid points start on each axis: 0, or half a step for a grid whose points are half a step in from the edge (they are the points the centres stick to) */
  private get origin(): number {
    return this.gridInset() && this.gridVisible() && this.gridSize() > 0 ? this.gridSize() / 2 : 0;
  }

  /** A grid point every `step` pixels, starting at 0,0 (or half a step in when `inset`): one small tile of the grid filled over the whole picture area. */
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

  /** Grab a piece (mouse, pen or finger): it is picked, and follows the pointer until it is let go. */
  startMove(event: PointerEvent, item: PlacedObject): void {
    if (this.viewOnly()) return;
    const { x, y } = this.areaPoint(event);
    // grabbing one of several picked objects moves them all; grabbing another object picks only that one
    const picked = this.selection();
    const inSelection = picked.length > 1 && picked.includes(item.id);
    if (!inSelection) this.selection.set([item.id]);
    // the pieces that stick together move together: a piece takes the group it is stuck to with it, always: a bond is never broken (Shift does not take a piece alone any more)
    // a piece on its own place is fixed, and so is the whole group it sticks to: they are picked, but never moved (see `Puzzle.isFixed`)
    const free = item.piece ? this.puzzle().movable(inSelection ? [...picked] : [item.id]) : inSelection ? [...picked] : [item.id];
    if (!free.includes(item.id)) return;
    const wanted = free;
    const ids = item.piece ? this.puzzle().stuckGroup(wanted) : wanted;
    if (item.piece) {
      // a piece that is picked up goes in front of the others and stays there when it is dropped (a group keeps its order)
      let puzzle = this.puzzle();
      for (const id of [...ids].sort((a, b) => (puzzle.get(a)?.layer ?? 0) - (puzzle.get(b)?.layer ?? 0))) puzzle = puzzle.bringToFront(id);
      this.apply(puzzle);
    }
    // the held piece stands for its group while it is held (and after: until another piece is held), so the group is drawn where the held piece is
    this.anchorPrefs.update((now) => [item.id, ...now.filter((id) => id !== item.id)].slice(0, 40));
    // the distance from the pointer to what is moved, so it does not jump to the pointer
    const grabbed = { x: item.centerX, y: item.centerY };
    // a piece follows the pointer on the screen: how far the pointer is from the middle of the piece as it is drawn, so the piece does not jump when the pointer
    // goes from one part of the area to another (the strip of the store, the picture and the free space map to the stored places in different ways)
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const screen = item.piece ? { dx: event.clientX - (box.left + box.width / 2), dy: event.clientY - (box.top + box.height / 2) } : undefined;
    this.moving = { id: item.id, ids, dx: x - grabbed.x, dy: y - grabbed.y, screen, matchedAtStart: this.matchedAmong(this.puzzle(), ids), stuckAtStart: new Set(this.puzzle().stuckGroup(ids)) };
    this.capture(this.root().nativeElement, event); // not the object: it is made again in the store frame when it is moved there
  }

  /**
   * Where the pointer is on the jigsaw pieces area, in the pixels the objects are placed in: over the store frame (which can be scrolled) it is where
   * the frame is, beside the picture area; anywhere else it is on the part of the jigsaw pieces area that is left of the frame (the picture area and the blank space
   * under it), and not outside what the area shows.
   */
  private areaPoint(event: { clientX: number; clientY: number }, piece = false): Point {
    const store = this.store();
    const inner = this.storeInner()?.nativeElement;
    if (store && inner) {
      const frame = (inner.parentElement as HTMLElement).getBoundingClientRect();
      // a piece (its middle) is in the store below the top edge of the frame by half a piece when the store is below the picture: a piece in the store is whole inside it, so higher up it is a free piece, and it follows the pointer all the way
      const top = frame.top + (piece && this.stacked() ? (this.gridSize() / 2) * this.scale() : 0);
      // beside the picture the frame has a scroll bar and a border at its right edge, and the board a little more: a pointer there is still at the right end of the store, not back at the picture
      const clientX = !this.stacked() && event.clientX > frame.right ? frame.right : event.clientX;
      if (clientX >= frame.left && clientX <= frame.right && event.clientY >= top && event.clientY <= frame.bottom) {
        const rect = inner.getBoundingClientRect(); // moves with the scrolling of the frame
        const across = (clientX - rect.left) / this.scale();
        const down = (event.clientY - rect.top) / this.scale();
        if (!this.stacked()) {
          const slices = this.sliceCount();
          if (slices === 1) return { x: store.left + across, y: down };
          const slice = this.sliceOfDown(down); // beside the picture: the slice the pointer is over
          // across stays inside the slice: the frame is a little wider than a slice (border, scroll bar), and further across a piece would be in the next slice, which is under this one
          const inSlice = Math.min(Math.max(across, 0), this.sliceWidth() - 1);
          return { x: store.left + Math.min(inSlice + slice * this.sliceWidth(), store.width), y: Math.min(Math.max(down - slice * this.sliceStride(), 0), store.height) };
        }
        const band = Math.min(this.bandCount() - 1, Math.max(0, Math.floor(across / this.bandStride()))); // below the picture: the band the pointer is over
        return { x: store.left + Math.min(across - band * this.bandStride(), store.width), y: Math.min(down + band * this.bandHeight(), store.height) };
      }
    }
    // not over the store frame: anywhere on the area that is left of it, the picture and the blank space under it, as far as the area shows
    const rect = (this.canvas()?.nativeElement as HTMLElement).getBoundingClientRect();
    const zone = this.zone();
    if (zone && (event.clientX - rect.left) / this.scale() >= zone.left) {
      // over the free space beside the picture: its own place, never outside it
      // the middle of a piece is at least half a piece from the edges of the free space (the same as `confine` keeps it), so the place the pointer gives is where the piece stays: no pull back, no flicker
      const half = this.gridSize() / 2;
      const u = Math.min(Math.max((event.clientX - rect.left) / this.scale() - zone.origin, half), zone.width - half); // how far across the free space, over all its columns
      const v = Math.min(Math.max((event.clientY - rect.top) / this.scale(), half), zone.height - half);
      const k = Math.min(zone.columns - 1, Math.max(0, Math.floor((u - half) / zone.stride))); // the column the pointer is over
      return { x: u - k * zone.stride, y: zone.base + k * zone.height + v };
    }
    const area = this.root().nativeElement.getBoundingClientRect();
    // below the picture the store strip is not beside it: the area is as wide as the picture, and with the free space beside it as wide as to where that begins (so a piece goes on without a jump from the one to the other)
    const reach = store && !this.stacked() ? store.left : zone ? zone.left : this.width();
    // a piece goes anywhere on the area, down to the bottom of the screen; with the free space beside the picture, the places under the picture are that space (below), so the picture area ends at the picture
    const lowest = zone ? zone.base - 1 : Math.max(this.height(), (area.bottom - rect.top) / this.scale() - AREA_PADDING_PX);
    return { x: Math.min(Math.max((event.clientX - rect.left) / this.scale(), 0), reach), y: Math.min(Math.max((event.clientY - rect.top) / this.scale(), 0), lowest) };
  }

  /**
   * A place on the screen kept on the board while a piece is moved: not outside the pieces area, and, with the store below the picture, not below the store (a piece dragged further down
   * stays at the bottom of the store: it is blocked there, it does not jump to another place). So a piece is never outside what is shown.
   */
  private onBoard(clientX: number, clientY: number): { clientX: number; clientY: number } {
    const area = this.root().nativeElement.getBoundingClientRect();
    const frame = this.storeInner()?.nativeElement.parentElement?.getBoundingClientRect();
    const bottom = frame && this.stacked() ? Math.min(area.bottom, frame.bottom - 1) : area.bottom;
    const half = (this.gridSize() / 2) * this.scale(); // the middle of a piece is kept half a piece in, so the whole piece is on the board
    return { clientX: Math.min(Math.max(clientX, area.left + half), area.right - half), clientY: Math.min(Math.max(clientY, area.top + half), bottom - half) };
  }

  /** What is grabbed follows the pointer: the puzzle moves the piece, or the group of pieces (see `Puzzle`). */
  moveMove(event: PointerEvent): void {
    const moving = this.moving;
    if (!moving) return;
    const puzzle = this.puzzle();
    const placed = puzzle.get(moving.id);
    if (!placed) return;
    const screen = moving.screen;
    const middle = screen ? this.onBoard(event.clientX - screen.dx, event.clientY - screen.dy) : null; // where the middle of the piece is, kept on the board
    const point = middle ? this.areaPoint(middle, true) : this.areaPoint(event);
    const x = screen ? point.x : point.x - moving.dx;
    const y = screen ? point.y : point.y - moving.dy;
    if (moving.ids.length > 1) {
      // several picked objects, or pieces that stick together: all move by as much as the one that is held (see `Puzzle.moveGroup`)
      this.apply(puzzle.moveGroup(moving.ids, x - placed.centerX, y - placed.centerY));
      return;
    }
    this.apply(puzzle.moveFigure(moving.id, x, y, this.step, this.origin));
  }

  /**
   * What is moved is let go. A piece (or the group of pieces that stick together) that is dropped within the range of its own grid point, or of a place
   * where it fits a neighbour, clicks into place (see `Puzzle.dropPieces` and `snapRange`): it goes exactly there, the piece that was dropped
   * blinks (only that one, not the group it joined), and the device vibrates. A piece does not click while it is moved, only when it is dropped.
   */
  endMove(): void {
    const moving = this.moving;
    this.moving = null;
    if (!moving) return;
    if (!this.hasMoved() && !this.viewOnly()) {
      this.hasMoved.set(true);
      writePreference(HAS_MOVED_KEY, true);
    }
    const ids = moving.ids;
    const before = this.puzzle();
    const dropped = before.dropPieces(ids, this.snapRange());
    if (dropped !== before) this.apply(dropped);
    const fresh = [...this.matchedAmong(dropped, ids)].filter((id) => !moving.matchedAtStart.has(id)); // in place now, and was not when it was picked up
    const joined = dropped.stuckGroup(ids).filter((id) => !moving.stuckAtStart.has(id)); // pieces that stick to what was moved now, and did not when it was picked up
    // only the piece that was dropped blinks (not the whole group it clicked into): the person sees which piece clicked
    if (fresh.length || joined.length) this.blink([moving.id]);
  }

  /** which of these objects are jigsaw pieces on their own place */
  private matchedAmong(puzzle: Puzzle, ids: readonly string[]): Set<string> {
    return new Set(
      ids.filter((id) => {
        const p = puzzle.get(id);
        const piece = p?.data.piece;
        return !!piece && !!p && JigsawPieces.matched({ col: piece.col, row: piece.row, size: p.object.width, centerX: p.centerX, centerY: p.centerY });
      }),
    );
  }

  /** picks only this object */
  select(id: string): void {
    if (this.viewOnly()) return; // another player's round is only looked at: nothing is picked
    this.selection.set([id]);
  }

  /** Dragging on the empty picture area or the empty store frame picks the objects the rectangle touches (the objects stop their own pointer events, so this is only what is empty). */
  startMarquee(event: PointerEvent): void {
    if (this.viewOnly()) return;
    const { x, y } = this.areaPoint(event); // on the picture area, or on the store frame (which can be scrolled)
    this.marqueeStart = { x, y };
    this.marqueeInStore = !!this.store() && event.currentTarget === this.storeInner()?.nativeElement;
    this.selection.set([]);
    this.capture(this.root().nativeElement, event);
  }

  moveMarquee(event: PointerEvent): void {
    const start = this.marqueeStart;
    if (!start) return;
    const { x, y } = this.areaPoint(event);
    const box: Box = { left: Math.min(start.x, x), top: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
    this.marquee.set(box);
    this.selection.set(this.puzzle().itemsIn(box).filter((id) => !this.hiddenIds().has(id))); // what is hidden is not picked
  }

  endMarquee(): void {
    const box = this.marquee();
    const clicked = !!this.marqueeStart && this.marqueeInStore && (!box || (box.width < CLICK_MAX_PX && box.height < CLICK_MAX_PX)); // pressed and let go on the empty store frame
    this.marqueeStart = null;
    this.marqueeInStore = false;
    this.marquee.set(null);
    if (clicked) this.collectPieces(); // a click on the empty store frame collects the pieces 
  }

  /** keeps the result of a move when the puzzle changed (the puzzle gives back itself when nothing changed) */
  private apply(next: Puzzle): void {
    if (this.viewOnly()) return; // another player's round is only looked at
    if (next === this.puzzle()) return;
    // a piece is never lost: a change that would leave out or add an object (it cannot happen by the rules of `Puzzle`, this is the last line of defence) is not taken
    const now = this.placed();
    const data = next.toData();
    if (data.length !== now.length || data.some((p, i) => p.id !== now[i].id)) return;
    this.placed.set(data);
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
