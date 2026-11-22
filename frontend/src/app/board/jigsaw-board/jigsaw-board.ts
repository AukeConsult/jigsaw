import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, HostListener, inject, computed, effect, input, model, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { switchMap } from 'rxjs';
import { tr } from '../../core/i18n';
import { PuzzlePiece } from '../../jigsaw/puzzle-piece/puzzle-piece';
import { readPreference, writePreference } from '../../core/preferences';
import { JigsawHelper } from '../../jigsaw/jigsaw-helper';
import { bottomBarHeight, cssNumber, cssVar, onAnyScroll } from '../../core/theme';
import { JIGSAW_MAX_SIDE, JIGSAW_MIN_SIDE, JigsawSettings } from '../../models/shared/jigsaw-settings';
import { COLLECT_GAP, COLLECT_MARGIN, COLLECT_SCATTER, Puzzle } from '../../models/shared/puzzle';
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
  readonly hiddenIds = computed(() => (this.edgesOnly() ? new Set(this.placed().filter((p) => p.piece && !JigsawPieces.isBorder(p.piece)).map((p) => p.id)) : new Set<string>()));
  /** the pieces that lie in the store frame and are shown (not hidden by "only corner and edge pieces"): the ones that are collected */
  readonly storePieceIds = computed(() => {
    const store = this.store();
    const hidden = this.hiddenIds();
    return store ? this.placed().filter((p) => p.piece && p.centerX >= store.left && !hidden.has(p.id)).map((p) => p.id) : [];
  });

  /**
   * Collect pieces (a click on the empty store frame): the pieces that lie in the store frame are put together at the top of it, close to each other (see
   * `Puzzle.collectPieces`), and the frame is scrolled to its top so they are seen. Saved like any move of pieces.
   */
  collectPieces(): void {
    if (this.viewOnly()) return;
    const store = this.store();
    if (!store) return;
    // beside the picture the frame can be wider than the store the pieces were spread over: the pieces are collected over all of the frame that shows (the
    // store is made that wide, and the page keeps it); below the picture the strip has the width of the store
    // (when the pieces would not all fit in the rows of that width, the store is made wider than the frame, which scrolls sideways)
    const pitch = Math.round((1 + COLLECT_GAP + COLLECT_SCATTER) * this.gridSize());
    const margin = Math.round(COLLECT_MARGIN * this.gridSize());
    const rows = Math.max(1, Math.floor((store.height - 2 * margin) / Math.max(1, pitch)));
    const needed = Math.ceil(Math.ceil((this.storePieceIds().length * 1.1) / rows) * pitch + 2 * margin); // a little to spare for groups of pieces
    const width = this.stacked() ? store.width : Math.min(JIGSAW_MAX_SIDE - store.left, Math.max(STORE_MIN_HEIGHT_PX, this.storeFrameWidth() - STORE_SCROLLBAR_PX, needed));
    const extent = JigsawSettings.extent(this.width(), this.height(), this.gridSize(), Math.max(width, store.width));
    const before = Puzzle.from(this.placed(), extent.width, extent.height);
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
  /** the size of the inside of the store frame: the store as it is, or the bands side by side (below the picture), or the slices one under the other (beside it) */
  readonly storeInnerSize = computed(() => {
    const store = this.store();
    if (!store) return { width: 0, height: 0 };
    if (this.stacked()) return { width: this.bandCount() * store.width, height: this.bandHeight() };
    return this.sliceCount() > 1 ? { width: this.sliceWidth(), height: this.sliceCount() * store.height } : { width: store.width, height: store.height };
  });
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
  place(v: { inStore: boolean; left: number; top: number; object: { width: number } }): { shift: number; shiftY: number; clip: string | null; hidden: boolean } {
    const store = this.store();
    if (!store || !v.inStore) return { shift: -AREA_PADDING_PX, shiftY: -AREA_PADDING_PX, clip: null, hidden: false }; // on the picture area: the picture area is where the area's padding ends
    const size = v.object.width;
    const reach = Math.ceil(size * TAB_REACH);
    const scroll = this.storeScroll();
    const shown = this.storeViewHeight() - 2 * FRAME_BORDER_PX; // the height of what the frame shows
    const stacked = this.stacked();
    // where the piece is in the store as the frame has it: as stored, or in its band (below the picture; a piece is shown whole, not cut by the edge of its band)
    const band = stacked ? this.bandOf(v.top + size / 2) : 0;
    const slices = this.sliceCount();
    const slice = slices > 1 ? Math.min(slices - 1, Math.max(0, Math.floor((v.left + size / 2 - store.left) / this.sliceWidth()))) : 0; // beside the picture: the slice it is in
    const inLeft = slices > 1 ? Math.min(Math.max(v.left - store.left - slice * this.sliceWidth(), 0), Math.max(0, this.sliceWidth() - size)) : v.left - store.left + band * store.width;
    const inTop = stacked ? Math.min(Math.max(v.top - band * this.bandHeight(), 0), Math.max(0, this.bandHeight() - size)) : v.top + slice * store.height;
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
    const frameLeft = stacked ? AREA_PADDING_PX : AREA_PADDING_PX + this.width() + this.gridSize(); // the frame is beside the picture area, a grid step from it, or below it
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
  /** the store frame beside the picture area, where the pieces of a jigsaw wait (null: none) */
  readonly store = computed(() => JigsawSettings.storeFrame(this.width(), this.height(), this.gridSize(), this.storeWidth()));
  private readonly puzzle = computed(() => {
    const extent = JigsawSettings.extent(this.width(), this.height(), this.gridSize(), this.storeWidth()); // the whole jigsaw pieces area
    return Puzzle.from(this.placed(), extent.width, extent.height);
  });
  /** the placed objects as they are drawn, with their box at their centre */
  readonly view = computed(() =>
    this.puzzle().items.map((item) => ({
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
    // the pieces that stick together move together: a piece takes the group it is stuck to with it (Shift takes the piece alone, which pulls it loose)
    // a piece on its own place is fixed, and so is the whole group it sticks to: they are picked, but never moved (see `Puzzle.isFixed`)
    const free = item.piece ? this.puzzle().movable(inSelection ? [...picked] : [item.id]) : inSelection ? [...picked] : [item.id];
    if (!free.includes(item.id)) return;
    const wanted = free;
    const ids = item.piece && !event.shiftKey ? this.puzzle().stuckGroup(wanted) : wanted;
    if (item.piece) {
      // a piece that is picked up goes in front of the others and stays there when it is dropped (a group keeps its order)
      let puzzle = this.puzzle();
      for (const id of [...ids].sort((a, b) => (puzzle.get(a)?.layer ?? 0) - (puzzle.get(b)?.layer ?? 0))) puzzle = puzzle.bringToFront(id);
      this.apply(puzzle);
    }
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
  private areaPoint(event: { clientX: number; clientY: number }): Point {
    const store = this.store();
    const inner = this.storeInner()?.nativeElement;
    if (store && inner) {
      const frame = (inner.parentElement as HTMLElement).getBoundingClientRect();
      if (event.clientX >= frame.left && event.clientX <= frame.right && event.clientY >= frame.top && event.clientY <= frame.bottom) {
        const rect = inner.getBoundingClientRect(); // moves with the scrolling of the frame
        const across = (event.clientX - rect.left) / this.scale();
        const down = (event.clientY - rect.top) / this.scale();
        if (!this.stacked()) {
          const slices = this.sliceCount();
          if (slices === 1) return { x: store.left + across, y: down };
          const slice = Math.min(slices - 1, Math.max(0, Math.floor(down / store.height))); // beside the picture: the slice the pointer is over
          return { x: store.left + Math.min(across + slice * this.sliceWidth(), store.width), y: Math.min(down - slice * store.height, store.height) };
        }
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

  /** What is grabbed follows the pointer: the puzzle moves the piece, or the group of pieces (see `Puzzle`). */
  moveMove(event: PointerEvent): void {
    const moving = this.moving;
    if (!moving) return;
    const puzzle = this.puzzle();
    const placed = puzzle.get(moving.id);
    if (!placed) return;
    const screen = moving.screen;
    const point = screen ? this.areaPoint({ clientX: event.clientX - screen.dx, clientY: event.clientY - screen.dy }) : this.areaPoint(event); // a piece: where its middle is
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
   * where it fits a neighbour, clicks into place (see `Puzzle.dropPieces` and `snapRange`): it goes exactly there, the pieces that now stick
   * together blink, and the device vibrates. A piece does not click while it is moved, only when it is dropped.
   */
  endMove(): void {
    const moving = this.moving;
    this.moving = null;
    if (!moving) return;
    const ids = moving.ids;
    const before = this.puzzle();
    const dropped = before.dropPieces(ids, this.snapRange());
    if (dropped !== before) this.apply(dropped);
    const fresh = [...this.matchedAmong(dropped, ids)].filter((id) => !moving.matchedAtStart.has(id)); // in place now, and was not when it was picked up
    const joined = dropped.stuckGroup(ids).filter((id) => !moving.stuckAtStart.has(id)); // pieces that stick to what was moved now, and did not when it was picked up
    const blinking = new Set([...fresh, ...joined, ...(joined.length ? [moving.id] : [])]);
    if (blinking.size) this.blink([...blinking]);
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
    if (next !== this.puzzle()) this.placed.set(next.toData());
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
