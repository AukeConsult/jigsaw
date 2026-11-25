import { Component, ElementRef, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { readPreference, writePreference } from '../../app/core/preferences';

/** Where a view was put and how big it was made, kept on the device: how far it was moved from its place, and its size. */
interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number | null;
  readonly h: number | null;
}

const isFrame = (value: unknown): value is Frame => {
  const f = value as Frame | null;
  return !!f && typeof f === 'object' && Number.isFinite(f.x) && Number.isFinite(f.y) && (f.w === null || Number.isFinite(f.w)) && (f.h === null || Number.isFinite(f.h));
};

/** how far the pointer must go (pixels) before a press on a view is a drag */
const DRAG_FROM = 4;
/** the things in a view that are used with the pointer: pressing on them does not move the view */
const INTERACTIVE = 'input, textarea, select, button, a, label, summary, [contenteditable], .helper-view-grip';
/** the view that was pressed last is over the others */
let topLayer = 0;

/**
 * A view of a helper. **In a popup a view is a window of its own: it can be moved and made bigger or smaller** (the properties below say whether, and how small). **In the frame of the main area (`.helper-main-frame`) it is
 * a sub-component directly on the page**: it is embedded there, with no card, no shadow, nothing to move or resize, only a thin line between it and the view above. In a popup it is moved by pressing on a part of it that does nothing else (not a field or a button) and dragging; it is kept inside the window. It is resized with the grip in its bottom right corner.
 * Where it was put and its size are kept on the device when the view has a `storageKey` (rule 12 of `CLAUDE.md`). The basic one is empty; a helper's own views extend it and give it a template, and
 * change the properties they need (`override readonly resizable = false`). In a popup it has the look of a card (`helper-view`, in `styles.scss`).
 */
@Component({
  selector: 'helper-view',
  template: '',
  host: {
    class: 'helper-view',
    '[class.card]': '!embedded()',
    '[class.shadow]': '!embedded()',
    '[class.p-2]': '!embedded()',
    '[class.helper-view-embedded]': 'embedded()',
    '[class.helper-view-movable]': 'movable && !embedded()',
    '[class.d-none]': '!visible()',
    '[style.transform]': 'transform()',
    '[style.width.px]': 'size()?.w ?? width',
    '[style.height.px]': 'size()?.h ?? height',
    '[style.z-index]': 'layer()',
  },
})
export class HelperView implements OnInit, OnDestroy {
  protected readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** whether the view is shown at all now (a view that has nothing to say in the circumstances says no, and takes no room) */
  readonly visible: () => boolean = () => true;
  /** the view can be moved */
  readonly movable: boolean = true;
  /** the view can be resized (a grip shows in its corner) */
  readonly resizable: boolean = true;
  /** how wide it is to begin with, in pixels (nothing: as wide as the stylesheet says, `--app-helper-panel`) */
  readonly width: number | null = null;
  /** how high it is to begin with, in pixels (nothing: as high as what is in it) */
  readonly height: number | null = null;
  /** the least size it can be made, in pixels */
  readonly minWidth: number = 200;
  readonly minHeight: number = 80;
  /** where the place and size are kept on the device (nothing: they are not kept, and the view begins in its place every time) */
  readonly storageKey: string | null = null;

  /** the view sits directly on the page, in the frame of the main area: no card, and it is not moved or resized */
  protected readonly embedded = signal(false);
  /** how far it has been moved from its place */
  protected readonly offset = signal({ x: 0, y: 0 });
  /** the size it was made (nothing: it has not been resized) */
  protected readonly size = signal<{ w: number; h: number } | null>(null);
  protected readonly layer = signal<number | null>(null);
  protected transform(): string | null {
    const { x, y } = this.offset();
    return x || y ? `translate(${x}px, ${y}px)` : null;
  }

  /** the press that is going on: what it started from */
  private press: { kind: 'move' | 'resize'; from: { x: number; y: number }; offset: { x: number; y: number }; size: { w: number; h: number }; moved: boolean } | null = null;
  private grip: HTMLElement | null = null;

  ngOnInit(): void {
    if (this.host.nativeElement.closest('.helper-main-frame')) {
      this.embedded.set(true);
      return;
    }
    if (this.storageKey) {
      const kept = readPreference<Frame | null>(this.storageKey, null, (v): v is Frame | null => v === null || isFrame(v));
      if (kept) {
        this.offset.set({ x: kept.x, y: kept.y });
        if (kept.w !== null && kept.h !== null) this.size.set({ w: kept.w, h: kept.h });
      }
    }
    if (this.resizable) this.addGrip();
    queueMicrotask(() => this.keepInside()); // what was kept may not fit a smaller window
  }

  ngOnDestroy(): void {
    this.grip?.remove();
  }

  /** The grip in the corner: a small element made here, so every view has one without its template having to say so. */
  private addGrip(): void {
    const grip = document.createElement('span');
    grip.className = 'helper-view-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.addEventListener('pointerdown', (event) => this.down(event, 'resize'));
    // the moves and the end of the press come to the view itself (they bubble up from the grip, which holds the pointer)
    this.host.nativeElement.append(grip);
    this.grip = grip;
  }

  @HostListener('pointerdown', ['$event'])
  protected pressed(event: PointerEvent): void {
    if (this.embedded()) return;
    this.layer.set(++topLayer);
    if (this.movable && event.button === 0 && !(event.target as Element).closest(INTERACTIVE)) this.down(event, 'move');
  }

  private down(event: PointerEvent, kind: 'move' | 'resize'): void {
    if (event.button !== 0) return;
    const box = this.host.nativeElement.getBoundingClientRect();
    this.press = { kind, from: { x: event.clientX, y: event.clientY }, offset: this.offset(), size: { w: box.width, h: box.height }, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (kind === 'resize') event.stopPropagation(); // the grip is in the view: pressing it does not also move it
    event.preventDefault();
  }

  @HostListener('pointermove', ['$event'])
  protected move(event: PointerEvent): void {
    const p = this.press;
    if (!p) return;
    const dx = event.clientX - p.from.x;
    const dy = event.clientY - p.from.y;
    if (!p.moved && Math.hypot(dx, dy) < DRAG_FROM) return;
    p.moved = true;
    const box = this.host.nativeElement.getBoundingClientRect();
    if (p.kind === 'move') {
      const home = { left: box.left - this.offset().x, top: box.top - this.offset().y }; // where the view is when it has not been moved
      const x = Math.min(Math.max(p.offset.x + dx, -home.left), Math.max(-home.left, window.innerWidth - box.width - home.left));
      const y = Math.min(Math.max(p.offset.y + dy, -home.top), Math.max(-home.top, window.innerHeight - box.height - home.top));
      this.offset.set({ x, y });
    } else {
      const w = Math.min(Math.max(p.size.w + dx, this.minWidth), Math.max(this.minWidth, window.innerWidth - box.left));
      const h = Math.min(Math.max(p.size.h + dy, this.minHeight), Math.max(this.minHeight, window.innerHeight - box.top));
      this.size.set({ w, h });
    }
  }

  @HostListener('pointerup')
  @HostListener('pointercancel')
  protected up(): void {
    const p = this.press;
    this.press = null;
    if (p?.moved) this.keep();
  }

  /** A smaller window takes a view that was put near the old edge back inside. */
  @HostListener('window:resize')
  protected keepInside(): void {
    const box = this.host.nativeElement.getBoundingClientRect();
    if (!box.width) return;
    const { x, y } = this.offset();
    const home = { left: box.left - x, top: box.top - y };
    const nx = Math.min(Math.max(x, -home.left), Math.max(-home.left, window.innerWidth - box.width - home.left));
    const ny = Math.min(Math.max(y, -home.top), Math.max(-home.top, window.innerHeight - box.height - home.top));
    if (nx !== x || ny !== y) this.offset.set({ x: nx, y: ny });
  }

  private keep(): void {
    if (!this.storageKey) return;
    const { x, y } = this.offset();
    writePreference(this.storageKey, { x, y, w: this.size()?.w ?? null, h: this.size()?.h ?? null } satisfies Frame);
  }
}
