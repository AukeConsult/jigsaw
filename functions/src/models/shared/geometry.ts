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
 * A curve from `start` to `end` that bends towards `control` (a quadratic curve). It is straight when the control point is half way between the ends.
 * The middle of the curve (t = 0.5) is half way between the control point and the middle of the straight line.
 */
export class QuadraticCurve {
  constructor(
    readonly start: Point,
    readonly control: Point,
    readonly end: Point,
  ) {}

  /** the point of the curve at t: 0 is the start, 1 the end */
  at(t: number): Point {
    const u = 1 - t;
    return {
      x: u * u * this.start.x + 2 * u * t * this.control.x + t * t * this.end.x,
      y: u * u * this.start.y + 2 * u * t * this.control.y + t * t * this.end.y,
    };
  }

  /** the direction the curve goes at t (its length is not 1) */
  tangent(t: number): Point {
    return {
      x: 2 * ((1 - t) * (this.control.x - this.start.x) + t * (this.end.x - this.control.x)),
      y: 2 * ((1 - t) * (this.control.y - this.start.y) + t * (this.end.y - this.control.y)),
    };
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
  length(steps = 32): number {
    const points = this.sample(steps);
    return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
  }

  /** the part of the curve from t = a to t = b, as a curve of its own */
  part(a: number, b: number): QuadraticCurve {
    const start = this.at(a);
    const way = this.tangent(a);
    return new QuadraticCurve(start, { x: start.x + ((b - a) * way.x) / 2, y: start.y + ((b - a) * way.y) / 2 }, this.at(b));
  }

  /** the smallest box that holds it (measured along `steps` straight pieces) */
  bounds(steps = 32): Box {
    const points = this.sample(steps);
    const left = Math.min(...points.map((p) => p.x));
    const top = Math.min(...points.map((p) => p.y));
    return { left, top, width: Math.max(...points.map((p) => p.x)) - left, height: Math.max(...points.map((p) => p.y)) - top };
  }
}
