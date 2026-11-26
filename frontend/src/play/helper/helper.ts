import { Component, ElementRef, HostListener, OnDestroy, OnInit, WritableSignal, afterRenderEffect, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isBoolean, readPreference, writePreference } from '../../app/core/preferences';
import { FavoritesService } from '../../app/jigsaw/favorites.service';
import { LanguageSelect } from '../../app/jigsaw/language-select/language-select';
import { ListView } from '../list-view';
import { JigsawFilters } from '../../app/models/shared/jigsaw-filter';
import { PlayListFilter } from '../play-list-filter';
import { PuzzelToggle, PuzzelView } from '../puzzel-view';
import { PlayMenuItem } from './menus';

/** The edges of the window the helper can stick to. */
const SIDES = ['top', 'bottom', 'left', 'right'] as const;
type Side = (typeof SIDES)[number];

/** Where the helper was put: its top left corner, in pixels of the window, or the edge it is stuck to (the corner then says nothing). */
interface Spot {
  x: number;
  y: number;
  side?: Side;
}

const SPOT_KEY = 'play.helperSpot';
/** the person has moved the menu at least once: its grip does not call for attention any more */
const MOVED_KEY = 'play.helperMoved';
const isSpot = (value: unknown): value is Spot => !!value && typeof value === 'object' && Number.isFinite((value as Spot).x) && Number.isFinite((value as Spot).y) && ((value as Spot).side === undefined || SIDES.includes((value as Spot).side!));
/** how far the pointer must go (pixels) before a press is a drag and not a click */
const DRAG_FROM = 4;
/** a drag with the pointer this near an edge of the window (in rem, so it follows the text size) sticks the helper to it */
const STICK_REM = 2;
const rem = (): number => parseFloat(getComputedStyle(document.documentElement).fontSize);

/**
 * **The helper: it lives always on the main level (in the frame of `PlayMain`), one of it, and what it shows is a menu.** Main gives it the proper menu (`menus.ts`: a list of entries, each an icon, the words and the page a press goes to),
 * different for nobody and for a user, and the helper shows it; a press is plain routing (`routerLink`): there are no helper views and no subclasses. **The helper can be moved**: it is dragged to where the person wants it (by pressing
 * anywhere on it, on an entry too, and going a few pixels; a press that ends a drag is not a click, since the helper then holds the pointer), it can never be dragged, or left by a smaller window or by a change of its own size, outside the window,
 * and where it was put is kept on the device (rule 12 of `CLAUDE.md`). **Dragged to an edge of the window (top, bottom, left or right) it sticks there as a bar** along that edge, and the page makes room for it (`--app-play-bar-top` and the others), until it is dragged away again. Until it is moved it is in the bottom right corner (`.play-helper` in `styles.scss`). **That it can be moved is shown without words**: it has a grip (on the top of the floating menu, on the edge of a bar that faces the page), the grip grows and takes colour a few times until the person has moved it once, and while it is carried the edges of the window light up where it can be fastened. It always shows all of its entries (there is no folding), and is not shown while it has no menu.
 */
@Component({
  selector: 'play-helper',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective, LanguageSelect],
  providers: [provideTranslocoScope('play')],
  host: {
    class: 'play-helper',
    '[class.d-none]': '!menu()',
    '[class.dragging]': 'dragging()',
    '[class.has-moved]': 'hasMoved()',
    '[class.docked-top]': "docked() === 'top'",
    '[class.docked-bottom]': "docked() === 'bottom'",
    '[class.docked-left]': "docked() === 'left'",
    '[class.docked-right]': "docked() === 'right'",
    // stuck to an edge the stylesheet places it
    '[style.left.px]': 'docked() ? null : spot()?.x',
    '[style.top.px]': 'docked() ? null : spot()?.y',
    '[style.right]': '!docked() && spot() ? "auto" : null',
    '[style.bottom]': '!docked() && spot() ? "auto" : null',
  },
  templateUrl: './helper.html',
})
export class Helper implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** the page that is open is the home page (the picture list): the logo has the name of the app beside it there, and is the logo alone on every other page */
  private readonly url = toSignal(inject(Router).events.pipe(filter((event) => event instanceof NavigationEnd), map((event) => (event as NavigationEnd).urlAfterRedirects)), { initialValue: inject(Router).url });
  protected readonly atHome = computed(() => /^\/play\/list(?=[/?#]|$)/.test(this.url()));

  /** the switches of the puzzle page: an entry of the menu can be one of them */
  protected readonly view = inject(PuzzelView);
  private readonly listView = inject(ListView);
  private readonly favorites = inject(FavoritesService);
  private readonly listFilter = inject(PlayListFilter);
  /** the filter of the list has some choice set: its entry has a dot, so a list that is short for that reason is not a riddle */
  protected readonly filterOn = computed(() => JigsawFilters.isOn(this.listFilter.filter()));

  /** a switch that is not offered now: the help picture and the border pieces of a puzzle that is finished, and My favorites when the user has no favorites (while the list is only the favorites the switch stays, or there would be no way back) */
  protected hidden(toggle: NonNullable<PlayMenuItem['toggle']>): boolean {
    if (toggle === 'favorites') return this.favorites.ids().size === 0 && !this.listView.favorites();
    return (toggle === 'help' || toggle === 'edges') && this.view.solved();
  }

  /** the switch, as a signal: the entry says which page it is a switch of (the puzzle, or the home page) */
  protected stateOf(toggle: NonNullable<PlayMenuItem['toggle']>): WritableSignal<boolean> {
    return toggle === 'favorites' ? this.listView.favorites : this.view.state(toggle as PuzzelToggle);
  }

  /** the menu that main gives it (nothing: the helper is not shown) */
  readonly menu = input<readonly PlayMenuItem[] | null>(null);

  /** where it was put (nothing: it has not been moved, and the stylesheet puts it in the corner) */
  protected readonly spot = signal<Spot | null>(readPreference<Spot | null>(SPOT_KEY, null, (v): v is Spot | null => v === null || isSpot(v)));
  /** the edge of the window it is stuck to, drawn as a bar along it (null: it floats) */
  protected readonly docked = computed(() => this.spot()?.side ?? null);
  /** the person has moved it before (or it is stuck to an edge now) */
  protected readonly hasMoved = signal(readPreference(MOVED_KEY, false, isBoolean) || !!this.spot()?.side);
  /** it is a bar down a side: the entries one under the other */
  protected readonly upright = computed(() => this.docked() === 'left' || this.docked() === 'right');
  /** which edge the room is kept at now, and how much (pixels): so the window is told only of a change */
  private reserved = '';
  /** it is being dragged */
  protected readonly dragging = signal(false);

  /** where on the helper the pointer took hold of it, where it started, and what holds the pointer once the press has become a drag */
  private grab: { inside: Spot; from: Spot; pointer: number } | null = null;
  private readonly onMove = (event: PointerEvent): void => this.move(event);
  private readonly onUp = (): void => this.up();
  private moved = false;

  /** the helper changes size when what is in it changes (another text, another language): where it was put is checked again, so it never goes over the edge */
  private readonly sizeWatch = new ResizeObserver(() => this.resized());
  /** how big it was the last time it was looked at, so a change of size keeps the side it is nearest to where it is */
  private lastSize: { width: number; height: number } | null = null;

  /**
   * The helper became wider or higher (another menu, or its words changed): it grows from the side that is nearest to the edge of the window, so a menu in the right corner opens to the left and one in the
   * lower corner opens upwards, and keeps the same room to that edge. It is then kept inside the window. Where it is now is kept, as if it had been dragged there.
   */
  private resized(): void {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    this.reserve();
    if (this.docked()) {
      this.lastSize = null; // the size of the bar says nothing about the box it becomes again
      return;
    }
    const before = this.lastSize;
    this.lastSize = { width, height };
    const spot = this.spot();
    if (!spot) return;
    if (!before || (before.width === width && before.height === height)) return this.keepInside();
    const rightGap = window.innerWidth - (spot.x + before.width);
    const bottomGap = window.innerHeight - (spot.y + before.height);
    const next = this.inside({ x: rightGap < spot.x ? window.innerWidth - width - rightGap : spot.x, y: bottomGap < spot.y ? window.innerHeight - height - bottomGap : spot.y });
    this.spot.set(next);
    writePreference(SPOT_KEY, next);
  }

  /** The page makes room for a bar: its thickness is kept free at its edge, and what measures the room it has (the board of a puzzle) is told to measure again. */
  private reserve(side: Side | null = this.docked()): void {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    // (whole pixels, rounded down: the page then reaches a little under the bar, and no hairline of what is behind shows between them)
    const size = side === null ? 0 : Math.floor(side === 'left' || side === 'right' ? width : height);
    const now = side && size ? `${side} ${size}` : '';
    if (now === this.reserved) return;
    this.reserved = now;
    for (const edge of SIDES) document.documentElement.style.setProperty(`--app-play-bar-${edge}`, `${edge === side ? size : 0}px`);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  constructor() {
    // moved from one edge to another it can keep its size, which the watch of the size would not see
    afterRenderEffect(() => {
      this.docked();
      this.reserve();
    });
  }

  ngOnInit(): void {
    this.sizeWatch.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.up(); // no listener is left on the document
    this.sizeWatch.disconnect();
    this.reserve(null);
  }

  @HostListener('pointerdown', ['$event'])
  protected down(event: PointerEvent): void {
    if (event.button !== 0) return;
    const box = this.host.nativeElement.getBoundingClientRect();
    this.grab = { inside: { x: event.clientX - box.left, y: event.clientY - box.top }, from: { x: event.clientX, y: event.clientY }, pointer: event.pointerId };
    this.moved = false; // the pointer is held only when the press becomes a drag, so what is pressed in the helper stays a click
    // the press is followed on the document, not on the helper: a quick drag leaves the helper before its first move is seen there, and would never start. The listeners are there only while the press lasts.
    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp);
    document.addEventListener('pointercancel', this.onUp);
  }

  private move(event: PointerEvent): void {
    if (!this.grab) return;
    if (!this.moved && Math.hypot(event.clientX - this.grab.from.x, event.clientY - this.grab.from.y) < DRAG_FROM) return;
    if (!this.moved) {
      this.host.nativeElement.setPointerCapture(this.grab.pointer);
      this.dragging.set(true);
    }
    this.moved = true;
    const side = this.edgeAt(event);
    if (side) {
      this.spot.set({ x: 0, y: 0, side });
      return;
    }
    if (this.docked()) {
      // pulled away from the edge: the small box is held near its upper left corner, wherever the long bar was pressed (its size is the box's only once it is drawn, so it is not kept inside before the next move)
      this.grab.inside = { x: Math.min(this.grab.inside.x, 4 * rem()), y: Math.min(this.grab.inside.y, 1.5 * rem()) };
      this.spot.set({ x: event.clientX - this.grab.inside.x, y: event.clientY - this.grab.inside.y });
      return;
    }
    this.spot.set(this.inside({ x: event.clientX - this.grab.inside.x, y: event.clientY - this.grab.inside.y }));
  }

  private up(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);
    if (!this.grab) return;
    this.grab = null;
    this.dragging.set(false);
    if (this.moved) {
      writePreference(SPOT_KEY, this.spot());
      this.hasMoved.set(true);
      writePreference(MOVED_KEY, true);
    }
  }

  /** A smaller window, or a change of the helper's own size, takes a helper that was put near the old edge back inside. */
  @HostListener('window:resize')
  protected keepInside(): void {
    const spot = this.spot();
    if (spot && !spot.side) this.spot.set(this.inside(spot));
  }

  /**
   * The edge of the window the drag sticks the helper to: the one the pointer is at (the nearest, in a corner). A bar stays on its edge until the pointer has left it, so it can be taken hold of anywhere along it, also at an
   * end that is at another edge.
   */
  private edgeAt(event: PointerEvent): Side | null {
    const away: Record<Side, number> = { top: event.clientY, bottom: window.innerHeight - event.clientY, left: event.clientX, right: window.innerWidth - event.clientX };
    const near = STICK_REM * rem();
    const now = this.docked();
    if (now) {
      const { width, height } = this.host.nativeElement.getBoundingClientRect();
      if (away[now] <= (now === 'left' || now === 'right' ? width : height) + near) return now;
    }
    const closest = SIDES.reduce((best, side) => (away[side] < away[best] ? side : best));
    return away[closest] <= near ? closest : null;
  }

  /** The corner moved to the nearest place where the whole helper is in the window. */
  private inside(spot: Spot): Spot {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    return { x: Math.min(Math.max(0, spot.x), Math.max(0, window.innerWidth - width)), y: Math.min(Math.max(0, spot.y), Math.max(0, window.innerHeight - height)) };
  }
}
