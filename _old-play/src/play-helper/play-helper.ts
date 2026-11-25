import { NgComponentOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { readPreference, writePreference } from '../../app/core/preferences';
import { HelperPanel } from './helper-panel';

/** Where the helper was put: its top left corner, in pixels of the window. */
interface Spot {
  x: number;
  y: number;
}

const SPOT_KEY = 'play.helperSpot';
const isSpot = (value: unknown): value is Spot =>
  !!value && typeof value === 'object' && Number.isFinite((value as Spot).x) && Number.isFinite((value as Spot).y);
/** how far the pointer must go (pixels) before a press is a drag and not a click */
const DRAG_FROM = 4;

/**
 * The helper: a button that floats over the whole page (`.play-helper` in `styles.scss` gives it the look and the layer) and is dragged to where the person wants it.
 * Pressed (not dragged), it opens the views of the helper: in a popup beside it, or inside the main area of the main page (`Helper.show`, and `helper-main-views`). What is in the button (the menu) and in the views
 * are those of the helper that fits the circumstances of the app now (`HelperPanel`, `Helper`, `PlayCircumstances`, the list in `helpers.ts`). Where it was put is kept on the device (rule 12 of `CLAUDE.md`); it can never be dragged, or left by a smaller window,
 * outside the window. Until it is moved it is in the bottom right corner. Whether the views are open is not kept: it covers the page.
 */
@Component({
  selector: 'play-helper',
  imports: [TranslocoDirective, NgComponentOutlet],
  providers: [provideTranslocoScope('play')],
  host: {
    class: 'play-helper',
    '[style.left.px]': 'spot()?.x',
    '[style.top.px]': 'spot()?.y',
    '[style.right]': 'spot() ? "auto" : null',
    '[style.bottom]': 'spot() ? "auto" : null',
  },
  templateUrl: './play-helper.html',
})
export class PlayHelper implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly panelState = inject(HelperPanel);

  /** its menu (inside the button), its points (the entries of the menu, inside the button too, when there is more than one) and its views (in the popup, when the helper shows them there) */
  protected readonly menu = computed(() => this.panelState.helper()?.menu ?? null);
  protected readonly points = this.panelState.points;
  protected readonly views = this.panelState.views;

  /** where it was put (nothing: it has not been moved, and the stylesheet puts it in the corner) */
  protected readonly spot = signal<Spot | null>(readPreference<Spot | null>(SPOT_KEY, null, (v): v is Spot | null => v === null || isSpot(v)));
  /** while it is pressed or dragged: where on the helper the pointer took hold of it, where the pointer started, and what was pressed (it holds the pointer once the press is a drag) */
  protected grab: { inside: Spot; from: Spot; element: HTMLElement; pointer: number } | null = null;
  /** the press that is going on has become a drag: the click that follows it is not a click */
  private moved = false;

  /** a popup opens above the button when the button is in the lower half of the window, otherwise below it; and towards the side where there is room */
  protected above(): boolean {
    return this.centre().y > window.innerHeight / 2;
  }
  protected towardsLeft(): boolean {
    return this.centre().x > window.innerWidth / 2;
  }

  /** the button changes size when what is in it changes (another helper, another language): where it was put is checked again, so it never goes over the edge */
  private readonly sizeWatch = new ResizeObserver(() => this.resized());

  ngOnInit(): void {
    this.sizeWatch.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.sizeWatch.disconnect();
  }

  protected down(event: PointerEvent): void {
    if (event.button !== 0) return;
    const box = this.host.nativeElement.getBoundingClientRect();
    this.grab = { inside: { x: event.clientX - box.left, y: event.clientY - box.top }, from: { x: event.clientX, y: event.clientY }, element: event.currentTarget as HTMLElement, pointer: event.pointerId };
    this.moved = false; // the pointer is held only when the press becomes a drag, so a press on an entry of the menu stays a click
  }

  protected move(event: PointerEvent): void {
    if (!this.grab) return;
    if (!this.moved && Math.hypot(event.clientX - this.grab.from.x, event.clientY - this.grab.from.y) < DRAG_FROM) return;
    if (!this.moved) this.grab.element.setPointerCapture(this.grab.pointer);
    this.moved = true;
    this.spot.set(this.inside({ x: event.clientX - this.grab.inside.x, y: event.clientY - this.grab.inside.y }));
  }

  protected up(): void {
    if (!this.grab) return;
    this.grab = null;
    if (this.moved) writePreference(SPOT_KEY, this.spot());
  }

  /** The button is pressed: the panel opens or closes (the click that ends a drag does nothing). */
  protected toggle(): void {
    if (this.moved) {
      this.moved = false;
      return;
    }
    this.panelState.press();
  }

  /** An entry of the menu inside the button is pressed: its views are the active ones (pressed again, they are closed). The click that ends a drag does nothing. */
  protected pick(index: number): void {
    if (this.moved) {
      this.moved = false;
      return;
    }
    this.panelState.choose(index);
  }

  /** A press anywhere else closes a popup (views in the main area are part of the page, and stay), and Escape closes the views wherever they are. */
  @HostListener('document:pointerdown', ['$event'])
  protected outside(event: PointerEvent): void {
    if (this.panelState.inPopup() && !this.host.nativeElement.contains(event.target as Node)) this.panelState.close();
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.panelState.close();
  }

  /** A smaller window takes a helper that was put near the old edge back inside. */
  @HostListener('window:resize')
  protected resized(): void {
    const spot = this.spot();
    if (spot) this.spot.set(this.inside(spot));
  }

  /** the middle of the button now (where it is in the corner, or where it was put) */
  private centre(): Spot {
    const spot = this.spot();
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    return spot ? { x: spot.x + width / 2, y: spot.y + height / 2 } : { x: window.innerWidth - width / 2, y: window.innerHeight - height / 2 };
  }

  /** The corner moved to the nearest place where the whole helper is in the window. */
  private inside(spot: Spot): Spot {
    const { width, height } = this.host.nativeElement.getBoundingClientRect();
    return { x: Math.min(Math.max(0, spot.x), Math.max(0, window.innerWidth - width)), y: Math.min(Math.max(0, spot.y), Math.max(0, window.innerHeight - height)) };
  }
}
