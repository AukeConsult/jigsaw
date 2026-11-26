import { NgZone } from '@angular/core';

/** The edges of the window the menu can stick to. */
export const SIDES = ['top', 'bottom', 'left', 'right'] as const;
export type Side = (typeof SIDES)[number];

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Where the menu was let go: stuck to an edge, or floating with its top left corner here (its size, when it is known). */
export type Drop = { side: Side } | { corner: Point; size: Size | null };

/** What a drag tells the menu it moves. All of them are called inside Angular, and only when something changes: never for each move of the pointer. */
export interface Dragged {
  /** the edge it is a bar at now (null: it floats) */
  docked(): Side | null;
  /** the press became a drag */
  started(): void;
  /** the edge it will stick to if it is let go now (null: none) */
  aim(side: Side | null): void;
  /** a bar was pulled off its edge: it is the floating menu now, with its corner here */
  lift(corner: Point): void;
  /** it was let go */
  drop(place: Drop): void;
}

/** how far (pixels) a press must go to be a drag and not a click: a finger is never quite still */
const DRAG_FROM = { mouse: 4, finger: 10 };
/** how near an edge (rem) the pointer must be for the menu to stick there: more for a finger, which cannot easily reach the very edge */
const NEAR_REM = { mouse: 2.5, finger: 5 };
/** or how far (rem) the menu itself is pushed past the edge */
const PUSH_REM = 2;
/** how far (rem) past its own thickness the pointer must be from the edge to pull a bar off it */
const HOLD_REM = 2;
/** how long (ms) after a drag a click is not heard */
const CLICK_AFTER_MS = 350;

/** The corner moved to the nearest place where the whole box is in the window. */
export function insideWindow(corner: Point, size: Size, view: Size): Point {
  return { x: Math.min(Math.max(0, corner.x), Math.max(0, view.width - size.width)), y: Math.min(Math.max(0, corner.y), Math.max(0, view.height - size.height)) };
}

/** how far a point is from each edge of the window */
function distances(at: Point, view: Size): Record<Side, number> {
  return { top: at.y, bottom: view.height - at.y, left: at.x, right: view.width - at.x };
}

/** one press on the menu, from down to up */
interface Press {
  pointer: number;
  mouse: boolean;
  rem: number;
  from: Point;
  at: Point;
  /** where on the menu the pointer took hold of it */
  inside: Point;
  dragging: boolean;
  /** it is still a bar on its edge, this thick */
  bar: { side: Side; thickness: number } | null;
  /** where the stylesheet and the page have the menu now: it is moved from there */
  base: Point;
  /** the size of the floating menu, measured once it is drawn */
  size: Size | null;
  /** where it is drawn now */
  corner: Point;
  /** the farthest the pointer has been from each edge: an edge takes the menu only when the pointer has come back toward it, so a menu moved a little beside an edge does not stick to it */
  far: Record<Side, number>;
  aimed: Side | null;
}

/**
 * **The drag of the menu**: it follows one pointer from the press to the release. While it is carried nothing else on the page changes: the pointer is followed outside Angular (no change detection for a move), the menu is
 * moved with a transform (no layout), once for each picture of the screen, and its size is measured once. The edge it would stick to is only shown; **it sticks, and the page makes room, when it is let go**, so crossing an
 * edge back and forth costs nothing. A bar that is pulled off its edge becomes the floating menu at once, while the page keeps the room until the release.
 */
export class MenuDrag {
  private press: Press | null = null;
  private frame = 0;
  private clickTimer = 0;

  constructor(private readonly host: HTMLElement, private readonly zone: NgZone, private readonly menu: Dragged) {}

  /** A press on the menu. The listeners are on the document (a quick drag leaves the menu before its first move) and only while the press lasts. */
  down(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary) return; // one pointer moves it: a second finger or the palm of a hand must not pull it about
    this.end(); // a press whose release was never heard
    const box = this.host.getBoundingClientRect();
    const view = { width: window.innerWidth, height: window.innerHeight };
    const at = { x: event.clientX, y: event.clientY };
    const side = this.menu.docked();
    this.press = {
      pointer: event.pointerId,
      mouse: event.pointerType === 'mouse',
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      from: at,
      at,
      inside: { x: at.x - box.left, y: at.y - box.top },
      dragging: false,
      bar: side && { side, thickness: side === 'left' || side === 'right' ? box.width : box.height },
      base: { x: box.left, y: box.top },
      size: null,
      corner: { x: box.left, y: box.top },
      far: distances(at, view),
      aimed: null,
    };
    this.zone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.onMove, { passive: true });
      document.addEventListener('pointerup', this.onUp);
      document.addEventListener('pointercancel', this.onCancel);
      document.addEventListener('lostpointercapture', this.onCancel);
    });
  }

  /** The menu is going away: nothing is left behind. */
  dispose(): void {
    this.end();
    clearTimeout(this.clickTimer);
    this.host.removeEventListener('click', this.swallow, true);
  }

  private readonly onMove = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointer) return;
    press.at = { x: event.clientX, y: event.clientY };
    if (!press.dragging) {
      if (Math.hypot(press.at.x - press.from.x, press.at.y - press.from.y) < DRAG_FROM[press.mouse ? 'mouse' : 'finger']) return;
      press.dragging = true;
      try {
        this.host.setPointerCapture(press.pointer); // only now, so what is pressed in the menu stays a click
      } catch {
        /* the pointer is gone already: its release follows */
      }
      this.zone.run(() => this.menu.started());
    }
    this.frame ||= requestAnimationFrame(this.draw);
  };

  private readonly onUp = (event: PointerEvent): void => {
    const press = this.press;
    if (!press || event.pointerId !== press.pointer) return;
    if (press.dragging) {
      press.at = { x: event.clientX, y: event.clientY };
      this.draw(); // the last moves may not have been drawn
      if (!press.bar && !press.size) this.draw(); // pulled off its edge by the very last move
    }
    this.release(true);
  };

  /** The system took the pointer (a gesture of the tablet, another app): the menu stays where it is, and sticks to nothing new. The capture also moves from an entry to the menu: that is not the end. */
  private readonly onCancel = (event: PointerEvent): void => {
    if (!this.press || event.pointerId !== this.press.pointer) return;
    if (event.type === 'lostpointercapture' && event.target !== this.host) return;
    this.release(false);
  };

  private readonly draw = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const press = this.press;
    if (!press?.dragging) return;
    const view = { width: window.innerWidth, height: window.innerHeight };
    const away = distances(press.at, view);
    if (press.bar) {
      if (away[press.bar.side] <= press.bar.thickness + HOLD_REM * press.rem) return; // still on its edge
      press.bar = null;
      // the small box is held near its upper left corner, wherever the long bar was pressed
      press.inside = { x: Math.min(press.inside.x, 4 * press.rem), y: Math.min(press.inside.y, 1.5 * press.rem) };
      const corner = { x: press.at.x - press.inside.x, y: press.at.y - press.inside.y };
      press.base = press.corner = corner;
      this.zone.run(() => this.menu.lift(corner));
      this.frame = requestAnimationFrame(this.draw); // its size is known once it is drawn
      return;
    }
    const box = this.box();
    if (!box) return;
    if (!press.size) {
      const { width, height } = box.getBoundingClientRect();
      press.size = { width, height };
    }
    const wanted = { x: press.at.x - press.inside.x, y: press.at.y - press.inside.y };
    press.corner = insideWindow(wanted, press.size, view);
    box.style.transform = `translate3d(${press.corner.x - press.base.x}px, ${press.corner.y - press.base.y}px, 0)`;
    const side = this.edgeFor(press, wanted, away, view);
    if (side === press.aimed) return;
    press.aimed = side;
    this.zone.run(() => this.menu.aim(side));
  };

  /** The edge that takes the menu: the pointer is near it, or the menu is pushed past it (`wanted` is where it would be if the window did not stop it). The one that pulls most, in a corner. */
  private edgeFor(press: Press, wanted: Point, away: Record<Side, number>, view: Size): Side | null {
    const size = press.size!;
    const past: Record<Side, number> = { top: -wanted.y, bottom: wanted.y + size.height - view.height, left: -wanted.x, right: wanted.x + size.width - view.width };
    const near = NEAR_REM[press.mouse ? 'mouse' : 'finger'] * press.rem;
    let best: Side | null = null;
    let strongest = 0;
    for (const side of SIDES) {
      press.far[side] = Math.max(press.far[side], away[side]);
      const toward = press.far[side] - away[side] >= Math.min(press.rem, press.far[side] / 2);
      const pull = Math.max(toward ? near - away[side] : -1, past[side] - PUSH_REM * press.rem);
      if (pull >= strongest) {
        best = side;
        strongest = pull;
      }
    }
    return best;
  }

  private release(stick: boolean): void {
    const press = this.press;
    this.end();
    if (!press?.dragging) return;
    // a press that ends a drag is not a click (a browser may still send one to the entry it began on)
    clearTimeout(this.clickTimer);
    this.host.addEventListener('click', this.swallow, true);
    this.clickTimer = window.setTimeout(() => this.host.removeEventListener('click', this.swallow, true), CLICK_AFTER_MS);
    const box = this.box();
    if (box) box.style.transform = '';
    const side = press.bar?.side ?? (stick ? press.aimed : null);
    this.zone.run(() => this.menu.drop(side ? { side } : { corner: press.corner, size: press.size }));
  }

  /** The press is over: its listeners and the picture still to be drawn are taken away. */
  private end(): void {
    this.press = null;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onCancel);
    document.removeEventListener('lostpointercapture', this.onCancel);
  }

  private readonly swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
  };

  /** what is drawn of the menu: the floating list or the bar */
  private box(): HTMLElement | null {
    return this.host.querySelector<HTMLElement>(':scope > .list-group, :scope > .play-bar');
  }
}
