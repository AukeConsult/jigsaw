import { Component, ElementRef, HostListener, OnDestroy, OnInit, WritableSignal, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isBoolean, readPreference, writePreference } from '../../app/core/preferences';
import { FavoritesService } from '../../app/jigsaw/favorites.service';
import { ListView } from '../list-view';
import { PictureView } from '../picture-view';
import { PuzzelToggle, PuzzelView } from '../puzzel-view';
import { PlayMenuItem } from './menus';

/** how many entries a menu has (none: no menu) */
const menuLength = (menu: readonly PlayMenuItem[] | null): number => menu?.length ?? 0;

/** Where the helper was put: its top left corner, in pixels of the window. */
interface Spot {
  x: number;
  y: number;
}

const SPOT_KEY = 'play.helperSpot';
const isSpot = (value: unknown): value is Spot => !!value && typeof value === 'object' && Number.isFinite((value as Spot).x) && Number.isFinite((value as Spot).y);
/** how far the pointer must go (pixels) before a press is a drag and not a click */
const DRAG_FROM = 4;

/**
 * **The helper: it lives always on the main level (in the frame of `PlayMain`), one of it, and what it shows is a menu.** Main gives it the proper menu (`menus.ts`: a list of entries, each an icon, the words and the page a press goes to),
 * different for nobody and for a user, and the helper shows it; a press is plain routing (`routerLink`): there are no helper views and no subclasses. **The helper can be moved**: it is dragged to where the person wants it (by pressing
 * anywhere on it, on an entry too, and going a few pixels; a press that ends a drag is not a click, since the helper then holds the pointer), it can never be dragged, or left by a smaller window or by a change of its own size, outside the window,
 * and where it was put is kept on the device (rule 12 of `CLAUDE.md`). Until it is moved it is in the bottom right corner (`.play-helper` in `styles.scss`). The menu can be folded to the name of the app, and opened again, with the arrow on its first row. It is not shown while it has no menu.
 */
@Component({
  selector: 'play-helper',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  host: {
    class: 'play-helper',
    '[class.d-none]': '!menu()',
    '[class.dragging]': 'dragging()',
    '[style.left.px]': 'spot()?.x',
    '[style.top.px]': 'spot()?.y',
    '[style.right]': 'spot() ? "auto" : null',
    '[style.bottom]': 'spot() ? "auto" : null',
  },
  template: `
    <!-- the menu: white, the entries one under the other (the entry of the page that is open is marked). The first row is the name of the app, with the arrow that folds the rest away and opens it again. It is moved by pressing anywhere on it.
         The links are not draggable by the browser: its own drag of a link would cancel the move of the helper. -->
    <div class="list-group menu-style rounded-4 overflow-hidden shadow" role="group" *transloco="let t">
      @for (item of menu(); track item.route ?? item.toggle) {
        @if (item.brand) {
          <!-- the name of the app, as the website shows it: the logo with the house on its corner, "Karins" and under it "jigsaw"; it goes home -->
          <!-- home is the logo itself (with the name beside it on the home page) and nothing round it: the link is no larger than what is drawn. The rest of the row opens and folds the menu. The logo alone (a menu with no other entry, so no arrow) has the same room on all four sides -->
          <div class="list-group-item brand-item d-flex align-items-center" [class.brand-row]="(menu()?.length ?? 0) > 1" (click)="rowPressed($event)" (dblclick)="onRowDoubleClick($event)">
            <a class="d-inline-block text-reset text-decoration-none" draggable="false" [routerLink]="item.route!">
              <!-- going home leaves the menu as it is (open or folded: kept on the device); the name of the app is written beside the logo on the home page only, everywhere else the logo is enough -->
              <span class="brand-lockup scaled d-flex align-items-center gap-2">
                <span class="brand-mark"><img class="brand-logo" src="logo.svg" alt="" width="32" height="32" /><i class="bi bi-house-fill brand-home" aria-hidden="true"></i></span>
                @if (atHome()) {
                  <span class="brand-text"><span class="brand-name">Karins</span><span class="brand-sub">jigsaw</span></span>
                }
              </span>
            </a>
            <span class="d-flex ms-auto">
              @if ((menu()?.length ?? 0) > 1) {
                <button type="button" class="btn btn-link brand-fold text-body-secondary" [attr.aria-expanded]="expanded()" [title]="expanded() ? (t('play.menuFold') || 'Hide the menu') : (t('play.menuUnfold') || 'Show the menu')"
                        [attr.aria-label]="expanded() ? (t('play.menuFold') || 'Hide the menu') : (t('play.menuUnfold') || 'Show the menu')" (click)="expanded.set(!expanded())">
                  <i class="bi" [class]="expanded() ? 'bi-chevron-up' : 'bi-chevron-down'" aria-hidden="true"></i>
                </button>
              }
              <!-- the little arrow into a corner, at the right end of the row beside the arrow that folds the menu: it folds the menu and puts it in the top right corner of the window (the same as a double click on this row) -->
              <button type="button" class="btn btn-link brand-fold text-body-secondary" [title]="t('play.toCorner') || 'Fold the menu into the top right corner'" [attr.aria-label]="t('play.toCorner') || 'Fold the menu into the top right corner'" (click)="moveToCorner()">
                <i class="bi bi-box-arrow-in-up-right" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        } @else if (expanded() && item.toggle; as toggle) {
          @if (!hidden(toggle)) {
          <!-- a switch of the page that is open: on or off, the entry says which (a puzzle that is finished has no help picture and no border pieces to switch) -->
          <button type="button" class="list-group-item list-group-item-action d-flex align-items-center" role="switch" [attr.aria-checked]="stateOf(toggle)()" (click)="stateOf(toggle).set(!stateOf(toggle)())">
            <i class="bi me-2" [class]="item.icon" aria-hidden="true"></i>{{ item.text || (item.key ? (t(item.key) || item.english) : '') }}
            <span class="form-check form-switch mb-0 ms-auto ps-0"><input class="form-check-input ms-2" type="checkbox" role="presentation" tabindex="-1" [checked]="stateOf(toggle)()" (click)="$event.preventDefault()"></span>
          </button>
          }
        } @else if (expanded() && item.route) {
          <a class="list-group-item list-group-item-action" draggable="false" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" [routerLink]="item.route">
            <i class="bi me-2" [class]="item.icon" aria-hidden="true"></i>{{ item.text || (item.key ? (t(item.key) || item.english) : '') }}
          </a>
        }
      }
    </div>
  `,
})
export class Helper implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** the page that is open is the home page (the picture list): the logo has the name of the app beside it there, and is the logo alone on every other page */
  private readonly url = toSignal(inject(Router).events.pipe(filter((event) => event instanceof NavigationEnd), map((event) => (event as NavigationEnd).urlAfterRedirects)), { initialValue: inject(Router).url });
  protected readonly atHome = computed(() => /^\/play\/list(?=[/?#]|$)/.test(this.url()));

  /** the switches of the puzzle page: an entry of the menu can be one of them */
  protected readonly view = inject(PuzzelView);
  private readonly pictureView = inject(PictureView);
  private readonly listView = inject(ListView);
  private readonly favorites = inject(FavoritesService);

  /** a switch that is not offered now: the help picture and the border pieces of a puzzle that is finished, Ongoing rounds when the user has none going, and My favorites when the user has no favorites (while the list is only the favorites the switch stays, or there would be no way back) */
  protected hidden(toggle: NonNullable<PlayMenuItem['toggle']>): boolean {
    if (toggle === 'ongoing') return !this.listView.hasOngoing();
    if (toggle === 'favorites') return this.favorites.ids().size === 0 && !this.listView.favorites();
    return (toggle === 'help' || toggle === 'edges') && this.view.solved();
  }

  /** the switch, as a signal: the entry says which page it is a switch of (the puzzle, a picture, or the home page) */
  protected stateOf(toggle: NonNullable<PlayMenuItem['toggle']>): WritableSignal<boolean> {
    if (toggle === 'ongoing' || toggle === 'favorites') return this.listView.state(toggle);
    return toggle === 'picture' || toggle === 'rounds' ? this.pictureView.state(toggle) : this.view.state(toggle as PuzzelToggle);
  }

  /** the menu that main gives it (nothing: the helper is not shown) */
  readonly menu = input<readonly PlayMenuItem[] | null>(null);

  /** The rest of the first row (not the logo, which goes home, and not the arrow, which does it itself) was pressed: the menu is folded, or opened. */
  protected rowPressed(event: Event): void {
    if (menuLength(this.menu()) < 2 || (event.target as Element).closest('a, button')) return;
    this.expanded.update((now) => !now);
  }

  /** A double click on the first row (not on the logo or a button) does the same as the little corner arrow. */
  protected onRowDoubleClick(event: Event): void {
    if (!(event.target as Element).closest('a, button')) this.moveToCorner();
  }

  /** Folds the menu and puts the helper in the top right corner, one rem from the edges (the same room as in the bottom right corner). It is kept where it was put, as if it had been dragged there. */
  protected moveToCorner(): void {
    this.expanded.set(false);
    // once the folded menu is drawn, its width is known: its right edge is one rem from the right edge of the window
    requestAnimationFrame(() => {
      const gap = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const { width } = this.host.nativeElement.getBoundingClientRect();
      this.spot.set(this.inside({ x: window.innerWidth - width - gap, y: gap }));
      writePreference(SPOT_KEY, this.spot());
    });
  }

  /** the menu is open (all its entries), or folded to the name of the app; kept on the device (rule 12 of `CLAUDE.md`), open to begin with */
  protected readonly expanded = signal(readPreference('play.helperExpanded', true, isBoolean));

  /** where it was put (nothing: it has not been moved, and the stylesheet puts it in the corner) */
  protected readonly spot = signal<Spot | null>(readPreference<Spot | null>(SPOT_KEY, null, (v): v is Spot | null => v === null || isSpot(v)));
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
   * The helper became wider or higher (it was opened, or its words changed): it grows from the side that is nearest to the edge of the window, so a menu in the right corner opens to the left and one in the
   * lower corner opens upwards, and keeps the same room to that edge. It is then kept inside the window. Where it is now is kept, as if it had been dragged there.
   */
  private resized(): void {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
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

  constructor() {
    effect(() => writePreference('play.helperExpanded', this.expanded()));
  }

  ngOnInit(): void {
    this.sizeWatch.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.up(); // no listener is left on the document
    this.sizeWatch.disconnect();
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
    this.spot.set(this.inside({ x: event.clientX - this.grab.inside.x, y: event.clientY - this.grab.inside.y }));
  }

  private up(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);
    if (!this.grab) return;
    this.grab = null;
    this.dragging.set(false);
    if (this.moved) writePreference(SPOT_KEY, this.spot());
  }

  /** A smaller window, or a change of the helper's own size, takes a helper that was put near the old edge back inside. */
  @HostListener('window:resize')
  protected keepInside(): void {
    const spot = this.spot();
    if (spot) this.spot.set(this.inside(spot));
  }

  /** The corner moved to the nearest place where the whole helper is in the window. */
  private inside(spot: Spot): Spot {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    return { x: Math.min(Math.max(0, spot.x), Math.max(0, window.innerWidth - width)), y: Math.min(Math.max(0, spot.y), Math.max(0, window.innerHeight - height)) };
  }
}
