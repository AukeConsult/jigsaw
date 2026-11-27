import { PlayLookSetup } from '../../models/shared/play-look';
import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, Injector, afterNextRender, HostListener, inject, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { switchMap } from 'rxjs';
import { tr } from '../../core/i18n';
import { PuzzlePiece } from '../../jigsaw/puzzle-piece/puzzle-piece';
import { isBoolean, readPreference, writePreference, preferenceSignal } from '../../core/preferences';
import { JigsawHelper } from '../../jigsaw/jigsaw-helper';
import { PlayLook } from '../../jigsaw/play-look';
import { playSnap } from '../snap-sound';
import { cssNumber, cssVar, footerTop, onAnyScroll } from '../../core/theme';
import { FREE_SPACE_COLUMNS_MAX, JIGSAW_MAX_SIDE, JIGSAW_MIN_SIDE, JigsawSettings } from '../../models/shared/jigsaw-settings';
import { Puzzle } from '../../models/shared/puzzle';
import { JigsawPieces, pieceGrid } from '../../models/shared/jigsaw';
import { Box, Point } from '../../models/shared/geometry';
import { areaMargin, PlacedObject } from '../../models/shared/placed'; // the margin round the picture on the pieces area: a piece may go into it (the model), and the board draws it (the padding of `.scale-content` in `jigsaw-board.html`, `margin`, at the top and the left, at the right when there is no store beside the picture, and at the bottom when the store is not below)

/** Grid points closer than this are not numbered: the numbers would run into each other. */
const MIN_NUMBERED_STEP_PX = 20;
/** What is kept free below the jigsaw pieces area at the bottom of the screen, in pixels. */
const SCREEN_MARGIN_PX = 8;
/** The store frame below the picture is at least this high, in stored pixels. */
const STORE_MIN_HEIGHT_PX = 100;
/** The room the scroll bar of the store frame takes beside its pieces, in pixels. */
const STORE_SCROLLBAR_PX = 5;
/** A press on the empty store frame that moves less than this is a click (stored pixels). */
const CLICK_MAX_PX = 6;
/** The jigsaw pieces area is never drawn smaller than this share of the stored size (the picture is fitted to the screen down to here), and never bigger than the stored size. */
const SCALE_MIN = 0.1;
/** A jigsaw is drawn at most this many times bigger than its stored size. */
const SCALE_MAX = 4;
/** With the store frame beside the picture, the picture gets this share of the room to begin with and the frame the rest (the frame scrolls sideways when the pieces need more). */
/** the store frame beside the picture is at most this many pieces wide (and at the right edge of the board, with the picture getting all the room that is left) */
const STORE_MAX_PIECES_ACROSS = 2.5;
/** With the store frame below the picture it is at least this many grid steps high (it goes on down to the bottom of the screen) and scrolls sideways only: the store is cut into bands as high as the strip, laid side by side. */
const STACKED_STORE_ROWS = 2;
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
/** The padding of the box of the board (Bootstrap's `p-1` on `.board-root`, 0.25rem), in pixels on the screen: the small gap between the box and the working area (the yellow one). */
const ROOT_PADDING_PX = 4;
/** How far the tabs of a piece reach out of its square, as a share of its side (with some to spare). */
const TAB_REACH = 0.4;

/** How far a piece that lies loose is turned at most, either way, in degrees: only how it is drawn, its place and what it clicks to are as if it lay straight. */
const TILT_MAX_DEG = 4;

/** Where it is kept on the device that a piece has been moved (the first-move hint is then not shown any more). */
const HAS_MOVED_KEY = 'jigsaw.hasMoved';

/**
 * The jigsaw pieces area: the grid, the pieces placed on it, what is picked, and what the person does with them (move, pick with a rectangle,
 * collect). What the pieces do (stick together, click into place, move as a group) is done by the model classes (`Puzzle` and the placed
 * objects); the board turns what the person does into calls to them and keeps the result in `placed`, which the page saves.
 */
/** The layer a held piece is drawn on while it is held: above every piece and every other object, whatever layers they have (its own layer in the model is not changed, so it is back where it was when it is let go). */
const HELD_LAYER = 100000;

/**
 * A piece (or a group of pieces that stick together) that is held moves freely on the screen: it is drawn where the pointer is, above everything, whatever lies under it (the picture, the free space, the
 * store), and nothing is worked out for it until it is let go. Then the place the pointer is over is turned into a place on the board (`JigsawBoard.endMove`). So there are no jumps while it is held:
 * the areas (which map to the stored places in different ways) are only used once.
 */
interface FreeDrag {
  /** the drawn elements that move (the pieces that are shown) */
  elements: HTMLElement[];
  /** where the middle of the held piece was on the screen when it was picked up */
  start: { x: number; y: number };
  /** the box of all that is held, on the screen, when it was picked up */
  box: { left: number; top: number; right: number; bottom: number };
  /** how far it has moved on the screen (kept on the board) */
  delta: { x: number; y: number };
}

/** One object as it is drawn: where its box is, its layer, and what is known about it for the page (`JigsawBoard.view`). */
interface BoardView {
  /** it is held now: it is drawn whole, never cut off at the edge of the store frame it was lying in */
  held: boolean;
  anchor: string;
  p: PlacedObject;
  layer: number;
  object: { width: number };
  left: number;
  top: number;
  piece: NonNullable<PlacedObject['piece']> | null;
  matched: boolean;
  hidden: boolean;
  inStore: boolean;
  /** it sticks to no other piece: only such a piece is turned a little and grows when it is held (a group stays as it fits) */
  single: boolean;
}

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
  /** the board offers the helper picture (the whole picture, small, in a frame that floats over the page); the switch that shows or hides it is not the board's (`JigsawHelper`) */
  readonly helperBanner = input(false);
  /** whether the helper picture is shown (on to begin with) */
  private readonly jigsawHelper = inject(JigsawHelper);
  readonly helper = this.jigsawHelper.helper; // the switch is in the menu of the app (see `JigsawHelper`)
  /** the helper picture is shown: the switch is on, and the round is not completed (a completed round has no helper) */
  readonly helperShown = computed(() => this.helper() && !this.jigsawHelper.solved());
  /** where the floating frame of the helper picture is on the window (its top left corner, in pixels): it can be moved by its title */
  readonly helperFrame = preferenceSignal('jigsaw.helperFrame', { x: Math.max(8, window.innerWidth - 260), y: 70 }, isPlace);
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

  /** the colour a jigsaw chose for its own picture area (the usual one counts as none: the table then gives the mat) */
  protected readonly ownColor = computed(() => {
    const colour = this.backColor();
    return colour && colour.toLowerCase() !== JigsawSettings.DEFAULT_BACK_COLOR.toLowerCase() ? colour : null;
  });

  /** the table and the sound of the round that is shown, over the player's preference (null: the preference) */
  readonly roundLook = input<PlayLookSetup | null>(null);
  private readonly preference = inject(PlayLook);
  /** the table the pieces lie on and whether a click is heard */
  protected readonly look = computed(() => this.roundLook() ?? this.preference.value());

  /** how a loose piece is turned, in degrees: its own, and the same every time it is drawn (from its id) */
  protected tilt(id: string): string {
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum = (sum * 31 + id.charCodeAt(i)) % 9973;
    return `${(sum % (2 * TILT_MAX_DEG + 1)) - TILT_MAX_DEG}deg`;
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
  readonly edgesOnly = this.jigsawHelper.edgesOnly; // the switch is in the menu of the app
  /** the board has jigsaw pieces */
  readonly hasPieces = computed(() => this.placed().some((p) => p.piece));
  /** the pieces that are hidden because only corner and edge pieces are shown: the ones from the inside of the picture */
  readonly hiddenIds = computed(() => {
    if (!this.edgesOnly() || this.jigsawHelper.solved()) return new Set<string>(); // a completed round shows every piece
    const grid = pieceGrid(this.width(), this.height(), this.gridSize()); // the border is also known from where the cell is, not only from the flat sides the piece has
    return new Set(this.placed().filter((p) => p.piece && !JigsawPieces.isBorder(p.piece, grid)).map((p) => p.id));
  });
  /** no piece lies on the picture area (by its middle) yet: the area then says what to do with it, as a watermark */
  readonly emptyPicture = computed(() => {
    const pieces = this.placed().filter((p) => p.piece);
    return pieces.length > 0 && !pieces.some((p) => p.centerX >= 0 && p.centerX <= this.width() && p.centerY >= 0 && p.centerY <= this.height());
  });

  /**
   * the pieces that lie in the store (by their middle) and are shown (not hidden by "only corner and edge pieces"): the ones that are collected. This is deliberately not `belongsToStore` (rule 3,
   * whole inside): the first scatter of a round, made without knowing the width of a slice, leaves pieces over the edge of a slice that no pointer can put there, so by rule 3 they are free pieces;
   * a click on the scroller (and the Edges switch) still has to gather them, or they would stay lying over the frame for ever. It only runs when the person asks.
   */
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
    if (all) this.storeFitted.set(true); // the scroller is now as long as its pieces (`storeUsed`)
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
    const areaHeight = stacked && zone ? zone.base : this.overlay().height; // all of the working area, over the strip of the store too (only with a free space beside the picture are the places under it that space)
    return [
      { left: 0, top: 0, width: store.left, height: areaHeight },
      // the free space beside the picture stands for stored places under the picture: across from 0 (not from `origin`, which is where it is drawn), from `base` down (see `areaPoint`)
      ...(zone ? [{ left: 0, top: zone.base, width: zone.column, height: zone.columns * zone.height }] : []),
      { left: store.left, top: 0, width: store.width, height: store.height },
    ];
  }

  /** how big the helper picture is, as a share of the size of the picture (from 1/10 to 1/2) */
  readonly helperScale = preferenceSignal('jigsaw.helperScale', HELPER_SCALE_START, isScale);
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
  /** the margin round the picture on the pieces area, in stored pixels (it is scaled with the area): relative to the size of the picture (`areaMargin`), the same number the model and the layout work with */
  protected readonly margin = computed(() => areaMargin(this.width(), this.height()));
  readonly storeViewHeight = computed(() => (this.stacked() ? this.stripHeight() : this.areaHeight() ? Math.floor(((this.areaHeight() ?? 0) - 2 * ROOT_PADDING_PX) / this.scale() - 2 * this.margin()) : this.height()));
  /**
   * How high the strip of the store is below the picture, in stored pixels: all that is left of the area under the picture, down to the bottom of the screen, and at
   * least `STACKED_STORE_ROWS` grid steps. The store is shown in bands as high as this, so when the window changes size the pieces are spread over the bands again.
   */
  private readonly stripHeight = computed(() => Math.round(STACKED_STORE_ROWS * (this.gridSize() || STORE_MIN_HEIGHT_PX)) + STORE_SCROLLBAR_PX); // only a few pieces high, and its scroll bar under them
  /** what the pieces area has room for on the screen: its width (the area border is not counted) */
  private readonly room = signal<{ width: number; height: number; view: number } | null>(null);
  /**
   * How big the pieces area is drawn compared with the stored pixels (at most 1): the picture, with the space round it, is fitted to the room there is, in its own
   * proportions, so it is whole on any screen. Everything on the area is drawn at this scale (the pieces, the grid, the frames); what the person does on it is
   * turned back to stored pixels, so the jigsaw is the same on every screen.
   */
  // the order a view is set up in: the working area (the yellow one: `room`, `areaHeight`) is found first, the picture area (blue) is placed in it here, and the store frame (the scroller, pink) last (`storeFrameWidth`, `frameExtra`)
  readonly scale = computed(() => {
    const room = this.room();
    const store = this.store();
    // as wide as what is drawn: the picture and the store frame, side by side or one above the other
    // beside the picture the store frame is narrow (`storeFrameWidth`) and counted: the picture gets all the room that is left; below it the frame is not counted: it takes the room below, and scrolls sideways
    const wide = store && !this.stacked() ? this.margin() + this.width() + this.gutter() + this.storeFrameWidth() : this.width() + 2 * this.margin();
    const share = 1;
    const high = this.height() + 2 * this.margin();
    if (!room || !(room.width > 0) || !(wide > 0)) return 1;
    const left = (this.areaHeight() ?? 0) - 2 * ROOT_PADDING_PX; // the height the area has, when it fills the screen
    const below = this.stacked() ? (this.gridSize() || STORE_MIN_HEIGHT_PX) + this.stripHeight() : 0; // the strip of the store below the picture needs room too
    const fit = Math.min((room.width * share) / wide, left > 0 ? left / (high + below) : Infinity);
    return Math.min(store ? SCALE_MAX : 1, Math.max(SCALE_MIN, fit)); // a jigsaw is drawn bigger than its stored size when the room is there: the picture gets 2/3 of the width
  });
  /**
   * Whether the store frame is below the picture instead of beside it: on a screen narrower than `--app-store-below` (styles.scss).
   * Only how it is drawn changes: the pieces keep the places they are stored at, and `place` puts them where the frame is shown.
   */
  readonly stacked = computed(() => {
    const store = this.store();
    const room = this.room();
    if (!store || !room || !(room.width > 0)) return false;
    return room.view < cssNumber('--app-store-below', 1200);
  });
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  /** how big the layer of the pieces is: the whole area, so it scrolls with it */
  readonly overlay = computed(() => {
    const store = this.store();
    if (store && this.stacked()) {
      // the layer of the pieces is the whole area, also the free space under the strip, where a piece can be put anywhere
      // the working area fills the screen down to the footer (and is never lower than what is in it: the picture, a step, the strip of the store); the strip lies against its bottom edge (`stripExtra`)
      const shown = this.areaHeight() ? ((this.areaHeight() ?? 0) - 2 * ROOT_PADDING_PX) / this.scale() : 0;
      return { width: 2 * this.margin() + this.storeFrameWidth(), height: Math.max(shown, this.margin() + this.height() + this.gridSize() + this.storeViewHeight()) };
    }
    return {
      width: (store ? this.margin() : 2 * this.margin()) + this.width() + this.gutter() + (store ? this.storeFrameWidth() + this.frameExtra() : 0),
      height: 2 * this.margin() + Math.max(this.height(), this.storeViewHeight()),
    };
  });

  /** how wide the store frame is on the page: below the picture it is as wide as the room (and scrolls sideways when the pieces need more), beside it as wide as the pieces need */
  readonly storeFrameWidth = computed(() => {
    const store = this.store();
    const room = this.room();
    if (!store) return 0;
    if (!room) return store.width + STORE_SCROLLBAR_PX;
    // below the picture the frame is as wide as the room; beside it, it goes on to the right edge of the area (the room that is left of the picture, minus the padding)
    if (this.stacked()) return Math.max(STORE_MIN_HEIGHT_PX, Math.floor(room.width / this.scale() - 2 * this.margin()));
    // beside the picture: a few pieces wide, the scroll bar included (what the picture does not take is the picture's: the scale is fitted to it)
    return Math.floor(STORE_MAX_PIECES_ACROSS * this.gridSize()) + STORE_SCROLLBAR_PX; // no least width: with small pieces a least width would be more pieces across
  });
  /** beside the picture: how far the narrow store frame is moved to the right, to the right edge of the board (when the picture is limited by its height there is room left over); 0 elsewhere */
  protected readonly frameExtra = computed(() => {
    const room = this.room();
    if (!room || !this.store() || this.stacked()) return 0;
    return Math.max(0, Math.floor(room.width / this.scale() - this.margin() - this.width() - this.gutter() - this.storeFrameWidth()));
  });
  /**
   * The free space beside the picture, as a place for pieces. With the store below the picture, the picture is often drawn smaller than the width of the screen (its height decides how
   * big it is), and the room beside it is empty: pieces can be put there too, and never outside it. It stands for the model's free space under the picture (stored places with a centre
   * further down than `base`, which are not in the store) so nothing new is stored: `left` is where it starts, across from the picture, `width` and `height` its size, all in stored pixels
   * (`frameLeft` and `frameTop` are where it begins on the area, with the padding; it has no frame or colour of its own, and the store has none either: the pieces lie on the board). Nothing when the store is beside the picture, or the room is too narrow for it.
   */
  readonly zone = computed(() => {
    const store = this.store();
    const stacked = this.stacked();
    // beside the picture the free space is the gap that opens when the store frame is moved to the right edge of a short, wide window (`frameExtra`): there is none when the frame lies next to the picture
    if (!store || (!stacked && this.frameExtra() <= 0)) return null;
    const grid = Math.max(this.gridSize(), 10);
    const half = this.gridSize() / 2; // a piece is as big as a grid step: its middle is half a step from its edge
    const left = this.width(); // where the picture area ends: the free space is next to it, with no gap and no padding between: a piece with its middle further across is in the free space
    const origin = left - half; // the free space begins half a piece before that, so a piece whose middle is at `left` is at the left edge of what a piece can be (nothing jumps there)
    // all the room beside the picture, however wide, to the right edge of the working area: below the picture the free space, beside it the gap, the gutter and the store frame (a piece that is not wholly in the store frame lies in this
    // free space, over the frame too: it is a free piece)
    const room = (stacked ? this.storeFrameWidth() : this.width() + this.gutter() + this.frameExtra() + this.storeFrameWidth()) - origin;
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
    const height = JigsawSettings.freeSpaceColumnHeight(this.height(), this.gridSize());
    return {
      left, origin, width, columns, column, stride, height, base: JigsawSettings.freeSpaceTop(this.height(), this.gridSize()),
      // how much of a column is on the screen: all of it below the picture; beside it the room the board has (a column is a little higher than the picture, and the board is not)
      shown: stacked ? height : Math.min(height, Math.max(1, this.overlay().height - 2 * this.margin())),
      frameLeft: this.margin() + origin, frameTop: this.margin(),
    };
  });

  /** the picture stays where it is and the store frame has the rest of the area: the area does not scroll (only when the store is below and the area fills the screen) */
  readonly fixed = computed(() => this.stacked() && !!this.areaHeight());
  /** below the picture: how far the strip of the store is moved down, to the bottom edge of the working area, which fills the screen down to the footer (what is between the picture and the strip is free space); 0 elsewhere */
  protected readonly stripExtra = computed(() => {
    if (!this.store() || !this.stacked() || !this.areaHeight()) return 0;
    return Math.max(0, Math.floor(this.overlay().height - (this.margin() + this.height() + this.gridSize() + this.storeViewHeight())));
  });
  /** how far the store frame is scrolled sideways, in pixels (below the picture it scrolls only sideways) */
  readonly storeScrollX = signal(0);
  /** below the picture the store is cut into bands as high as the strip (the store seen through the frame), laid side by side: how high a band is, in stored pixels */
  private readonly bandHeight = computed(() => Math.max(1, this.storeViewHeight() - STORE_SCROLLBAR_PX)); // the scroll bar under the strip takes the last of its height
  /** how many bands the store has below the picture */
  private readonly bandCount = computed(() => Math.max(1, Math.ceil((this.store()?.height ?? 0) / this.bandHeight())));
  /**
   * Beside the picture the frame scrolls up and down only: when the store is wider than the frame shows, it is cut into slices as wide as the frame, one under
   * the other (the way it is cut into bands below the picture), so the pieces are arranged inside the view. How wide a slice is, in stored pixels:
   */
  private readonly sliceWidth = computed(() => Math.max(1, this.storeFrameWidth() - STORE_SCROLLBAR_PX));
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
  /** the store has been collected: from then on the scroller is as long as the pieces in it need (`storeUsed`), not as long as the store was cut */
  private readonly storeFitted = signal(false);
  /**
   * How far the pieces in the store reach, in the pixels of the scroller (across below the picture, down beside it, one piece of room after the last), once the store has been collected;
   * null before. It is worked out from the places of the pieces, as `place` maps them, so it is never out of date after a resize, and nothing of it is saved.
   */
  private readonly storeUsed = computed(() => {
    const store = this.store();
    if (!this.storeFitted() || !store) return null;
    const size = this.gridSize();
    let reach = 0;
    for (const item of this.puzzle().items) {
      if (!item.data.piece || item.centerX < store.left) continue;
      const own = item.object.width;
      if (this.stacked()) reach = Math.max(reach, item.left - store.left + this.bandOf(item.centerY) * this.bandStride() + own);
      else reach = Math.max(reach, item.top + this.sliceOfAcross(item.left + own / 2 - store.left) * this.sliceStride() + own);
    }
    return reach + size;
  });
  /** the slice of the scroller a place this far across the store (where the middle of a piece is) is in, beside the picture */
  private sliceOfAcross(across: number): number {
    return this.sliceCount() > 1 ? Math.min(this.sliceCount() - 1, Math.max(0, Math.floor(across / this.sliceWidth()))) : 0;
  }
  /** the size of the inside of the store frame: the store as it is, or the bands side by side (below the picture), or the slices one under the other (beside it); once collected, no longer than the pieces need (and never less than the frame shows) */
  readonly storeInnerSize = computed(() => {
    const store = this.store();
    if (!store) return { width: 0, height: 0 };
    const used = this.storeUsed();
    if (this.stacked()) {
      const full = this.bandCount() * this.bandStride() + this.gridSize() / 2;
      return { width: used === null ? full : Math.min(full, Math.max(this.storeFrameWidth(), used)), height: this.bandHeight() };
    }
    const full = this.sliceCount() > 1 ? { width: this.sliceWidth(), height: (this.sliceCount() - 1) * this.sliceStride() + store.height } : { width: store.width, height: store.height };
    return used === null ? full : { width: full.width, height: Math.min(full.height, Math.max(this.storeViewHeight(), used)) };
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
  readonly canScrollRight = computed(() => this.stacked() && this.storeScrollX() + this.storeFrameWidth() < this.storeInnerSize().width - 1);

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
  place(v: { anchor?: string; p?: { id: string }; inStore: boolean; held?: boolean; left: number; top: number; object: { width: number } }): { shift: number; shiftY: number; clip: string | null; hidden: boolean } {
    // a group of pieces that stick together is one piece: it is put where the piece that stands for it is, all the pieces by the same shift, so a group is never torn when it passes the edge
    // of the picture, the free space or the store (the store cuts a piece at its edge: a piece of a group is not cut by itself)
    const anchor = v.anchor && v.p && v.anchor !== v.p.id ? this.viewById().get(v.anchor) : undefined;
    if (anchor) return { ...this.placeOwn(anchor), clip: null };
    const own = this.placeOwn(v);
    // a piece that is picked up is drawn again whole: the cut at the edge of the store frame was for a piece lying in it, and would leave the held piece cut off wherever it is taken
    return v.held ? { ...own, clip: null } : own;
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
    if (!store || !v.inStore) return { shift: -this.margin(), shiftY: -this.margin(), clip: null, hidden: false }; // not in the store: on the board, where the area's padding ends; nothing of the store frame (its margin, how far it was moved) is used for it
    const reach = Math.ceil(size * TAB_REACH);
    const scroll = this.storeScroll();
    const shown = this.storeViewHeight(); // the height of what the frame shows
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
    const shownAcross = this.storeFrameWidth() - (stacked ? 0 : STORE_SCROLLBAR_PX); // beside the picture the frame has a scroll bar at its side
    if ((scrollX > 0 || stacked) && across + size + reach <= 0) return { shift: 0, shiftY: 0, clip: null, hidden: true };
    if (across - reach >= shownAcross) return { shift: 0, shiftY: 0, clip: null, hidden: true };
    const cutLeft = scrollX > 0 || stacked ? Math.max(0, -across) : 0;
    const cutRight = Math.max(0, across + size - shownAcross);
    const sideReach = reach + size;
    const frameLeft = stacked ? this.margin() : this.margin() + this.width() + this.gutter() + this.frameExtra(); // the frame is beside the picture area, a small gap from it, or below it
    const frameTop = stacked ? this.margin() + this.height() + this.gridSize() + this.stripExtra() : this.margin();
    return {
      shift: v.left - (frameLeft + across),
      shiftY: v.top - (frameTop + top),
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
  /** the ids of what is held now: they are drawn on a layer above everything (`HELD_LAYER`) until they are let go */
  private readonly held = signal<ReadonlySet<string>>(new Set());
  /** the puzzle of the placed objects, in order (`settledPuzzle`): while a piece is held nothing in it changes, the held piece is only drawn where the pointer is (see `FreeDrag`) */
  private readonly puzzle = computed(() => this.settledPuzzle(this.placed()));

  /** These places as a puzzle that is in order: no free piece below a fixed one, and none outside the area or what is shown of it. */
  private settledPuzzle(data: PlacedObject[]): Puzzle {
    const extent = JigsawSettings.extent(this.width(), this.height(), this.gridSize(), this.storeWidth()); // the whole jigsaw pieces area
    const settled = Puzzle.from(data, extent.width, extent.height).settled(); // no free piece below a fixed one, and none outside the area
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
        confined = confined.confine({ left: 0, top, width: store.left, height: last ? extent.height - top : zone.height }, { left: 0, top: top - this.margin(), width: last ? zone.width - k * zone.stride : zone.column, height: zone.shown + 2 * this.margin() });
      }
      return confined;
    }
    // the store is below the picture and there is no room beside it (a narrow window): a free piece lies anywhere on the working area, over the strip of the store too (it is in the strip only when the whole of it is): only the edges of the area limit it
    if (this.stacked()) {
      const right = Math.min(store.left, this.overlay().width - this.margin());
      const bottom = this.overlay().height - this.margin();
      return settled.confine({ left: -this.margin(), top: this.height(), width: store.left + this.margin(), height: extent.height }, { left: -this.margin(), top: -this.margin(), width: right + this.margin(), height: bottom + this.margin() });
    }
    return settled;
  }

  /** the pieces that were held, the last first: the one that is held, or was held last, stands for its group (see `Puzzle.groupAnchors`) */
  private readonly anchorPrefs = signal<readonly string[]>([]);
  /** for every object, the one that stands for its group: pieces that stick together are one piece, so where the group is shown is decided by one of them */
  private readonly groupAnchors = computed(() => this.puzzle().groupAnchors(this.anchorPrefs()));
  /**
   * whether a piece is in the store frame (rule 3): beside the picture the whole of it is inside what the frame shows (in a later slice it is, as the slices are cut from the store); below the picture its middle is.
   * This is the rule as it is told of a stored place; `areaPoint` tells the same rule of the pointer (the half piece it keeps from the sides of the frame), because a drop has to be turned into a place
   * before there is a piece to ask. The two cannot be one function (screen pixels and a scrolled, sliced store), so `scripts/board-scroller-membership.js` drops a piece at many points and says if they differ.
   */
  private belongsToStore(item: { left: number; top: number; centerX: number; object: { width: number } }): boolean {
    const store = this.store();
    if (!store) return false;
    if (this.stacked()) return item.centerX >= store.left;
    const across = item.left - store.left;
    const slice = this.sliceWidth();
    return across >= 0 && item.top >= 0 && (across >= slice || across + item.object.width <= slice);
  }

  /** the drawn pieces of the last time (by id), so a piece that has not changed is the same object again and the page does not draw it again (see `view`) */
  private drawn = new Map<string, { item: unknown; anchor: string; hidden: boolean; inStore: boolean; held: boolean; single: boolean; entry: BoardView }>();
  /** the placed objects as they are drawn, with their box at their centre. A piece that was not moved keeps its entry from the last time: while a piece is held only it changes. */
  readonly view = computed<BoardView[]>(() => {
    const anchors = this.groupAnchors();
    const hidden = this.hiddenIds();
    const store = this.store();
    const held = this.held();
    const next = new Map<string, { item: unknown; anchor: string; hidden: boolean; inStore: boolean; held: boolean; single: boolean; entry: BoardView }>();
    const members = new Map<string, number>(); // how many pieces each group has, by the one that stands for it
    for (const anchor of anchors.values()) members.set(anchor, (members.get(anchor) ?? 0) + 1);
    const entries = this.puzzle().items.map((item) => {
      const anchor = anchors.get(item.id) ?? item.id;
      const isHidden = hidden.has(item.id);
      // a piece belongs to the store only when the whole of it is inside the frame (beside the picture: not left of it, not above it, and in the first slice not over its right end); partly outside, it is a free piece lying on the board, over the frame too.
      // Below the picture the strip is cut in bands, and the middle decides
      const inStore = !!store && this.belongsToStore(item);
      const isHeld = held.has(item.id);
      const single = (members.get(anchor) ?? 1) === 1;
      const before = this.drawn.get(item.id);
      if (before && before.item === item && before.anchor === anchor && before.hidden === isHidden && before.inStore === inStore && before.held === isHeld && before.single === single) {
        next.set(item.id, before);
        return before.entry;
      }
      const entry: BoardView = {
        held: isHeld,
        anchor,
        p: item.data,
        layer: isHeld ? HELD_LAYER : item.layer,
        object: item.object,
        left: item.left,
        top: item.top,
        piece: item.data.piece ?? null,
        matched: !!item.data.piece && JigsawPieces.matched({ col: item.data.piece.col, row: item.data.piece.row, size: item.object.width, centerX: item.centerX, centerY: item.centerY }),
        hidden: isHidden,
        inStore,
        single,
      };
      next.set(item.id, { item, anchor, hidden: isHidden, inStore, held: isHeld, single, entry });
      return entry;
    });
    this.drawn = next;
    return entries;
  });

  /** the drawn objects by id (a piece of a group looks up the piece that stands for the group) */
  private readonly viewById = computed(() => new Map(this.view().map((v) => [v.p.id, v] as const)));

  /**
   * where every piece is drawn, by id (see `place`): worked out again for all the pieces whenever anything `place` reads changes. It takes about half a millisecond for 800 pieces, so it is not kept piece by piece:
   * a list of what it reads, to know when a kept place is stale, was left out of date once and the pieces were drawn at old places after a resize
   */
  protected readonly placements = computed(() => new Map(this.view().map((v) => [v.p.id, this.place(v)] as const)));

  /** how many pieces the picture is cut into across and down (a piece of the jigsaw shows its own part of the picture) */
  readonly pieceGrid = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** the picture shown behind the picture area: not when the picture is cut into pieces (the pieces are the picture then; the help frame shows it) */
  readonly backdrop = computed(() => (this.placed().some((p) => p.piece) ? null : this.picture()));

  /** the placed object that is being moved: the pointer's distance from its centre (or from the end that was grabbed), and the picture area it is in */
  private moving: { id: string; ids: string[]; dx: number; dy: number; screen?: { dx: number; dy: number }; free?: FreeDrag; matchedAtStart: ReadonlySet<string>; stuckAtStart: ReadonlySet<string> } | null = null;

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
      // the room for the area changes with the window and the page around it
      // the working area fills the screen down to the footer, so it is measured again whenever the screen, the page or the footer changes size, not only when the window says it was resized (a device mode, a rotation, the on-screen keyboard)
      const watch = new ResizeObserver(() => this.measureArea());
      watch.observe(this.root().nativeElement);
      watch.observe(document.documentElement);
      const viewport = window.visualViewport;
      const remeasure = () => this.measureArea();
      viewport?.addEventListener('resize', remeasure);
      window.addEventListener('orientationchange', remeasure);
      this.destroyRef.onDestroy(() => {
        watch.disconnect();
        viewport?.removeEventListener('resize', remeasure);
        window.removeEventListener('orientationchange', remeasure);
      });
    });
    // beside the picture the frame can be wider than the store the pieces were spread over (a wide screen): the store is made as wide as the frame, so a piece can go all the way across it (the page keeps it)
    effect(() => {
      const store = this.store();
      if (!store || !this.room() || this.stacked() || this.viewOnly()) return; // before the room is known the frame is the store and the bar (`storeFrameWidth`): growing the store to that would never end
      const wanted = Math.min(JIGSAW_MAX_SIDE - store.left, this.storeFrameWidth()); // all the way to the right edge of the working area (the scroll bar lies over the end of it): only the edges of that area limit where a piece can be
      if (wanted > store.width) untracked(() => this.storeWidthChange.emit(wanted));
    });
    // Edges is switched on or off: the scroller is worked out again, the pieces of the store that are shown are put together from its start (the others are hidden, or are shown again), so it has no empty room where
    // hidden pieces lay and no piece lies over another; not when the round is opened (what the switch was is only read then)
    let edgesSeen: boolean | undefined;
    effect(() => {
      const now = this.edgesOnly();
      const before = edgesSeen;
      edgesSeen = now;
      if (before === undefined || before === now) return;
      untracked(() => {
        if (this.room() && this.hasPieces()) this.collect(true);
      });
    });
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
    // down to the footer, never below it (rule 6)
    this.areaHeight.set(this.fillScreen() ? Math.max(200, Math.floor(footerTop() - root.getBoundingClientRect().top - SCREEN_MARGIN_PX)) : null);
    const width = root.clientWidth - 2 * ROOT_PADDING_PX; // the room is what the page gives the area, less its margin: it does not grow with its content
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
    this.held.set(new Set(ids));
    const freeDrag = screen ? this.freeDragOf(ids, event, box) : undefined;
    this.moving = { id: item.id, ids, dx: x - grabbed.x, dy: y - grabbed.y, screen, free: freeDrag, matchedAtStart: this.matchedAmong(this.puzzle(), ids), stuckAtStart: new Set(this.puzzle().stuckGroup(ids)) };
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
      // (rule 3 for the pointer, the same as `belongsToStore` for a place: keep the two alike, `scripts/board-scroller-membership.js` checks them)
      // a piece (its middle) is in the store below the top edge of the frame by half a piece: a piece in the store is whole inside it, so higher up it is a free piece, and it follows the pointer all the way
      // (beside the picture only while the store is not scrolled: scrolled, a piece can lie partly over the top edge of what the frame shows)
      const top = frame.top + (piece && (this.stacked() || this.storeScroll() === 0) ? (this.gridSize() / 2) * this.scale() : 0);
      // beside the picture the same at the left edge: the middle of a piece is in the store half a piece in from the frame's left edge, nearer it the piece is a free one
      // (below the picture: the same at both ends of the strip, as far as it is shown)
      const halfShown = (this.gridSize() / 2) * this.scale();
      const left = frame.left + (piece ? halfShown : 0);
      // beside the picture the frame has a scroll bar and a border at its right edge, and the board a little more: a pointer there is still at the right end of the store, not back at the picture
      // (a piece: not nearer than half a piece to the right end of what the frame shows, the scroll bar not counted: there it is a free piece lying over the bar)
      const clientX = !piece && !this.stacked() && event.clientX > frame.right ? frame.right : event.clientX;
      const right = piece && !this.stacked() ? frame.left + (this.sliceWidth() - this.gridSize() / 2) * this.scale() : frame.right - (piece ? halfShown : 0);
      // below the picture the scroll bar is under the strip: a piece is in the strip only when the whole of it is above the bar
      const bottom = frame.bottom - (piece && this.stacked() ? STORE_SCROLLBAR_PX * this.scale() + halfShown : 0);
      if (clientX >= left && clientX <= right && event.clientY >= top && event.clientY <= bottom) {
        const rect = inner.getBoundingClientRect(); // moves with the scrolling of the frame
        const across = (clientX - rect.left) / this.scale();
        const down = (event.clientY - rect.top) / this.scale();
        if (!this.stacked()) {
          const slices = this.sliceCount();
          // a piece is in the store only when the whole of it is inside what the frame shows (its width without the scroll bar): its middle is at least half a piece from each side of it
          const half = piece ? this.gridSize() / 2 : 0;
          if (slices === 1) return { x: store.left + Math.min(across, Math.max(half, this.sliceWidth() - half)), y: down };
          const slice = this.sliceOfDown(down); // beside the picture: the slice the pointer is over
          // across stays inside the slice: the frame is a little wider than a slice (border, scroll bar), and further across a piece would be in the next slice, which is under this one
          const inSlice = Math.min(Math.max(across, half), Math.max(half, this.sliceWidth() - Math.max(half, 1)));
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
      const v = Math.min(Math.max((event.clientY - rect.top) / this.scale(), half - this.margin()), zone.shown + this.margin() - half); // from the top edge of the working area (the padding above the picture) to its bottom edge
      const k = Math.min(zone.columns - 1, Math.max(0, Math.floor((u - half) / zone.stride))); // the column the pointer is over
      return { x: u - k * zone.stride, y: zone.base + k * zone.height + v };
    }
    const area = this.root().nativeElement.getBoundingClientRect();
    // below the picture the store strip is not beside it: the area is as wide as the picture, and with the free space beside it as wide as to where that begins (so a piece goes on without a jump from the one to the other)
    const reach = store && !this.stacked() ? (piece ? this.overlay().width - this.margin() - this.gridSize() / 2 : store.left) : zone ? zone.left : piece && store ? Math.min(store.left, this.overlay().width - this.margin()) - this.gridSize() / 2 : this.width(); // beside the picture a free piece goes anywhere on the board, over the store frame too (it belongs to the frame only when it is whole inside)
    // a piece goes anywhere on the area, down to the bottom of the screen; with the free space beside the picture, the places under the picture are that space (below), so the picture area ends at the picture
    const lowest = zone ? zone.base - 1 : Math.max(this.height(), (area.bottom - ROOT_PADDING_PX - rect.top) / this.scale() - this.margin());
    return { x: Math.min(Math.max((event.clientX - rect.left) / this.scale(), -this.margin()), reach), y: Math.min(Math.max((event.clientY - rect.top) / this.scale(), -this.margin()), lowest) };
  }

  /** What is held: its drawn elements, and where it is on the screen now. */
  private freeDragOf(ids: readonly string[], event: PointerEvent, box: DOMRect): FreeDrag {
    const wanted = new Set(ids);
    const elements = [...this.root().nativeElement.querySelectorAll<HTMLElement>('.placed-object[data-id]')].filter((e) => wanted.has(e.dataset['id'] ?? ''));
    const boxes = (elements.length ? elements : [event.currentTarget as HTMLElement]).map((e) => e.getBoundingClientRect());
    return {
      elements,
      start: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      box: { left: Math.min(...boxes.map((b) => b.left)), top: Math.min(...boxes.map((b) => b.top)), right: Math.max(...boxes.map((b) => b.right)), bottom: Math.max(...boxes.map((b) => b.bottom)) },
      delta: { x: 0, y: 0 },
    };
  }

  /** the part of the screen a held piece can be drawn over: the pieces area, and with the store below the picture not below the store */
  private boardBounds(): { left: number; top: number; right: number; bottom: number } {
    const area = this.root().nativeElement.getBoundingClientRect();
    const frame = this.storeInner()?.nativeElement.parentElement?.getBoundingClientRect();
    // the working area (the layer the pieces are drawn in) as far as the board shows it: only its edges limit where a held piece can go
    const layer = this.root().nativeElement.querySelector('.pieces-layer')?.getBoundingClientRect();
    const inner = {
      left: Math.max(area.left + ROOT_PADDING_PX, layer?.left ?? -Infinity),
      top: Math.max(area.top + ROOT_PADDING_PX, layer?.top ?? -Infinity),
      right: Math.min(area.right - ROOT_PADDING_PX, layer?.right ?? Infinity),
      bottom: Math.min(area.bottom - ROOT_PADDING_PX, layer?.bottom ?? Infinity),
    };
    return { ...inner, bottom: frame && this.stacked() ? Math.min(inner.bottom, frame.bottom - 1) : inner.bottom };
  }

  /** What is grabbed follows the pointer: a piece is drawn where the pointer is (nothing else is touched), any other object is moved by the puzzle (see `Puzzle`). */
  moveMove(event: PointerEvent): void {
    const moving = this.moving;
    if (!moving) return;
    const free = moving.free;
    const screen = moving.screen;
    if (free && screen) {
      // the middle of the held piece is where the pointer is, less the distance it was grabbed at; the whole of what is held is kept on the board
      const bounds = this.boardBounds();
      const wantedX = event.clientX - screen.dx - free.start.x;
      const wantedY = event.clientY - screen.dy - free.start.y;
      const lowX = bounds.left - free.box.left;
      const lowY = bounds.top - free.box.top;
      const dx = Math.min(Math.max(wantedX, lowX), Math.max(lowX, bounds.right - free.box.right));
      const dy = Math.min(Math.max(wantedY, lowY), Math.max(lowY, bounds.bottom - free.box.bottom));
      free.delta = { x: dx, y: dy };
      const move = `translate(${dx / this.scale()}px, ${dy / this.scale()}px)`; // the area is drawn at a scale: the distance is in its pixels
      for (const element of free.elements) element.style.transform = move;
      return;
    }
    const puzzle = this.puzzle();
    const placed = puzzle.get(moving.id);
    if (!placed) return;
    const point = this.areaPoint(event);
    const x = point.x - moving.dx;
    const y = point.y - moving.dy;
    if (moving.ids.length > 1) {
      this.apply(puzzle.moveGroup(moving.ids, x - placed.centerX, y - placed.centerY));
      return;
    }
    this.apply(puzzle.moveFigure(moving.id, x, y, this.step, this.origin));
  }

  /** Where a held piece is let go: the place on the board that its middle, on the screen, is over (the one time the areas are used), and all that is held moved there. */
  private movedTo(puzzle: Puzzle, moving: NonNullable<JigsawBoard['moving']>): Puzzle {
    const free = moving.free;
    const placed = puzzle.get(moving.id);
    if (!free || !moving.screen || !placed || (!free.delta.x && !free.delta.y)) return puzzle;
    const point = this.areaPoint({ clientX: free.start.x + free.delta.x, clientY: free.start.y + free.delta.y }, true);
    if (moving.ids.length > 1) return puzzle.moveGroup(moving.ids, point.x - placed.centerX, point.y - placed.centerY);
    return puzzle.moveFigure(moving.id, point.x, point.y, this.step, this.origin);
  }

  /**
   * What is moved is let go. A piece (or the group of pieces that stick together) that is dropped within the range of its own grid point, or of a place
   * where it fits a neighbour, clicks into place (see `Puzzle.dropPieces` and `snapRange`): it goes exactly there, the piece that was dropped
   * blinks (only that one, not the group it joined), and the device vibrates. A piece does not click while it is moved, only when it is dropped.
   */
  endMove(): void {
    const moving = this.moving;
    this.moving = null;
    this.held.set(new Set()); // let go: back on its own layer
    if (!moving) return;
    if (!this.hasMoved() && !this.viewOnly()) {
      this.hasMoved.set(true);
      writePreference(HAS_MOVED_KEY, true);
    }
    const ids = moving.ids;
    const before = this.puzzle();
    const dropped = this.movedTo(before, moving).dropPieces(ids, this.snapRange(), { left: 0, top: 0, width: this.width(), height: this.height() }); // it clicks only on the picture area (the blue one)
    this.commitFree(moving, dropped !== before ? dropped : null);
    const fresh = [...this.matchedAmong(dropped, ids)].filter((id) => !moving.matchedAtStart.has(id)); // in place now, and was not when it was picked up
    const joined = dropped.stuckGroup(ids).filter((id) => !moving.stuckAtStart.has(id)); // pieces that stick to what was moved now, and did not when it was picked up
    // only the piece that was dropped blinks (not the whole group it clicked into): the person sees which piece clicked
    if (!fresh.length && !joined.length) return;
    this.blink([moving.id]);
    if (this.look().sound && !this.viewOnly()) playSnap(dropped.stuckGroup([moving.id]).length);
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

  /**
   * The held piece is let go: the places are checked once, over all the pieces (in order: none below a fixed piece or outside what is shown), and kept (`next`: null when nothing changed). The
   * piece stays where the pointer left it until the page has drawn it at its place, so it does not flash back to where it was picked up.
   */
  private commitFree(moving: NonNullable<JigsawBoard['moving']>, next: Puzzle | null): void {
    const elements = moving.free?.elements ?? [];
    const clear = () => elements.forEach((e) => (e.style.transform = ''));
    if (this.viewOnly() || !next) return clear();
    const now = this.placed();
    const data = next.toData();
    if (data.length !== now.length || data.some((p, i) => p.id !== now[i].id)) return clear();
    this.placed.set(this.settledPuzzle(data).toData());
    afterNextRender(clear, { injector: this.injector });
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
