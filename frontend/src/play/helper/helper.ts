import { Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, WritableSignal, afterRenderEffect, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isBoolean, readPreference, writePreference } from '../../app/core/preferences';
import { MenuSpot, Spot } from './menu-spot';
import { FavoritesService } from '../../app/jigsaw/favorites.service';
import { FullScreen } from '../full-screen';
import { LanguageSelect } from '../../app/jigsaw/language-select/language-select';
import { ListView } from '../list-view';
import { PhotoShot } from '../photo-shot';
import { JigsawFilters } from '../../app/models/shared/jigsaw-filter';
import { PlayListFilter } from '../play-list-filter';
import { PuzzelToggle, PuzzelView } from '../puzzel-view';
import { Drop, MenuDrag, SIDES, Side, insideWindow } from './menu-drag';
import { PlayMenuItem } from './menus';
import { Home } from '../../app/home/home';

/** the person has moved the menu at least once: its grip does not call for attention any more */
const MOVED_KEY = 'play.helperMoved';

/**
 * **The helper: it lives always on the main level (in the frame of `PlayMain`), one of it, and what it shows is a menu.** Main gives it the proper menu (`menus.ts`: a list of entries, each an icon, the words and the page a press goes to),
 * different for nobody and for a user, and the helper shows it; a press is plain routing (`routerLink`; an entry can also be a switch of the page, or Take a photo, which opens the camera): there are no helper views and no subclasses. **The helper can be moved**: it is dragged to where the person wants it (by pressing
 * anywhere on it, on an entry too, and going a few pixels; a press that ends a drag is not a click; how a drag is followed is in `menu-drag.ts`), it can never be dragged, or left by a smaller window or by a change of its own size, outside the window,
 * and where it was put is kept on the device (rule 12 of `CLAUDE.md`). **Dragged to an edge of the window (top, bottom, left or right) and let go it sticks there as a bar** along that edge, and the page makes room for it (`--app-play-bar-top` and the others), until it is dragged away again. **Until it is moved it is a bar stuck to the left side**; where it is, is `MenuSpot`'s (the preferences can choose it too). **That it can be moved is shown without words**: it has a grip (on the top of the floating menu, on the edge of a bar that faces the page), the grip grows and takes colour a few times until the person has moved it once, and while it is carried the edges of the window light up where it can be fastened, and the one it will stick to is filled. It always shows all of its entries (there is no folding), and is not shown while it has no menu.
 */
@Component({
  selector: 'play-helper',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective, LanguageSelect, Home],
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
    '[style.left.px]': 'docked() ? null : spot().x',
    '[style.top.px]': 'docked() ? null : spot().y',
    '[style.right]': 'docked() ? null : "auto"',
    '[style.bottom]': 'docked() ? null : "auto"',
  },
  templateUrl: './helper.html',
})
export class Helper implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** the switches of the puzzle page: an entry of the menu can be one of them */
  protected readonly view = inject(PuzzelView);
  private readonly listView = inject(ListView);
  private readonly screen = inject(FullScreen);
  private readonly favorites = inject(FavoritesService);
  private readonly listFilter = inject(PlayListFilter);
  /** the filter of the list has some choice set: its entry has a dot, so a list that is short for that reason is not a riddle */
  protected readonly filterOn = computed(() => JigsawFilters.isOn(this.listFilter.filter()));

  /** a switch that is not offered now: Full screen where the browser cannot, the help picture and the border pieces of a puzzle that is finished, and My favorites when the user has no favorites (while the list is only the favorites the switch stays, or there would be no way back) */
  protected hidden(toggle: NonNullable<PlayMenuItem['toggle']>): boolean {
    if (toggle === 'fullscreen') return !this.screen.available;
    if (toggle === 'favorites') return this.favorites.ids().size === 0 && !this.listView.favorites();
    return (toggle === 'help' || toggle === 'edges') && this.view.solved();
  }

  /** whether a switch is on */
  protected isOn(toggle: NonNullable<PlayMenuItem['toggle']>): boolean {
    return toggle === 'fullscreen' ? this.screen.on() : this.stateOf(toggle)();
  }

  /** A switch was pressed. */
  protected flip(toggle: NonNullable<PlayMenuItem['toggle']>): void {
    if (toggle === 'fullscreen') return this.screen.flip(); // (on this press: a browser fills the screen only then)
    const state = this.stateOf(toggle);
    state.set(!state());
  }

  /** the switch, as a signal: the entry says which page it is a switch of (the puzzle, or the home page) */
  private stateOf(toggle: Exclude<NonNullable<PlayMenuItem['toggle']>, 'fullscreen'>): WritableSignal<boolean> {
    return toggle === 'favorites' ? this.listView.favorites : this.view.state(toggle as PuzzelToggle);
  }

  private readonly photo = inject(PhotoShot);
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');

  /** Take a photo: the camera is opened at once. */
  protected takePhoto(): void {
    if (this.photo.way === 'live') this.photo.filming.set(true);
    else this.photoInput()?.nativeElement.click();
  }

  /** the camera of a phone or tablet gave its photo */
  protected photoChosen(event: Event): void {
    const field = event.target as HTMLInputElement;
    const file = field.files?.[0];
    field.value = '';
    if (file) this.photo.receive(file);
  }

  /** the menu that main gives it (nothing: the helper is not shown) */
  readonly menu = input<readonly PlayMenuItem[] | null>(null);

  private readonly place = inject(MenuSpot);
  /** where it was put (the left side until it has been moved or chosen) */
  protected readonly spot = this.place.spot.asReadonly();
  /** the edge of the window it is stuck to, drawn as a bar along it (null: it floats) */
  protected readonly docked = computed(() => this.spot().side ?? null);
  /** the person has moved it before: until then its grip calls for attention */
  protected readonly hasMoved = signal(readPreference(MOVED_KEY, false, isBoolean));
  /** it is a bar down a side: the entries one under the other */
  protected readonly upright = computed(() => this.docked() === 'left' || this.docked() === 'right');
  /** which edge the room is kept at now, and how much (pixels): so the window is told only of a change */
  private reserved = '';
  /** it is being dragged */
  protected readonly dragging = signal(false);

  /** the edge it will stick to if it is let go now, while it is carried */
  protected readonly aim = signal<Side | null>(null);

  private readonly drag = new MenuDrag(this.host.nativeElement, inject(NgZone), {
    docked: () => this.docked(),
    started: () => this.dragging.set(true),
    aim: (side) => this.aim.set(side),
    lift: (corner) => this.place.spot.set(corner),
    drop: (place) => this.drop(place),
  });

  /** the helper changes size when what is in it changes (another text, another language): where it was put is checked again, so it never goes over the edge */
  private readonly sizeWatch = new ResizeObserver(() => this.resized());
  /** how big it was the last time it was looked at, so a change of size keeps the side it is nearest to where it is */
  private lastSize: { width: number; height: number } | null = null;

  /**
   * The helper became wider or higher (another menu, or its words changed): it grows from the side that is nearest to the edge of the window, so a menu in the right corner opens to the left and one in the
   * lower corner opens upwards, and keeps the same room to that edge. It is then kept inside the window. Where it is now is kept, as if it had been dragged there.
   */
  private resized(): void {
    if (this.dragging()) return; // the drag has it: the page and its place are seen to when it is let go
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    this.reserve();
    if (this.docked()) {
      this.lastSize = null; // the size of the bar says nothing about the box it becomes again
      return;
    }
    const before = this.lastSize;
    this.lastSize = { width, height };
    const spot = this.spot();
    if (!before || (before.width === width && before.height === height)) return this.keepInside();
    const rightGap = window.innerWidth - (spot.x + before.width);
    const bottomGap = window.innerHeight - (spot.y + before.height);
    const next = this.inside({ x: rightGap < spot.x ? window.innerWidth - width - rightGap : spot.x, y: bottomGap < spot.y ? window.innerHeight - height - bottomGap : spot.y });
    this.place.keep(next);
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
    // (not while it is carried: the page makes room when it is let go)
    afterRenderEffect(() => {
      this.docked();
      if (!this.dragging()) this.reserve();
    });
  }

  ngOnInit(): void {
    this.sizeWatch.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.drag.dispose(); // no listener is left on the document
    this.sizeWatch.disconnect();
    this.reserve(null);
  }

  @HostListener('pointerdown', ['$event'])
  protected down(event: PointerEvent): void {
    this.drag.down(event);
  }

  /** It was let go: where it is now is kept. */
  private drop(place: Drop): void {
    const next: Spot = 'side' in place ? { x: 0, y: 0, side: place.side } : place.corner;
    this.lastSize = 'side' in place ? null : place.size;
    this.place.put(next);
    this.aim.set(null);
    this.dragging.set(false);
    this.hasMoved.set(true);
    writePreference(MOVED_KEY, true);
  }

  /** A smaller window, or a change of the helper's own size, takes a helper that was put near the old edge back inside. */
  @HostListener('window:resize')
  protected keepInside(): void {
    const spot = this.spot();
    if (!spot.side && !this.dragging()) this.place.spot.set(this.inside(spot));
  }

  /** The corner moved to the nearest place where the whole helper is in the window. */
  private inside(spot: Spot): Spot {
    return insideWindow(spot, this.host.nativeElement.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
  }
}
