import { CanvasObjectInput } from './canvas-object';
import { Box, Point, ResizeHandle, resizeAnchor, resizedBox } from './geometry';
import {
  CANVAS_LAYER,
  CONNECTION_TOLERANCE_PX,
  DEFAULT_LAYER,
  EndId,
  MAX_LAYER,
  PlacedArrow,
  PlacedBase,
  PlacedConnections,
  PiecePlace,
  PlacedFigure,
  PlacedObject,
  PlacedPoint,
} from './placed';

// What the objects placed on a canvas do together: snap to each other, follow each other, resize as a group.

/** The most objects that can be placed on one canvas. */
export const CANVAS_MAX_PLACED = 500;
/** How near (in pixels) an end of an arrow and a connection point of a figure have to come to snap together. */
export const SNAP_DISTANCE_PX = 24;
/** How near (in pixels) to an end of an arrow it is grabbed to move that end alone (at most a quarter of the arrow's length). */
export const HANDLE_RADIUS_PX = 12;
/** A jigsaw piece is moved in steps this many times smaller than the grid (it does not stick to the grid points), made a whole number of half pixels (a place is a whole or a half pixel), and not finer than a half pixel. */
export const PIECE_STEP_DIVISOR = 50;
export const PIECE_MIN_STEP_PX = 0.5;
/** Two pieces stick together when they are this close (pixels) to where they belong in relation to each other (places are whole or half pixels, so it is exact). */
export const STICK_TOLERANCE_PX = 0.01;
/** Collected pieces lie this far (as a share of the size of a piece) from the top and the sides of the frame, and this far from each other: close, with room for the tabs. */
export const COLLECT_MARGIN = 0.35;
export const COLLECT_GAP = 0.3;
/** With a `random` for `collectPieces`, each piece is put up to this share of its size further along and further down than the tidy place: the pieces lie more as they would by hand. */
export const COLLECT_SCATTER = 0.3;
/** The pieces beside a piece in the picture: left, right, above, below, as [columns, rows]. */
const PIECE_NEIGHBOURS: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** One end of a placed arrow that is fastened to one point of a placed figure. */
export interface Fastening {
  arrowId: string;
  endId: EndId;
  pointId: string;
}

/** A connection point of a placed figure, with the figure it is of. */
export interface FigurePoint extends PlacedPoint {
  /** the id of the placed figure */
  objectId: string;
}

/** A free end of a placed arrow. */
export interface FreeEnd extends Point {
  arrowId: string;
  endId: EndId;
}

const compareFastenings = (a: Fastening, b: Fastening): number => (a.arrowId + a.endId + a.pointId).localeCompare(b.arrowId + b.endId + b.pointId);

/**
 * The objects placed on a canvas area, and what they do together: figures and arrows snap to each other, an arrow follows the figures it is
 * fastened to, one end of an arrow can be moved while the other stays. It never changes: every change gives a new diagram, or this one when
 * nothing changed.
 */
export class CanvasDiagram {
  private constructor(
    readonly items: readonly PlacedBase[],
    readonly width: number,
    readonly height: number,
  ) {}

  static from(data: readonly PlacedObject[], width: number, height: number): CanvasDiagram {
    return new CanvasDiagram(data.map((d) => PlacedBase.of(d)), width, height);
  }

  /** The reason these placed objects (as they come from outside, not checked yet) are not allowed on a canvas of this size, or '' when they are fine. */
  static validate(placed: unknown, width: number, height: number): string {
    if (!Array.isArray(placed)) return 'The placed objects must be a list.';
    if (placed.length > CANVAS_MAX_PLACED) return `At most ${CANVAS_MAX_PLACED} objects can be placed on a canvas.`;
    const ids = new Set<string>();
    const items: PlacedBase[] = [];
    for (const raw of placed as Partial<PlacedObject>[]) {
      if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 60 || ids.has(raw.id)) return 'A placed object has a bad or repeated id.';
      ids.add(raw.id);
      const item = PlacedBase.of(raw as PlacedObject);
      const error = item.error(width, height);
      if (error) return error;
      items.push(item);
    }
    const byId = new Map(items.map((p) => [p.id, p]));
    for (const item of items) {
      if (item instanceof PlacedArrow) {
        const error = item.connectionsError(byId);
        if (error) return error;
      }
    }
    return '';
  }

  toData(): PlacedObject[] {
    return this.items.map((p) => p.data);
  }

  get(id: string): PlacedBase | undefined {
    return this.items.find((p) => p.id === id);
  }

  private figures(): PlacedFigure[] {
    return this.items.filter((p): p is PlacedFigure => p instanceof PlacedFigure);
  }

  private arrows(): PlacedArrow[] {
    return this.items.filter((p): p is PlacedArrow => p instanceof PlacedArrow);
  }

  private with(items: readonly PlacedBase[]): CanvasDiagram {
    return new CanvasDiagram(items, this.width, this.height);
  }

  private replace(item: PlacedBase): CanvasDiagram {
    return this.with(this.items.map((p) => (p.id === item.id ? item : p)));
  }

  /** The last layer: the highest layer an object is on, or DEFAULT_LAYER when there is no object. A new object goes on it. */
  lastLayer(): number {
    return this.items.reduce((last, p) => Math.max(last, p.layer), this.items.length ? CANVAS_LAYER + 1 : DEFAULT_LAYER);
  }

  /** The layers, from the lowest: the canvas (layer 0) is always one, then every layer an object is on. */
  layers(): number[] {
    return [CANVAS_LAYER, ...new Set(this.items.map((p) => p.layer))].sort((a, b) => a - b);
  }

  /** The diagram with these objects on this layer (from 1 to MAX_LAYER: nothing goes on the canvas layer). */
  setLayer(ids: readonly string[], layer: number): CanvasDiagram {
    const next = Math.min(MAX_LAYER, Math.max(CANVAS_LAYER + 1, Math.round(layer)));
    if (!this.items.some((p) => ids.includes(p.id) && p.layer !== next)) return this;
    return this.with(this.items.map((p) => (ids.includes(p.id) ? p.withLayer(next) : p)));
  }

  /** where the connection points of the placed figures are */
  figurePoints(): FigurePoint[] {
    return this.figures().flatMap((f) => f.points().map((p) => ({ ...p, objectId: f.id })));
  }

  /** the ends of the placed arrows that are free (not fastened to a figure) */
  freeEnds(): FreeEnd[] {
    return this.arrows().flatMap((a) =>
      a
        .points()
        .filter((p) => !a.connection(p.id as EndId))
        .map((p) => ({ arrowId: a.id, endId: p.id as EndId, x: p.x, y: p.y })),
    );
  }

  /** for each placed object, the ids of its connection points that something is fastened to: the points of a figure that arrows end in, and the ends of an arrow that are fastened */
  boundPoints(): Map<string, string[]> {
    const bound = new Map<string, string[]>();
    const add = (objectId: string, pointId: string) => bound.set(objectId, [...(bound.get(objectId) ?? []), pointId]);
    for (const arrow of this.arrows()) {
      for (const id of ['start', 'end'] as const) {
        const to = arrow.connection(id);
        if (!to) continue;
        add(arrow.id, id);
        add(to.objectId, to.pointId);
      }
    }
    return bound;
  }

  /**
   * The centre on one axis: the nearest grid point to `wanted` (every `step` pixels, from `origin`: 0, or half a step for a grid whose points are half a step in from the edge), with the whole object inside the canvas,
   * that is the centre between half the size and the canvas size minus half the size. When no grid point is in that range
   * (an object nearly as big as the canvas) the centre is held at the range instead.
   */
  private static stickCenter(wanted: number, size: number, canvasSize: number, step: number, origin = 0): number {
    const low = size / 2;
    const high = canvasSize - size / 2;
    let center = origin + Math.round((wanted - origin) / step) * step;
    if (center < low) center = origin + Math.ceil((low - origin) / step) * step;
    if (center > high) center = origin + Math.floor((high - origin) / step) * step;
    if (center < low || center > high) center = Math.round(Math.min(Math.max(wanted, low), high) * 2) / 2;
    return center;
  }

  /**
   * An arrow (as long and as turned as it is) with its centre at (wantedX, wantedY), moved so that its end nearest to a connection point of a figure
   * is on that point, when that end is within SNAP_DISTANCE_PX of it (and the arrow still fits in the canvas). Every end that is then on a point is
   * fastened to it. Null when no end is near a point: the arrow is free.
   */
  private snapArrow(arrow: PlacedArrow, wantedX: number, wantedY: number): PlacedArrow | null {
    const targets = this.figurePoints();
    let best: { dx: number; dy: number; distance: number } | null = null;
    for (const end of arrow.at(wantedX, wantedY).points()) {
      for (const target of targets) {
        const distance = Math.hypot(target.x - end.x, target.y - end.y);
        if (distance <= SNAP_DISTANCE_PX && (!best || distance < best.distance)) best = { dx: target.x - end.x, dy: target.y - end.y, distance };
      }
    }
    if (!best) return null;
    // the arrow goes exactly where its end is on the point (not rounded to a half pixel): 0 pixels apart
    const moved = arrow.at(wantedX + best.dx, wantedY + best.dy);
    if (!moved.fits(this.width, this.height)) return null; // it would go out of the canvas
    const connections: PlacedConnections = {};
    for (const end of moved.points()) {
      const target = targets.find((t) => Math.hypot(t.x - end.x, t.y - end.y) <= CONNECTION_TOLERANCE_PX);
      if (target) connections[end.id as EndId] = { objectId: target.objectId, pointId: target.id };
    }
    return moved.withConnections(connections);
  }

  /**
   * A figure with its centre at (wantedX, wantedY), moved so that its connection point nearest to a free end of an arrow is exactly on that end,
   * when it is within SNAP_DISTANCE_PX of it (and the figure still fits in the canvas), with the ends that are then on one of its points. Null when
   * no point is near a free end: the figure is free.
   */
  private snapFigure(figure: PlacedFigure, wantedX: number, wantedY: number): { figure: PlacedFigure; fastened: Fastening[] } | null {
    const ends = this.freeEnds();
    let best: { dx: number; dy: number; distance: number } | null = null;
    for (const point of figure.at(wantedX, wantedY).points()) {
      for (const end of ends) {
        const distance = Math.hypot(end.x - point.x, end.y - point.y);
        if (distance <= SNAP_DISTANCE_PX && (!best || distance < best.distance)) best = { dx: end.x - point.x, dy: end.y - point.y, distance };
      }
    }
    if (!best) return null;
    const moved = figure.at(wantedX + best.dx, wantedY + best.dy);
    if (!moved.fits(this.width, this.height)) return null; // it would go out of the canvas
    const fastened: Fastening[] = [];
    const used = new Set<string>();
    for (const point of moved.points()) {
      const end = ends.find((e) => !used.has(e.arrowId + e.endId) && Math.hypot(e.x - point.x, e.y - point.y) <= CONNECTION_TOLERANCE_PX);
      if (!end) continue;
      used.add(end.arrowId + end.endId);
      fastened.push({ arrowId: end.arrowId, endId: end.endId, pointId: point.id });
    }
    return { figure: moved, fastened: fastened.sort(compareFastenings) };
  }

  /** the diagram with the arrow ends fastened to the points of the figure */
  private fasten(figureId: string, fastened: Fastening[]): CanvasDiagram {
    if (!fastened.length) return this;
    return this.with(
      this.items.map((p) => {
        if (!(p instanceof PlacedArrow)) return p;
        const mine = fastened.filter((f) => f.arrowId === p.id);
        if (!mine.length) return p;
        const connections: PlacedConnections = { ...p.data.connections };
        for (const f of mine) connections[f.endId] = { objectId: figureId, pointId: f.pointId };
        return p.withConnections(connections);
      }),
    );
  }

  /** the diagram with the arrows that are fastened to the figure following it (the end at the figure moves with it, the other end stays) */
  private arrowsFollow(figure: PlacedFigure): CanvasDiagram {
    return this.with(this.items.map((p) => (p instanceof PlacedArrow ? p.following(figure) : p)));
  }

  /**
   * Puts a copy of a canvas object on the canvas, its centre where it was dropped: on a grid point (every `step` pixels) and inside the canvas; an arrow
   * dropped near a connection point of a figure is fastened to it, a figure dropped near the free end of an arrow is fastened to it.
   * The new diagram and the id of the object, or the reason it cannot be put there.
   */
  place(object: CanvasObjectInput, wantedX: number, wantedY: number, step: number, origin = 0): { diagram: CanvasDiagram; id: string } | { error: string } {
    if (object.width > this.width || object.height > this.height) return { error: `"${object.name}" is bigger than the canvas.` };
    if (this.items.length >= CANVAS_MAX_PLACED) return { error: `At most ${CANVAS_MAX_PLACED} objects fit on a canvas.` };
    const id = crypto.randomUUID();
    const centerX = CanvasDiagram.stickCenter(wantedX, object.width, this.width, step, origin);
    const centerY = CanvasDiagram.stickCenter(wantedY, object.height, this.height, step, origin);
    const item = PlacedBase.of({ id, object, centerX, centerY, layer: this.lastLayer() }); // a new object goes on the last layer
    if (item instanceof PlacedArrow) {
      const snapped = this.snapArrow(item.at(wantedX, wantedY), wantedX, wantedY);
      return { diagram: this.with([...this.items, snapped ?? item]), id };
    }
    const snapped = this.snapFigure(item, wantedX, wantedY);
    const figure = snapped?.figure ?? item;
    return { diagram: this.with([...this.items, figure]).fasten(id, snapped?.fastened ?? []), id };
  }

  /**
   * The diagram with an arrow bent: one of its three shaping points (`which`, the middle by default) is this far from the straight line (see
   * `PlacedArrow.withBends`). Its ends stay, so what it is fastened to does too.
   */
  bendArrow(id: string, bend: number, which: 'start' | 'middle' | 'end' = 'middle'): CanvasDiagram {
    const arrow = this.get(id);
    if (!(arrow instanceof PlacedArrow)) return this;
    const next = arrow.withBends({ [which]: bend });
    return next.bends.every((b, i) => b === arrow.bends[i]) && next.data.bend === arrow.data.bend ? this : this.replace(next);
  }

  /**
   * Collects jigsaw pieces: the pieces of `ids` are put together at the top of `frame` (its left edge, its top and its width, in the pixels the objects
   * are placed in), in rows from the top left, close to each other (`COLLECT_GAP`), the way they were lying: from the top down, and in a row from left
   * to right. The pieces that stick together (see `stuckGroup`) stay as they are in relation to each other and are put as one piece; a group that has a
   * piece that is not in `ids` is not collected (it is not all in the frame). Pieces keep their layers. The same diagram when nothing moves. With `random` (numbers from 0 up to 1) the pieces are put a little more by chance (`COLLECT_SCATTER`), not in tidy rows.
   */
  collectPieces(ids: readonly string[], frame: { left: number; top: number; width: number }, random?: () => number): CanvasDiagram {
    const wanted = new Set(ids);
    const seen = new Set<string>();
    const blocks: { members: PlacedFigure[]; box: Box }[] = [];
    for (const id of ids) {
      const first = this.get(id);
      if (seen.has(id) || !(first instanceof PlacedFigure) || !first.data.piece) continue;
      const group = this.stuckGroup([id]);
      for (const member of group) seen.add(member);
      if (!group.every((member) => wanted.has(member))) continue; // some of the group is somewhere else
      const members = group.map((member) => this.get(member)).filter((m): m is PlacedFigure => m instanceof PlacedFigure);
      const boxes = members.map((m) => m.box());
      const left = Math.min(...boxes.map((b) => b.left));
      const top = Math.min(...boxes.map((b) => b.top));
      blocks.push({ members, box: { left, top, width: Math.max(...boxes.map((b) => b.left + b.width)) - left, height: Math.max(...boxes.map((b) => b.top + b.height)) - top } });
    }
    if (!blocks.length) return this;
    const size = blocks[0].members[0].object.width;
    const margin = Math.round(COLLECT_MARGIN * size);
    const gap = Math.round(COLLECT_GAP * size);
    const rowOf = (b: Box) => Math.round(b.top / size);
    blocks.sort((a, b) => rowOf(a.box) - rowOf(b.box) || a.box.left - b.box.left);

    const moved = new Map<string, PlacedFigure>();
    const right = frame.left + frame.width - margin;
    let x = frame.left + margin;
    let y = frame.top + margin;
    let rowHeight = 0;
    for (const block of blocks) {
      const moreX = random ? Math.round(random() * COLLECT_SCATTER * size) : 0; // a little further along than the tidy place
      const moreY = random ? Math.round(random() * COLLECT_SCATTER * size) : 0; // and a little further down
      if (x > frame.left + margin && x + moreX + block.box.width > right) {
        y += rowHeight + gap + (random ? Math.round(random() * COLLECT_SCATTER * size) : 0); // the row is full: the next one, a different distance away each time
        x = frame.left + margin;
        rowHeight = 0;
      }
      const dx = x + moreX - block.box.left;
      const dy = y + moreY - block.box.top;
      x += moreX + block.box.width + gap;
      rowHeight = Math.max(rowHeight, block.box.height + moreY);
      const placed = block.members.map((m) => m.at(m.centerX + Math.round(dx * 2) / 2, m.centerY + Math.round(dy * 2) / 2));
      if (!placed.every((m) => m.fits(this.width, this.height))) continue; // no room in the area for it: it stays
      for (const m of placed) moved.set(m.id, m);
    }
    const changed = [...moved.values()].some((m) => m.centerX !== this.get(m.id)?.centerX || m.centerY !== this.get(m.id)?.centerY);
    return changed ? this.with(this.items.map((item) => moved.get(item.id) ?? item)) : this;
  }

  /** the jigsaw pieces of the diagram by where they belong in the picture: "column,row" */
  private pieceMap(): Map<string, PlacedFigure> {
    const map = new Map<string, PlacedFigure>();
    for (const item of this.items) if (item instanceof PlacedFigure && item.data.piece) map.set(`${item.data.piece.col},${item.data.piece.row}`, item);
    return map;
  }

  /**
   * Everything that sticks to these objects, and them: two jigsaw pieces stick together when they are neighbours in the picture (next to each other, or one
   * over the other) and lie exactly where they belong in relation to each other, one piece away. A piece that sticks to a piece sticks to what that piece
   * sticks to, so this is a whole group. Nothing is kept of it: it follows from where the pieces are, so a saved jigsaw that is opened has the same groups.
   * An object that is not a piece sticks to nothing and is only itself.
   */
  stuckGroup(ids: readonly string[]): string[] {
    const map = this.pieceMap();
    const group = new Set<string>(ids);
    const queue: PlacedFigure[] = [];
    for (const id of ids) {
      const item = this.get(id);
      if (item instanceof PlacedFigure && item.data.piece) queue.push(item);
    }
    while (queue.length) {
      const p = queue.pop() as PlacedFigure;
      const piece = p.data.piece as PiecePlace;
      const size = p.object.width;
      for (const [dc, dr] of PIECE_NEIGHBOURS) {
        const q = map.get(`${piece.col + dc},${piece.row + dr}`);
        if (!q || group.has(q.id) || q.object.width !== size) continue;
        if (Math.abs(q.centerX - p.centerX - dc * size) <= STICK_TOLERANCE_PX && Math.abs(q.centerY - p.centerY - dr * size) <= STICK_TOLERANCE_PX) {
          group.add(q.id);
          queue.push(q);
        }
      }
    }
    return [...group];
  }

  /**
   * Jigsaw pieces that are dropped: each group of pieces that stick together (see `stuckGroup`) that was dropped clicks into place when it comes close
   * enough, within `range` pixels, of one of two things: its own grid point (the home of a piece in it, see `PlacedFigure.home`), or the place where a
   * piece in it fits a neighbour that is not in the group (so the group sticks to it). The whole group moves by the smallest of these steps, so the
   * piece is exactly there, and the groups that now fit each other stick together. Only pieces are looked at, and only when they are dropped, not while
   * they are moved. `range` 0 (or less) means nothing clicks. Nothing changes (the same diagram) when nothing is near enough.
   */
  dropPieces(ids: readonly string[], range: number): CanvasDiagram {
    if (!(range > 0)) return this;
    let diagram: CanvasDiagram = this;
    const done = new Set<string>();
    for (const id of ids) {
      if (done.has(id)) continue;
      const group = diagram.stuckGroup([id]);
      for (const member of group) done.add(member);
      diagram = diagram.snapGroup(group, range);
    }
    return diagram;
  }

  /** the group moved by the smallest step that puts a piece of it on its own place or exactly beside a neighbour, when that step is at most `range` */
  private snapGroup(group: readonly string[], range: number): CanvasDiagram {
    const inGroup = new Set(group);
    const map = this.pieceMap();
    let best: { dx: number; dy: number; distance: number } | null = null;
    const consider = (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      if (distance <= range && (!best || distance < best.distance - 1e-9)) best = { dx, dy, distance };
    };
    for (const id of group) {
      const p = this.get(id);
      if (!(p instanceof PlacedFigure) || !p.data.piece) continue;
      const home = p.home();
      if (home) consider(home.x - p.centerX, home.y - p.centerY);
      const size = p.object.width;
      for (const [dc, dr] of PIECE_NEIGHBOURS) {
        const q = map.get(`${p.data.piece.col + dc},${p.data.piece.row + dr}`);
        if (!q || inGroup.has(q.id) || q.object.width !== size) continue;
        consider(q.centerX - dc * size - p.centerX, q.centerY - dr * size - p.centerY); // the step that puts p exactly where it fits q
      }
    }
    const step = best as { dx: number; dy: number } | null;
    if (!step) return this;
    // it clicks exactly or not at all: when the area does not have room for the whole step (the group would go outside), it stays where it was dropped
    const moved = this.moveGroup(group, step.dx, step.dy);
    const probe = this.get(group[0]);
    const now = moved.get(group[0]);
    if (!probe || !now) return this;
    const wantedX = probe.centerX + Math.round(step.dx * 2) / 2;
    const wantedY = probe.centerY + Math.round(step.dy * 2) / 2;
    return Math.abs(now.centerX - wantedX) < 1e-9 && Math.abs(now.centerY - wantedY) < 1e-9 ? moved : this;
  }

  /**
   * The diagram with these figures moved together by this much (to the nearest half pixel), as far as all of them stay inside the area: they keep their
   * places in relation to each other. Only figures move (a piece is one); nothing changes when they cannot move, or the move is nothing.
   */
  moveGroup(ids: readonly string[], dx: number, dy: number): CanvasDiagram {
    const figures = ids.map((id) => this.get(id)).filter((p): p is PlacedFigure => p instanceof PlacedFigure);
    if (!figures.length || !Number.isFinite(dx) || !Number.isFinite(dy)) return this;
    const boxes = figures.map((f) => f.box());
    // the furthest the whole group can go each way: the figure that is nearest to an edge decides
    const lowX = Math.max(...boxes.map((b) => -b.left));
    const highX = Math.min(...boxes.map((b) => this.width - (b.left + b.width)));
    const lowY = Math.max(...boxes.map((b) => -b.top));
    const highY = Math.min(...boxes.map((b) => this.height - (b.top + b.height)));
    const moveX = Math.min(Math.max(Math.round(dx * 2) / 2, lowX), highX);
    const moveY = Math.min(Math.max(Math.round(dy * 2) / 2, lowY), highY);
    if (!moveX && !moveY) return this;
    const moved = new Map(figures.map((f) => [f.id, f.at(f.centerX + moveX, f.centerY + moveY)] as const));
    return this.with(this.items.map((item) => moved.get(item.id) ?? item));
  }

  /** The diagram with an object on a layer above all the others (the highest layer there is, at most): it is in front of them. Nothing changes when it is in front already. */
  bringToFront(id: string): CanvasDiagram {
    const item = this.get(id);
    if (!item) return this;
    const top = Math.max(0, ...this.items.filter((i) => i.id !== id).map((i) => i.layer));
    if (item.layer > top) return this;
    return this.setLayer([id], Math.min(MAX_LAYER, top + 1));
  }

  /** The diagram with the width across of an arrow changed (see `CanvasArrow.withAcross`): its ends stay where they are, so what it is fastened to does too. */
  resizeArrowAcross(id: string, size: number): CanvasDiagram {
    const arrow = this.get(id);
    if (!(arrow instanceof PlacedArrow)) return this;
    const next = arrow.withAcross(size);
    if (next.object.height === arrow.object.height && next.object.borderWidth === arrow.object.borderWidth) return this;
    return this.replace(next);
  }

  /**
   * Resizes a figure by dragging one of its handles to (x, y) (see `PlacedFigure.resized`). The arrows that are fastened to it follow its points,
   * the other ends of those arrows stay.
   */
  resizeFigure(id: string, handle: ResizeHandle, x: number, y: number, step: number): CanvasDiagram {
    const figure = this.get(id);
    if (!(figure instanceof PlacedFigure)) return this;
    const resized = figure.resized(handle, x, y, step, this.width, this.height);
    const a = figure.data;
    const b = resized.data;
    if (a.centerX === b.centerX && a.centerY === b.centerY && a.object.width === b.object.width && a.object.height === b.object.height) return this;
    return this.replace(resized).arrowsFollow(resized);
  }

  /** The diagram without these objects; the arrows that were fastened to them are free again (and stay where they are). */
  removeAll(ids: readonly string[]): CanvasDiagram {
    return this.with(
      this.items
        .filter((p) => !ids.includes(p.id))
        .map((p) => ids.reduce<PlacedBase>((arrow, id) => (arrow instanceof PlacedArrow ? arrow.releasedFrom(id) : arrow), p)),
    );
  }

  /** The diagram without this object; the arrows that were fastened to it are free again (and stay where they are). */
  remove(id: string): CanvasDiagram {
    return this.removeAll([id]);
  }

  /** The smallest box that holds these objects (an arrow: its two ends), or null when none of them is here. */
  boundsOf(ids: readonly string[]): Box | null {
    const boxes = this.items.filter((p) => ids.includes(p.id)).map((p) => p.bounds());
    if (!boxes.length) return null;
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    return {
      left,
      top,
      width: Math.max(...boxes.map((b) => b.left + b.width)) - left,
      height: Math.max(...boxes.map((b) => b.top + b.height)) - top,
    };
  }

  /** The ids of the objects that a rectangle touches (a thin arrow is touched a few pixels around its line). */
  itemsIn(box: Box): string[] {
    const reach = 4;
    return this.items
      .filter((p) => {
        const b = p.bounds();
        const pad = p instanceof PlacedArrow ? reach : 0;
        return b.left - pad <= box.left + box.width && b.left + b.width + pad >= box.left && b.top - pad <= box.top + box.height && b.top + b.height + pad >= box.top;
      })
      .map((p) => p.id);
  }

  /**
   * Resizes several objects together by dragging a handle of the box around them to (x, y) (see `resizedBox`): the sizes and the positions of the
   * objects are scaled by what the box is scaled, about the edge that stays. How the size of an object scales is for the object to say (a square
   * and a circle stay equal-sided, an arrow is stretched by its ends and its thickness scales; see `scaledSettings`), and how small it can get
   * (`minScale`). The ends of arrows that are fastened stay on the points of their figures.
   */
  resizeGroup(ids: readonly string[], handle: ResizeHandle, x: number, y: number, step: number): CanvasDiagram {
    const picked = this.items.filter((p) => ids.includes(p.id));
    const was = this.boundsOf(ids);
    if (picked.length < 2 || !was) return this;
    const now = resizedBox(was, handle, x, y, step, this.width, this.height, false);
    // the factors along each axis (an axis the handle does not move, or along which the objects have no extent, is not scaled)
    let scaleX = (handle.includes('e') || handle.includes('w')) && was.width > 0 ? now.width / was.width : 1;
    let scaleY = (handle.includes('n') || handle.includes('s')) && was.height > 0 ? now.height / was.height : 1;
    for (const item of picked) {
      const least = item.model.minScale(); // no object is made smaller than it can be
      scaleX = Math.max(scaleX, least.x);
      scaleY = Math.max(scaleY, least.y);
    }
    const anchor = resizeAnchor(was, handle);
    const scaled = this.with(this.items.map((p) => (picked.includes(p) ? p.scaledAbout(anchor, scaleX, scaleY, this.width, this.height) : p)));
    const byId = new Map(scaled.items.map((p) => [p.id, p]));
    const next = scaled.with(scaled.items.map((p) => (p instanceof PlacedArrow ? p.settledOn(byId) : p)));
    return JSON.stringify(next.toData()) === JSON.stringify(this.toData()) ? this : next;
  }

  /**
   * Moves a figure so its centre is at (wantedX, wantedY): on a grid point, inside the canvas. Near a free end of an arrow it snaps so one of its
   * points is on that end, and is fastened to it. The arrows that are fastened to it follow, the other ends of those arrows stay.
   */
  moveFigure(id: string, wantedX: number, wantedY: number, step: number, origin = 0): CanvasDiagram {
    const figure = this.get(id);
    if (!(figure instanceof PlacedFigure)) return this;
    // a piece moves in much finer steps than the grid (a step that goes a whole number of times into the grid, so the grid points are still among them)
    const pieceStep = figure.data.piece ? Math.max(PIECE_MIN_STEP_PX, Math.round(step / PIECE_STEP_DIVISOR / PIECE_MIN_STEP_PX) * PIECE_MIN_STEP_PX) : step;
    let moved = figure.at(
      CanvasDiagram.stickCenter(wantedX, figure.object.width, this.width, pieceStep, origin),
      CanvasDiagram.stickCenter(wantedY, figure.object.height, this.height, pieceStep, origin),
    );
    let fastened: Fastening[] = [];
    const snapped = this.snapFigure(figure, wantedX, wantedY);
    if (snapped) ({ figure: moved, fastened } = snapped);
    if (moved.centerX === figure.centerX && moved.centerY === figure.centerY && !fastened.length) return this;
    return this.replace(moved).arrowsFollow(moved).fasten(id, fastened);
  }

  /**
   * Moves a whole arrow (as long and as turned as it is) so its centre is at (wantedX, wantedY). An end near a connection point of a figure snaps
   * to it (this beats the grid) and is fastened; an arrow that is moved away is free again.
   */
  moveArrow(id: string, wantedX: number, wantedY: number, step: number, origin = 0): CanvasDiagram {
    const arrow = this.get(id);
    if (!(arrow instanceof PlacedArrow)) return this;
    const next =
      this.snapArrow(arrow, wantedX, wantedY) ??
      arrow
        .at(
          CanvasDiagram.stickCenter(wantedX, arrow.object.width, this.width, step, origin),
          CanvasDiagram.stickCenter(wantedY, arrow.object.height, this.height, step, origin),
        )
        .withConnections(undefined);
    if (!next.fits(this.width, this.height)) return this; // a stretched or turned arrow has to stay in the canvas
    if (next.centerX === arrow.centerX && next.centerY === arrow.centerY && JSON.stringify(next.data.connections) === JSON.stringify(arrow.data.connections)) return this;
    return this.replace(next);
  }

  /**
   * Moves one end of an arrow to (wantedX, wantedY) while the other end stays where it is: the arrow is stretched and turned. The end snaps to a
   * connection point of a figure within SNAP_DISTANCE_PX (and is fastened to it), else to a grid point; it stays in the canvas. An end that is moved
   * off the point it was fastened to is free.
   */
  moveArrowEnd(id: string, endId: EndId, wantedX: number, wantedY: number, step: number, origin = 0): CanvasDiagram {
    const arrow = this.get(id);
    if (!(arrow instanceof PlacedArrow)) return this;
    let nearest: { target: FigurePoint; distance: number } | null = null;
    for (const target of this.figurePoints()) {
      const distance = Math.hypot(target.x - wantedX, target.y - wantedY);
      if (distance <= SNAP_DISTANCE_PX && (!nearest || distance < nearest.distance)) nearest = { target, distance };
    }
    const clamp = (value: number, max: number) => Math.min(Math.max(0, value), max);
    const point = nearest
      ? { x: nearest.target.x, y: nearest.target.y }
      : { x: clamp(origin + Math.round((wantedX - origin) / step) * step, this.width), y: clamp(origin + Math.round((wantedY - origin) / step) * step, this.height) };
    const connections: PlacedConnections = { ...arrow.data.connections };
    if (nearest) connections[endId] = { objectId: nearest.target.objectId, pointId: nearest.target.id };
    else delete connections[endId];
    const next = arrow.withEnd(endId, point).withConnections(connections);
    // nothing changes when both ends are where they were and fastened as they were
    const [was, now] = [arrow.ends(), next.ends()];
    const same = (p: Point, q: Point) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9;
    if (same(was.start, now.start) && same(was.end, now.end) && JSON.stringify(next.data.connections ?? {}) === JSON.stringify(arrow.data.connections ?? {})) return this;
    return this.replace(next);
  }

  /** The end of an arrow that a pointer at (x, y) has grabbed, when it is near one (within HANDLE_RADIUS_PX, and at most a quarter of the arrow's length). */
  grabbedEnd(id: string, x: number, y: number): EndId | undefined {
    const arrow = this.get(id);
    if (!(arrow instanceof PlacedArrow)) return undefined;
    const { start, end } = arrow.ends();
    const toStart = Math.hypot(x - start.x, y - start.y);
    const toEnd = Math.hypot(x - end.x, y - end.y);
    if (Math.min(toStart, toEnd) > Math.min(HANDLE_RADIUS_PX, arrow.length / 4)) return undefined;
    return toStart <= toEnd ? 'start' : 'end';
  }
}
