// Plain geometry on the picture area: points, boxes, and the part of a picture a frame shows. Nothing here knows about objects.

export interface Point {
  x: number;
  y: number;
}

/** A rectangle in pixels of the picture area. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A part of a picture, in the pixels of the picture. */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A picture seen through a frame (the shape of the picture area): it covers the frame at least, and can be zoomed in and dragged inside the frame to find the
 * right cut. Never changes: moving or zooming gives a new one. `x` and `y` are where the top left corner of the picture is in the frame (never so that
 * the frame shows something outside the picture).
 */
export class PictureCrop {
  /** the most the picture can be zoomed in, as a multiple of the size it just covers the frame with */
  static readonly MAX_ZOOM = 4;

  readonly x: number;
  readonly y: number;
  readonly zoom: number;

  constructor(
    readonly frameW: number,
    readonly frameH: number,
    readonly naturalW: number,
    readonly naturalH: number,
    zoom = 1,
    x?: number,
    y?: number,
  ) {
    this.zoom = Math.min(PictureCrop.MAX_ZOOM, Math.max(1, zoom));
    // no further out than the frame is covered, no further in than the corner of the frame
    const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
    this.x = clamp(x ?? (frameW - this.imageW) / 2, frameW - this.imageW, 0);
    this.y = clamp(y ?? (frameH - this.imageH) / 2, frameH - this.imageH, 0);
  }

  /**
   * The cut a picture gets by itself, before anybody adjusts it: the biggest part of it with this shape (width / height), round the middle of the picture. For an earlier cut that is to get another shape: round
   * `centre` (where it had its middle, as far as the picture reaches) and zoomed in as much (`zoom`).
   */
  static covering(naturalW: number, naturalH: number, shape: number, centre: { x: number; y: number } = { x: naturalW / 2, y: naturalH / 2 }, zoom = 1): SourceRect {
    const w = Math.min(naturalW, naturalH * shape) / Math.max(1, zoom);
    const h = Math.min(naturalH, naturalW / shape) / Math.max(1, zoom);
    const clamp = (v: number, high: number) => Math.min(high, Math.max(0, v));
    return { x: clamp(centre.x - w / 2, naturalW - w), y: clamp(centre.y - h / 2, naturalH - h), w, h };
  }

  /** how many frame pixels one pixel of the picture is: just covering the frame, times the zoom */
  get scale(): number {
    return Math.max(this.frameW / this.naturalW, this.frameH / this.naturalH) * this.zoom;
  }

  /** the picture as it is drawn in the frame, in frame pixels */
  get imageW(): number {
    return this.naturalW * this.scale;
  }

  get imageH(): number {
    return this.naturalH * this.scale;
  }

  /** the same picture dragged by this much (in frame pixels), as far as it can go */
  moved(dx: number, dy: number): PictureCrop {
    return new PictureCrop(this.frameW, this.frameH, this.naturalW, this.naturalH, this.zoom, this.x + dx, this.y + dy);
  }

  /** the picture zoomed to this (1 covers the frame, up to `MAX_ZOOM`), the point of the picture under (`aroundX`, `aroundY`) in the frame staying where it is */
  zoomed(zoom: number, aroundX = this.frameW / 2, aroundY = this.frameH / 2): PictureCrop {
    const next = Math.min(PictureCrop.MAX_ZOOM, Math.max(1, zoom));
    const ratio = (Math.max(this.frameW / this.naturalW, this.frameH / this.naturalH) * next) / this.scale;
    return new PictureCrop(this.frameW, this.frameH, this.naturalW, this.naturalH, next, aroundX - (aroundX - this.x) * ratio, aroundY - (aroundY - this.y) * ratio);
  }

  /** what the frame shows, as a part of the picture in its own pixels: the cut */
  source(): SourceRect {
    return { x: -this.x / this.scale + 0, y: -this.y / this.scale + 0, w: this.frameW / this.scale, h: this.frameH / this.scale }; // + 0: not -0
  }
}
