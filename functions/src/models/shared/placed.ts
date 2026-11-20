import { CanvasArrow, CanvasBaseObject, CanvasFigure, CanvasObjectInput, OBJECT_MAX_SIDE } from './canvas-object';
import { Box, Point, ResizeHandle, SmoothCurve, resizeHandlePositions, resizedBox } from './geometry';

// The objects placed on a canvas: what is stored (`PlacedObject`) and the classes that work on it, a placed figure and a placed arrow.

/** The canvas itself is always layer 0. The placed objects are on the layers above it. */
export const CANVAS_LAYER = 0;
/** The layer a first object goes on (the objects after it go on the last layer). */
export const DEFAULT_LAYER = 10;
/** The highest layer an object can be on. */
export const MAX_LAYER = 1000;

/** The most an arrow can be bent, in pixels. */
export const MAX_BEND = 2 * OBJECT_MAX_SIDE;
/** A bend of this many pixels or less is no bend: the arrow is straight. */
export const STRAIGHT_BEND_PX = 3;

/** How far (in pixels) an end of an arrow may be from the point it is fastened to: none, only what a decimal number cannot hold. */
export const CONNECTION_TOLERANCE_PX = 0.01;

/** One connection point of a placed figure: the placed figure and which of its points (n, ne, e, ... see `CanvasBaseObject.connectionPoints`). */
export interface PlacedConnection {
  /** the id of the placed figure */
  objectId: string;
  pointId: string;
}

/** What the two ends of a placed arrow are fastened to: `start` is its left end and `end` its right end (the ids of its own connection points). */
export interface PlacedConnections {
  start?: PlacedConnection;
  end?: PlacedConnection;
}

/** A canvas object placed on a canvas area, as it is stored: a copy of the object as it was when placed (so deleting or changing the object later does not change the canvas), and where its centre is. */
export interface PlacedObject {
  /** identifies this placement on the canvas */
  id: string;
  object: CanvasObjectInput;
  /** the centre of the object: pixels from the left edge of the canvas area (a whole or a half pixel, and for an arrow that is fastened, where its end is exactly on the point); this is the point that sticks to a grid point */
  centerX: number;
  /** the centre of the object: pixels from the top edge of the canvas area */
  centerY: number;
  /** an arrow: the figure points its ends are fastened to (an end that is not fastened is free) */
  connections?: PlacedConnections;
  /** an arrow that is stretched: how long it is in pixels (without it, it is as long as the object, its width) */
  length?: number;
  /** the layer it is on: above the canvas (layer 0), a higher layer is in front of a lower one (without it: DEFAULT_LAYER) */
  layer?: number;
  /** an arrow that is bent: how far its middle is from the middle of the straight line between its ends, to the side, in pixels (without it, 0: straight) */
  bend?: number;
  /** an arrow that is bent: how far its curve is from the straight line a quarter of the way from its start (without it, three quarters of `bend`, as a plain bend is) */
  bendStart?: number;
  /** the same three quarters of the way from its start, a quarter from its end */
  bendEnd?: number;
  /** an arrow that is turned: its angle in radians, 0 along the x axis to the right, positive clockwise on the screen (without it, 0) */
  angle?: number;
}

/** A connection point of a placed object, in pixels of the canvas area. */
export interface PlacedPoint extends Point {
  id: string;
  role?: 'start' | 'end' | 'start-end';
}

export type EndId = 'start' | 'end';

/**
 * A placed object: it knows its own place, its own box and its own connection points in the canvas.
 * It never changes: moving it gives a new one. The children are a placed figure and a placed arrow.
 */
export abstract class PlacedBase {
  private cachedModel?: CanvasBaseObject;

  constructor(readonly data: PlacedObject) {}

  /** The placed object for these stored data: an arrow for a connector, a figure for anything else. */
  static of(data: PlacedObject): PlacedFigure | PlacedArrow {
    return data.object?.kind === 'connector' ? new PlacedArrow(data) : new PlacedFigure(data);
  }

  /**
   * The data that is stored for a placed object that is allowed: only the known fields, whatever else came with it is left out (the object itself
   * by `CanvasBaseObject.stored`).
   */
  static stored(data: PlacedObject): PlacedObject {
    const c = data.connections;
    const pick = (to: PlacedConnection) => ({ objectId: to.objectId, pointId: to.pointId });
    return {
      id: data.id,
      centerX: data.centerX,
      centerY: data.centerY,
      object: CanvasBaseObject.stored(data.object),
      ...(c ? { connections: { ...(c.start ? { start: pick(c.start) } : {}), ...(c.end ? { end: pick(c.end) } : {}) } } : {}),
      ...(data.layer !== undefined ? { layer: data.layer } : {}),
      ...(data.bend !== undefined ? { bend: data.bend } : {}),
      ...(data.bendStart !== undefined ? { bendStart: data.bendStart } : {}),
      ...(data.bendEnd !== undefined ? { bendEnd: data.bendEnd } : {}),
      ...(data.length !== undefined ? { length: data.length } : {}),
      ...(data.angle !== undefined ? { angle: data.angle } : {}),
    };
  }

  /**
   * A placed object that an older version saved, as it is now: one saved before its centre was stored has its top-left corner in x and y (its centre
   * is half its size further), its object lacked fields (see `CanvasBaseObject.fromStored`), and one saved before there were layers is on the default layer.
   */
  static fromStored(doc: PlacedObject & { x?: number; y?: number }): PlacedObject {
    const { x, y, ...rest } = doc;
    const centred = typeof rest.centerX === 'number' && typeof rest.centerY === 'number' ? rest : { ...rest, centerX: (x ?? 0) + doc.object.width / 2, centerY: (y ?? 0) + doc.object.height / 2 };
    return { ...centred, object: CanvasBaseObject.fromStored(centred.object), layer: centred.layer ?? DEFAULT_LAYER };
  }

  get id(): string {
    return this.data.id;
  }

  get object(): CanvasObjectInput {
    return this.data.object;
  }

  get centerX(): number {
    return this.data.centerX;
  }

  get centerY(): number {
    return this.data.centerY;
  }

  /** the layer it is on: 1 or more (the canvas is layer 0), a higher layer is in front of a lower one */
  get layer(): number {
    return this.data.layer ?? DEFAULT_LAYER;
  }

  /** the same object on another layer */
  withLayer(layer: number): PlacedBase {
    return PlacedBase.of({ ...this.data, layer });
  }

  /** the object it is a copy of, the model that knows its connection points and checks its settings */
  get model(): CanvasBaseObject {
    return (this.cachedModel ??= CanvasBaseObject.of(this.data.object ?? {}));
  }

  /** whether it is inside a canvas of this size */
  abstract fits(width: number, height: number): boolean;

  /** its connection points, in pixels of the canvas area */
  abstract points(): PlacedPoint[];

  /** the same object with its centre somewhere else */
  abstract at(centerX: number, centerY: number): PlacedBase;

  /** the smallest box that holds it (an arrow: its two ends) */
  abstract bounds(): Box;

  /**
   * The same object scaled about a point: its position moves away from (or towards) the point by the factors along x and y, and its size changes
   * by them, staying inside a canvas of this size.
   */
  abstract scaledAbout(anchor: Point, scaleX: number, scaleY: number, canvasWidth: number, canvasHeight: number): PlacedBase;

  pointNamed(id: string): PlacedPoint | undefined {
    return this.points().find((p) => p.id === id);
  }

  /** what is wrong with this object in particular (only for its kind) */
  protected ownError(): string {
    return '';
  }

  /** The reason it is not allowed on a canvas of this size, or '' when it is fine. */
  error(width: number, height: number): string {
    const modelError = this.model.error();
    if (modelError) return `A placed object is not valid: ${modelError}`;
    const { centerX: cx, centerY: cy } = this.data;
    // a centre is a whole or a half pixel (an object with an odd size has a centre between two pixels); an arrow that is fastened to a point
    // has the centre that puts its end exactly on the point, which can be any position
    if (typeof cx !== 'number' || typeof cy !== 'number' || !Number.isFinite(cx) || !Number.isFinite(cy)) return 'A placed object has a bad position.';
    const layer = this.data.layer;
    if (layer !== undefined && (typeof layer !== 'number' || !Number.isInteger(layer) || layer <= CANVAS_LAYER || layer > MAX_LAYER)) {
      return `A placed object is on a layer from ${CANVAS_LAYER + 1} to ${MAX_LAYER} (the canvas is layer ${CANVAS_LAYER}).`;
    }
    return this.ownError() || (this.fits(width, height) ? '' : `"${this.object.name}" does not fit inside the canvas.`);
  }
}

/** A placed figure: a box, with its connection points around it. It cannot be stretched or turned, and nothing is fastened by it (arrows are fastened to it). */
export class PlacedFigure extends PlacedBase {
  get left(): number {
    return this.centerX - this.object.width / 2;
  }

  get top(): number {
    return this.centerY - this.object.height / 2;
  }

  fits(width: number, height: number): boolean {
    return this.left >= 0 && this.top >= 0 && this.left + this.object.width <= width && this.top + this.object.height <= height;
  }

  points(): PlacedPoint[] {
    return this.model.connectionPoints().map((p) => ({ id: p.id, ...(p.role ? { role: p.role } : {}), x: this.left + p.x, y: this.top + p.y }));
  }

  at(centerX: number, centerY: number): PlacedFigure {
    return new PlacedFigure({ ...this.data, centerX, centerY });
  }

  /** the figure it is a copy of: it knows if it has equal sides, and how its sizes scale */
  get figure(): CanvasFigure {
    return this.model as CanvasFigure;
  }

  /** its box */
  box(): Box {
    return { left: this.left, top: this.top, width: this.object.width, height: this.object.height };
  }

  bounds(): Box {
    return this.box();
  }

  /** where its resize handles are, in pixels of the canvas area, with the direction each one points */
  handles(): { id: ResizeHandle; x: number; y: number; dx: number; dy: number }[] {
    return resizeHandlePositions(this.box());
  }

  /**
   * The same figure with a handle dragged to (x, y) (see `resizedBox`): a square and a circle stay equal-sided, and its corner radius is kept at most
   * half of its shorter side.
   */
  resized(handle: ResizeHandle, x: number, y: number, step: number, canvasWidth: number, canvasHeight: number): PlacedFigure {
    return this.withBox(resizedBox(this.box(), handle, x, y, step, canvasWidth, canvasHeight, this.figure.equalSides));
  }

  /** the same figure in this box (its corner radius kept at most half of its shorter side) */
  private withBox(box: Box): PlacedFigure {
    const o = this.object;
    return new PlacedFigure({
      ...this.data,
      centerX: box.left + box.width / 2,
      centerY: box.top + box.height / 2,
      object: { ...o, width: box.width, height: box.height, cornerRadius: Math.min(o.cornerRadius, Math.floor(Math.min(box.width, box.height) / 2)) },
    });
  }

  /** The figure scaled: it scales its own sizes (see `CanvasFigure.scaledSettings`), its centre moves away from the point (or towards it) by the factors. */
  scaledAbout(anchor: Point, scaleX: number, scaleY: number, canvasWidth: number, canvasHeight: number): PlacedFigure {
    const object = this.model.scaledSettings(scaleX, scaleY);
    const centerX = anchor.x + (this.centerX - anchor.x) * scaleX;
    const centerY = anchor.y + (this.centerY - anchor.y) * scaleY;
    const clamp = (value: number, max: number) => Math.min(Math.max(0, value), Math.max(0, max));
    const left = clamp(centerX - object.width / 2, canvasWidth - object.width);
    const top = clamp(centerY - object.height / 2, canvasHeight - object.height);
    return new PlacedFigure({ ...this.data, object, centerX: left + object.width / 2, centerY: top + object.height / 2 });
  }

  protected override ownError(): string {
    const d = this.data;
    if (d.length !== undefined || d.angle !== undefined || d.bend !== undefined || d.bendStart !== undefined || d.bendEnd !== undefined || d.connections !== undefined) {
      return `"${this.object.name}" is not an arrow, so it cannot be stretched, turned, bent or fastened to anything.`;
    }
    return '';
  }
}

/**
 * A placed arrow: a line (or block arrow) between two ends. It can be stretched and turned, so it knows where its ends are, and each end can be
 * fastened to a connection point of a placed figure. It follows a figure it is fastened to.
 */
export class PlacedArrow extends PlacedBase {
  /** how long it is: stretched, or as long as the object */
  get length(): number {
    return this.data.length ?? this.object.width;
  }

  /** its angle in radians: 0 along the x axis to the right, positive clockwise on the screen */
  get angle(): number {
    return this.data.angle ?? 0;
  }

  /** how far the middle of its curve is from the middle of the straight line between its ends, to the side (positive: the side of its first width handle); 0: straight */
  get bend(): number {
    return this.data.bend ?? 0;
  }

  /** how far its curve is from the straight line a quarter of the way from its start: what was set, else three quarters of the middle bend (a plain bend) */
  get bendStart(): number {
    return this.data.bendStart ?? 0.75 * this.bend;
  }

  /** how far its curve is from the straight line a quarter of the way from its end */
  get bendEnd(): number {
    return this.data.bendEnd ?? 0.75 * this.bend;
  }

  /** the three bends, from its start to its end: the points you drag to shape the curve */
  get bends(): [number, number, number] {
    return [this.bendStart, this.bend, this.bendEnd];
  }

  /** it has been bent: it follows a curve, not the straight line */
  private get isBent(): boolean {
    return this.data.bend !== undefined || this.data.bendStart !== undefined || this.data.bendEnd !== undefined;
  }

  private get stretchedOrTurned(): boolean {
    return this.data.length !== undefined || this.data.angle !== undefined || this.isBent;
  }

  /** the direction across its straight line, of length 1 (down for an arrow that points right) */
  private get sideDirection(): Point {
    return { x: -Math.sin(this.angle), y: Math.cos(this.angle) };
  }

  /** how far a point is from its straight line, to the side (positive on the side of its first width handle) */
  sidewaysOf(point: Point): number {
    const n = this.sideDirection;
    return (point.x - this.centerX) * n.x + (point.y - this.centerY) * n.y;
  }

  /** the points of its curve: its start, the three points that shape it (a quarter, half and three quarters of the way, `bends` to the side) and its end */
  private curvePoints(): Point[] {
    const { start, end } = this.ends();
    const n = this.sideDirection;
    const shaping = this.bends.map((bend, i) => {
      const along = (i + 1) / 4;
      return { x: start.x + (end.x - start.x) * along + n.x * bend, y: start.y + (end.y - start.y) * along + n.y * bend };
    });
    return [start, ...shaping, end];
  }

  /** the curve it follows from its start to its end: straight when it is not bent */
  curve(): SmoothCurve {
    return new SmoothCurve(this.curvePoints());
  }

  /** the three points of its curve that are dragged to shape it, from its start to its end (the middle one is half way along) */
  shapePoints(): [Point, Point, Point] {
    const [, a, b, c] = this.curvePoints();
    return [a, b, c];
  }

  /** the middle of its curve: the third point of the arrow, between its two ends */
  middle(): Point {
    return this.shapePoints()[1];
  }

  /** the same arrow bent so that its middle is this far from the straight line (a bend of a few pixels is straight) */
  withBend(bend: number): PlacedArrow {
    return this.withBends({ middle: bend });
  }

  /**
   * The same arrow with some of its three bends changed (the others stay as they are), each in pixels to the side of the straight line, to the nearest
   * half pixel and within what can be. When all three are a few pixels or less it is straight, and no field is kept.
   * Only the middle changed on an arrow whose other two are not set: they keep following it (three quarters of it).
   */
  withBends(change: { start?: number; middle?: number; end?: number }): PlacedArrow {
    const { bend: _bend, bendStart: _start, bendEnd: _end, ...rest } = this.data;
    const clean = (v: number) => Math.max(-MAX_BEND, Math.min(MAX_BEND, Math.round(v * 2) / 2));
    const middle = clean(change.middle ?? this.bend);
    const shaped = change.start !== undefined || change.end !== undefined;
    const start = change.start !== undefined ? clean(change.start) : shaped ? this.bendStart : this.data.bendStart;
    const end = change.end !== undefined ? clean(change.end) : shaped ? this.bendEnd : this.data.bendEnd;
    const all = [middle, start ?? 0.75 * middle, end ?? 0.75 * middle];
    if (all.every((v) => Math.abs(v) <= STRAIGHT_BEND_PX)) return new PlacedArrow(rest);
    return new PlacedArrow({ ...rest, bend: middle, ...(start !== undefined ? { bendStart: start } : {}), ...(end !== undefined ? { bendEnd: end } : {}) });
  }

  /** where its two ends are, in pixels of the canvas area: half its length from its centre each way along its angle */
  ends(): { start: Point; end: Point } {
    const half = this.length / 2;
    const dx = Math.cos(this.angle) * half;
    const dy = Math.sin(this.angle) * half;
    return { start: { x: this.centerX - dx, y: this.centerY - dy }, end: { x: this.centerX + dx, y: this.centerY + dy } };
  }

  endPoint(id: EndId): Point {
    return this.ends()[id];
  }

  points(): PlacedPoint[] {
    const ends = this.ends();
    const roles = this.model.connectionPoints();
    return [
      { id: 'start', ...(roles[0].role ? { role: roles[0].role } : {}), ...ends.start },
      { id: 'end', ...(roles[1].role ? { role: roles[1].role } : {}), ...ends.end },
    ];
  }

  /** the arrow it is a copy of: it knows how to change its width across */
  get arrowModel(): CanvasArrow {
    return this.model as CanvasArrow;
  }

  /** where its handle for the width across is, on one side of its line (1 or -1), `offset` pixels outside its edge, in pixels of the canvas */
  acrossHandle(side: 1 | -1, offset: number): Point {
    const reach = (this.object.height / 2 + offset) * side;
    const m = this.middle();
    return { x: m.x - Math.sin(this.angle) * reach, y: m.y + Math.cos(this.angle) * reach };
  }

  /** the width across that puts the handle of this side (`offset` pixels outside the edge) at this point: twice the distance of the point from the middle of its curve */
  acrossAt(point: Point, side: 1 | -1, offset: number): number {
    return 2 * ((this.sidewaysOf(point) - this.bend) * side - offset);
  }

  /** the same arrow with this width across (see `CanvasArrow.withAcross`) */
  withAcross(size: number): PlacedArrow {
    return new PlacedArrow({ ...this.data, object: this.arrowModel.withAcross(size) });
  }

  /** inside the canvas: by its box, or when it is stretched, turned or bent, by its ends (and its curve when it is bent) */
  fits(width: number, height: number): boolean {
    if (this.stretchedOrTurned) {
      const points = this.isBent ? this.curve().sample(16) : [this.ends().start, this.ends().end];
      return points.every((e) => e.x >= 0 && e.x <= width && e.y >= 0 && e.y <= height);
    }
    const left = this.centerX - this.object.width / 2;
    const top = this.centerY - this.object.height / 2;
    return left >= 0 && top >= 0 && left + this.object.width <= width && top + this.object.height <= height;
  }

  /** the same arrow (as long and as turned, and as fastened) with its centre somewhere else */
  at(centerX: number, centerY: number): PlacedArrow {
    return new PlacedArrow({ ...this.data, centerX, centerY });
  }

  connection(id: EndId): PlacedConnection | undefined {
    return this.data.connections?.[id];
  }

  /** the same arrow fastened like this (nothing: both ends free) */
  withConnections(connections?: PlacedConnections): PlacedArrow {
    const { connections: _old, ...rest } = this.data;
    return new PlacedArrow(connections && Object.keys(connections).length ? { ...rest, connections } : rest);
  }

  /** the arrow that goes from `start` to `end` (at least 1 pixel long; with no distance between the ends it keeps its angle), fastened as it was */
  withEnds(start: Point, end: Point): PlacedArrow {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    return new PlacedArrow({
      ...this.data,
      centerX: (start.x + end.x) / 2,
      centerY: (start.y + end.y) / 2,
      length: Math.max(1, distance),
      angle: distance < 1e-9 ? this.angle : Math.atan2(dy, dx),
    });
  }

  /** the arrow with one end moved to the point and the other end staying where it is */
  withEnd(id: EndId, point: Point): PlacedArrow {
    const ends = this.ends();
    return id === 'start' ? this.withEnds(point, ends.end) : this.withEnds(ends.start, point);
  }

  /** The arrow, if it is fastened to this figure: the ends that are fastened go to the points of the figure, wherever the figure is now. Else the arrow itself. */
  following(figure: PlacedFigure): PlacedArrow {
    const ends = this.ends();
    let start = ends.start;
    let end = ends.end;
    let follows = false;
    for (const id of ['start', 'end'] as const) {
      const to = this.connection(id);
      if (to?.objectId !== figure.id) continue;
      const point = figure.pointNamed(to.pointId);
      if (!point) continue;
      if (id === 'start') start = point;
      else end = point;
      follows = true;
    }
    return follows ? this.withEnds(start, end) : this;
  }

  /** its two ends are the corners of its bounds, and its curve when it is bent */
  bounds(): Box {
    if (this.isBent) return this.curve().bounds();
    const { start, end } = this.ends();
    return { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  }

  /** The arrow scaled: its ends move as the points do (it is stretched and turned), and it scales its own thickness (see `CanvasArrow.scaledSettings`). */
  scaledAbout(anchor: Point, scaleX: number, scaleY: number, canvasWidth: number, canvasHeight: number): PlacedArrow {
    const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);
    const moved = (p: Point): Point => ({ x: clamp(anchor.x + (p.x - anchor.x) * scaleX, canvasWidth), y: clamp(anchor.y + (p.y - anchor.y) * scaleY, canvasHeight) });
    const { start, end } = this.ends();
    const stretched = this.withEnds(moved(start), moved(end)).data;
    const factor = this.model.evenScale(scaleX, scaleY); // the curve scales like the thickness
    const bends = (['bend', 'bendStart', 'bendEnd'] as const).flatMap((key) => (this.data[key] === undefined ? [] : [[key, (this.data[key] as number) * factor] as const]));
    return new PlacedArrow({ ...stretched, ...Object.fromEntries(bends), object: this.model.scaledSettings(scaleX, scaleY) });
  }

  /** The arrow with the ends that are fastened on the points of their figures, wherever those figures are now; the other ends stay. */
  settledOn(byId: ReadonlyMap<string, PlacedBase>): PlacedArrow {
    const ends = this.ends();
    let start = ends.start;
    let end = ends.end;
    let settled = false;
    for (const id of ['start', 'end'] as const) {
      const to = this.connection(id);
      const target = to ? byId.get(to.objectId) : undefined;
      const point = to && target instanceof PlacedFigure ? target.pointNamed(to.pointId) : undefined;
      if (!point) continue;
      if (id === 'start') start = point;
      else end = point;
      settled = true;
    }
    return settled ? this.withEnds(start, end) : this;
  }

  /** the arrow, with its ends let go of this figure (it stays where it is) */
  releasedFrom(figureId: string): PlacedArrow {
    const c = this.data.connections;
    if (!c) return this;
    const kept: PlacedConnections = {};
    if (c.start && c.start.objectId !== figureId) kept.start = c.start;
    if (c.end && c.end.objectId !== figureId) kept.end = c.end;
    return Object.keys(kept).length === Object.keys(c).length ? this : this.withConnections(kept);
  }

  protected override ownError(): string {
    const { length, angle } = this.data;
    if (length !== undefined && (typeof length !== 'number' || !Number.isFinite(length) || length < 1 || length > 2 * OBJECT_MAX_SIDE)) {
      return 'A placed arrow has a bad length.';
    }
    if (angle !== undefined && (typeof angle !== 'number' || !Number.isFinite(angle))) return 'A placed arrow has a bad angle.';
    for (const bend of [this.data.bend, this.data.bendStart, this.data.bendEnd]) {
      if (bend !== undefined && (typeof bend !== 'number' || !Number.isFinite(bend) || Math.abs(bend) > MAX_BEND)) return 'A placed arrow has a bad bend.';
    }
    return '';
  }

  /** The reason its connections are not allowed: to points of placed figures, where its ends are. */
  connectionsError(byId: ReadonlyMap<string, PlacedBase>): string {
    const connections = this.data.connections as Record<string, PlacedConnection | undefined> | null | undefined;
    if (connections === undefined) return '';
    if (!connections || typeof connections !== 'object' || Object.keys(connections).some((key) => key !== 'start' && key !== 'end')) {
      return 'The connections of an arrow are a start and an end.';
    }
    for (const [end, ref] of Object.entries(connections)) {
      if (!ref || typeof ref.objectId !== 'string' || typeof ref.pointId !== 'string') return 'A connection needs the figure and its point.';
      const target = byId.get(ref.objectId);
      if (!(target instanceof PlacedFigure)) return 'An arrow can only be fastened to a placed figure.';
      const point = target.pointNamed(ref.pointId);
      if (!point) return `"${target.object.name}" has no connection point "${ref.pointId}".`;
      const own = this.endPoint(end as EndId);
      if (Math.hypot(own.x - point.x, own.y - point.y) > CONNECTION_TOLERANCE_PX) return `The ${end} of "${this.object.name}" is not at the point it is fastened to.`;
    }
    return '';
  }
}
