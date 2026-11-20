import { Component, computed, effect, input, output, signal } from '@angular/core';
import { PictureCrop, SourceRect } from '../models/shared/geometry';

/** The most room the frame gets on the window, in pixels (the frame has the shape of the canvas and is made as big as it can be in this). */
const MAX_FRAME_W = 720;
const MAX_FRAME_H = 460;

/**
 * Where the person finds the right cut of a picture they chose: the picture lies behind a frame with the shape of the canvas, and is dragged inside it
 * (and zoomed with the slider or the wheel). "Use this cut" tells which part of the picture the frame shows (see `PictureCrop`); nothing is cut here.
 */
@Component({
  selector: 'app-picture-cropper',
  templateUrl: './picture-cropper.html',
})
export class PictureCropper {
  /** the picture that was chosen */
  readonly file = input.required<File>();
  /** the size of the canvas: the frame has its shape */
  readonly width = input.required<number>();
  readonly height = input.required<number>();

  /** the part of the picture the frame shows, in the pixels of the picture */
  readonly use = output<SourceRect>();
  readonly cancel = output<void>();

  /** the picture as the page can show it (null until it is read) */
  readonly url = signal<string | null>(null);
  readonly failed = signal(false);
  /** the picture seen through the frame (null until the picture is read) */
  readonly crop = signal<PictureCrop | null>(null);

  /** how big the frame is on the page: the shape of the canvas, as big as fits in the room and on the window */
  readonly frame = computed(() => {
    const k = Math.min(MAX_FRAME_W / this.width(), MAX_FRAME_H / this.height(), (window.innerWidth - 80) / this.width());
    return { w: Math.max(40, Math.round(this.width() * k)), h: Math.max(30, Math.round(this.height() * k)) };
  });

  /** where the pointer was when the picture was grabbed (null: it is not being dragged) */
  private grab: { x: number; y: number } | null = null;

  constructor() {
    effect((onCleanup) => {
      const file = this.file();
      const address = URL.createObjectURL(file);
      this.url.set(address);
      this.failed.set(false);
      this.crop.set(null);
      createImageBitmap(file).then(
        (bitmap) => {
          const frame = this.frame();
          this.crop.set(new PictureCrop(frame.w, frame.h, bitmap.width, bitmap.height));
          bitmap.close();
        },
        () => this.failed.set(true),
      );
      onCleanup(() => URL.revokeObjectURL(address));
    });
  }

  startDrag(event: PointerEvent): void {
    if (!this.crop()) return;
    this.grab = { x: event.clientX, y: event.clientY };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* not an active pointer */
    }
  }

  drag(event: PointerEvent): void {
    const grab = this.grab;
    const crop = this.crop();
    if (!grab || !crop) return;
    this.crop.set(crop.moved(event.clientX - grab.x, event.clientY - grab.y));
    this.grab = { x: event.clientX, y: event.clientY };
  }

  endDrag(): void {
    this.grab = null;
  }

  /** the wheel zooms the picture around the pointer */
  wheel(event: WheelEvent): void {
    const crop = this.crop();
    if (!crop) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.crop.set(crop.zoomed(crop.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), event.clientX - rect.left, event.clientY - rect.top));
  }

  zoomTo(zoom: number): void {
    const crop = this.crop();
    if (crop) this.crop.set(crop.zoomed(zoom));
  }

  confirm(): void {
    const crop = this.crop();
    if (crop) this.use.emit(crop.source());
  }

  readonly maxZoom = PictureCrop.MAX_ZOOM;
}
