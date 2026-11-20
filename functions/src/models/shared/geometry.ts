import { MIN_RESIZED_SIDE_PX } from './canvas-object';

// Plain geometry on the canvas area: points, boxes, and the handles a box is resized with. Nothing here knows about objects.

export interface Point {
  x: number;
  y: number;
}

/** The handles a placed figure is resized with: its 4 corners and the middle of its 4 sides (the compass directions from its centre). */
export const RESIZE_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

/** A rectangle in pixels of the canvas area. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the 8 resize handles of a box are, with the direction each one points (-1, 0 or 1 along x and y). */
export function resizeHandlePositions(box: Box): { id: ResizeHandle; x: number; y: number; dx: number; dy: number }[] {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  return RESIZE_HANDLES.map((id) => {
    const dx = id.includes('e') ? 1 : id.includes('w') ? -1 : 0;
    const dy = id.includes('s') ? 1 : id.includes('n') ? -1 : 0;
    return { id, dx, dy, x: dx > 0 ? right : dx < 0 ? box.left : box.left + box.width / 2, y: dy > 0 ? bottom : dy < 0 ? box.top : box.top + box.height / 2 };
  });
}

/** The edges of a box that stay when a handle is dragged: the opposite ones, or the centre on an axis the handle does not move. */
export function resizeAnchor(box: Box, handle: ResizeHandle): Point {
  return {
    x: handle.includes('e') ? box.left : handle.includes('w') ? box.left + box.width : box.left + box.width / 2,
    y: handle.includes('s') ? box.top : handle.includes('n') ? box.top + box.height : box.top + box.height / 2,
  };
}

/**
 * The box with a handle dragged to (x, y) in a canvas of this size: the edge (or the corner) of the handle follows the pointer, onto a grid point
 * (every `step` pixels); the opposite edge stays (on an axis the handle does not move, the centre stays). With `equalSides` it stays a square
 * (a corner gives the longer of the two sides). It stays inside the canvas and is at least MIN_RESIZED_SIDE_PX.
 */
export function resizedBox(box: Box, handle: ResizeHandle, x: number, y: number, step: number, canvasWidth: number, canvasHeight: number, equalSides: boolean): Box {
  const east = handle.includes('e');
  const west = handle.includes('w');
  const south = handle.includes('s');
  const north = handle.includes('n');
  const snap = (value: number) => Math.round(value / step) * step;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  const anchor = resizeAnchor(box, handle);
  // how much room there is, from the anchor, in the direction of the handle
  const roomX = Math.floor(east ? canvasWidth - anchor.x : west ? anchor.x : 2 * Math.min(centerX, canvasWidth - centerX));
  const roomY = Math.floor(south ? canvasHeight - anchor.y : north ? anchor.y : 2 * Math.min(centerY, canvasHeight - centerY));
  let width = east ? snap(x) - anchor.x : west ? anchor.x - snap(x) : box.width;
  let height = south ? snap(y) - anchor.y : north ? anchor.y - snap(y) : box.height;
  width = Math.max(MIN_RESIZED_SIDE_PX, Math.round(width));
  height = Math.max(MIN_RESIZED_SIDE_PX, Math.round(height));
  if (equalSides) {
    const size = east || west ? (north || south ? Math.max(width, height) : width) : height;
    width = height = Math.max(MIN_RESIZED_SIDE_PX, Math.min(size, roomX, roomY));
  } else {
    width = Math.max(MIN_RESIZED_SIDE_PX, Math.min(width, roomX));
    height = Math.max(MIN_RESIZED_SIDE_PX, Math.min(height, roomY));
  }
  return {
    left: east ? anchor.x : west ? anchor.x - width : anchor.x - width / 2,
    top: south ? anchor.y : north ? anchor.y - height : anchor.y - height / 2,
    width,
    height,
  };
}

/**
 * A smooth curve through points (at least 2), from the first to the last: it is straight when the points are on a line at equal distances.
 * `at(t)` goes from the start (t = 0) to the end (t = 1); a part of a curve (see `part`) is a curve of its own.
 */
export class SmoothCurve {
  constructor(
    private readonly through: readonly Point[],
    private readonly from = 0,
    private readonly to = 1,
  ) {}

  get start(): Point {
    return this.at(0);
  }

  get end(): Point {
    return this.at(1);
  }

  /** the four points that shape the piece of the curve between two of its points (the ends are mirrored, so a straight line stays straight) */
  private piece(i: number): Point[] {
    const p = this.through;
    const last = p.length - 1;
    const before = i === 0 ? { x: 2 * p[0].x - p[1].x, y: 2 * p[0].y - p[1].y } : p[i - 1];
    const after = i + 1 === last ? { x: 2 * p[last].x - p[last - 1].x, y: 2 * p[last].y - p[last - 1].y } : p[i + 2];
    return [before, p[i], p[i + 1], after];
  }

  /** where on the whole curve (0..1) the t of this part is, as the piece it is in and how far in that piece (0..1) */
  private locate(t: number): { piece: Point[]; f: number } {
    const pieces = this.through.length - 1;
    const s = Math.min(Math.max(this.from + (this.to - this.from) * t, 0), 1) * pieces;
    const i = Math.min(Math.floor(s), pieces - 1);
    return { piece: this.piece(i), f: s - i };
  }

  /** the point of the curve at t: 0 is the start, 1 the end */
  at(t: number): Point {
    const { piece: [a, b, c, d], f } = this.locate(t);
    const one = (k: 'x' | 'y') => 0.5 * (2 * b[k] + (c[k] - a[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f * f + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * f * f * f);
    return { x: one('x'), y: one('y') };
  }

  /** the direction the curve goes at t (its length is not 1) */
  tangent(t: number): Point {
    const { piece: [a, b, c, d], f } = this.locate(t);
    const scale = (this.through.length - 1) * (this.to - this.from);
    const one = (k: 'x' | 'y') => scale * 0.5 * (c[k] - a[k] + 2 * (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f + 3 * (3 * b[k] - a[k] - 3 * c[k] + d[k]) * f * f);
    return { x: one('x'), y: one('y') };
  }

  /** the direction across the curve at t, of length 1: the tangent turned a quarter turn clockwise on the screen (along x to the right gives down) */
  normal(t: number): Point {
    const { x, y } = this.tangent(t);
    const length = Math.hypot(x, y) || 1;
    return { x: -y / length, y: x / length };
  }

  /** points along the curve, from the start to the end (`steps` + 1 of them) */
  sample(steps: number): Point[] {
    return Array.from({ length: steps + 1 }, (_, i) => this.at(i / steps));
  }

  /** how long it is (measured along `steps` straight pieces) */
  length(steps = 48): number {
    const points = this.sample(steps);
    return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  }

  /** the part of the curve from t = a to t = b, as a curve of its own */
  part(a: number, b: number): SmoothCurve {
    return new SmoothCurve(this.through, this.from + (this.to - this.from) * a, this.from + (this.to - this.from) * b);
  }

  /** the smallest box that holds it (measured along `steps` straight pieces) */
  bounds(steps = 48): Box {
    const points = this.sample(steps);
    const left = Math.min(...points.map((p) => p.x));
    const top = Math.min(...points.map((p) => p.y));
    return { left, top, width: Math.max(...points.map((p) => p.x)) - left, height: Math.max(...points.map((p) => p.y)) - top };
  }
}

/** A part of a picture, in the pixels of the picture. */
export interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A picture seen through a frame (the shape of the canvas): it covers the frame at least, and can be zoomed in and dragged inside the frame to find the
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
