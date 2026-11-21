import { Box } from './geometry';
import { PICTURE_LAYER, MAX_LAYER, PiecePlace, PlacedFigure, PlacedObject } from './placed';

// What the objects placed on a picture area (the jigsaw pieces) do together: stick together, are collected, and are moved as a group.

/** The most objects that can be placed on one picture area. */
export const JIGSAW_MAX_PLACED = 500;
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

/**
 * The objects placed on a picture area (the jigsaw pieces), and what they do together: pieces stick together and click into place, are collected and are
 * moved as a group. It never changes: every change gives a new puzzle, or this one when nothing changed.
 */
export class Puzzle {
  private constructor(
    readonly items: readonly PlacedFigure[],
    readonly width: number,
    readonly height: number,
  ) {}

  static from(data: readonly PlacedObject[], width: number, height: number): Puzzle {
    return new Puzzle(data.map((d) => new PlacedFigure(d)), width, height);
  }

  /** The reason these placed objects (as they come from outside, not checked yet) are not allowed on a picture area of this size, or '' when they are fine. */
  static validate(placed: unknown, width: number, height: number): string {
    if (!Array.isArray(placed)) return 'The placed objects must be a list.';
    if (placed.length > JIGSAW_MAX_PLACED) return `At most ${JIGSAW_MAX_PLACED} objects can be placed on a picture area.`;
    const ids = new Set<string>();
    for (const raw of placed as Partial<PlacedObject>[]) {
      if (!raw || typeof raw.id !== 'string' || !raw.id || raw.id.length > 60 || ids.has(raw.id)) return 'A placed object has a bad or repeated id.';
      ids.add(raw.id);
      const error = new PlacedFigure(raw as PlacedObject).error(width, height);
      if (error) return error;
    }
    return '';
  }

  toData(): PlacedObject[] {
    return this.items.map((p) => p.data);
  }

  get(id: string): PlacedFigure | undefined {
    return this.items.find((p) => p.id === id);
  }

  private with(items: readonly PlacedFigure[]): Puzzle {
    return new Puzzle(items, this.width, this.height);
  }

  /** The puzzle with these objects on this layer (from 1 to MAX_LAYER: nothing goes on the picture layer). */
  setLayer(ids: readonly string[], layer: number): Puzzle {
    const next = Math.min(MAX_LAYER, Math.max(PICTURE_LAYER + 1, Math.round(layer)));
    if (!this.items.some((p) => ids.includes(p.id) && p.layer !== next)) return this;
    return this.with(this.items.map((p) => (ids.includes(p.id) ? p.withLayer(next) : p)));
  }

  /**
   * The centre on one axis: the nearest grid point to `wanted` (every `step` pixels, from `origin`: 0, or half a step for a grid whose points are half a step in from the edge), with the whole object inside the picture area,
   * that is the centre between half the size and the picture area size minus half the size. When no grid point is in that range
   * (an object nearly as big as the picture area) the centre is held at the range instead.
   */
  private static stickCenter(wanted: number, size: number, pictureSize: number, step: number, origin = 0): number {
    const low = size / 2;
    const high = pictureSize - size / 2;
    let center = origin + Math.round((wanted - origin) / step) * step;
    if (center < low) center = origin + Math.ceil((low - origin) / step) * step;
    if (center > high) center = origin + Math.floor((high - origin) / step) * step;
    if (center < low || center > high) center = Math.round(Math.min(Math.max(wanted, low), high) * 2) / 2;
    return center;
  }

  /**
   * Collects jigsaw pieces: the pieces of `ids` are put together at the top of `frame` (its left edge, its top and its width, in the pixels the objects
   * are placed in), in rows from the top left, close to each other (`COLLECT_GAP`), the way they were lying: from the top down, and in a row from left
   * to right. The pieces that stick together (see `stuckGroup`) stay as they are in relation to each other and are put as one piece; a group that has a
   * piece that is not in `ids` is not collected (it is not all in the frame). Pieces keep their layers. The same puzzle when nothing moves. With `random` (numbers from 0 up to 1) the pieces are put a little more by chance (`COLLECT_SCATTER`), not in tidy rows.
   */
  collectPieces(ids: readonly string[], frame: { left: number; top: number; width: number }, random?: () => number): Puzzle {
    const wanted = new Set(ids);
    const seen = new Set<string>();
    const blocks: { members: PlacedFigure[]; box: Box }[] = [];
    for (const id of ids) {
      const first = this.get(id);
      if (seen.has(id) || !first?.data.piece) continue;
      const group = this.stuckGroup([id]);
      for (const member of group) seen.add(member);
      if (!group.every((member) => wanted.has(member))) continue; // some of the group is somewhere else
      const members = group.map((member) => this.get(member)).filter((m): m is PlacedFigure => !!m);
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

  /** the jigsaw pieces of the puzzle by where they belong in the picture: "column,row" */
  private pieceMap(): Map<string, PlacedFigure> {
    const map = new Map<string, PlacedFigure>();
    for (const item of this.items) if (item.data.piece) map.set(`${item.data.piece.col},${item.data.piece.row}`, item);
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
      if (item?.data.piece) queue.push(item);
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
   * they are moved. `range` 0 (or less) means nothing clicks. Nothing changes (the same puzzle) when nothing is near enough.
   */
  dropPieces(ids: readonly string[], range: number): Puzzle {
    if (!(range > 0)) return this;
    let puzzle: Puzzle = this;
    const done = new Set<string>();
    for (const id of ids) {
      if (done.has(id)) continue;
      const group = puzzle.stuckGroup([id]);
      for (const member of group) done.add(member);
      puzzle = puzzle.snapGroup(group, range);
    }
    return puzzle;
  }

  /** the group moved by the smallest step that puts a piece of it on its own place or exactly beside a neighbour, when that step is at most `range` */
  private snapGroup(group: readonly string[], range: number): Puzzle {
    const inGroup = new Set(group);
    const map = this.pieceMap();
    let best: { dx: number; dy: number; distance: number } | null = null;
    const consider = (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      if (distance <= range && (!best || distance < best.distance - 1e-9)) best = { dx, dy, distance };
    };
    for (const id of group) {
      const p = this.get(id);
      if (!p?.data.piece) continue;
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
   * The puzzle with these figures moved together by this much (to the nearest half pixel), as far as all of them stay inside the area: they keep their
   * places in relation to each other. Only figures move (a piece is one); nothing changes when they cannot move, or the move is nothing.
   */
  moveGroup(ids: readonly string[], dx: number, dy: number): Puzzle {
    const figures = ids.map((id) => this.get(id)).filter((p): p is PlacedFigure => !!p);
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

  /** The puzzle with an object on a layer above all the others (the highest layer there is, at most): it is in front of them. Nothing changes when it is in front already. */
  bringToFront(id: string): Puzzle {
    const item = this.get(id);
    if (!item) return this;
    const top = Math.max(0, ...this.items.filter((i) => i.id !== id).map((i) => i.layer));
    if (item.layer > top) return this;
    return this.setLayer([id], Math.min(MAX_LAYER, top + 1));
  }

  /** The ids of the objects that a rectangle touches. */
  itemsIn(box: Box): string[] {
    return this.items
      .filter((p) => {
        const b = p.bounds();
        return b.left <= box.left + box.width && b.left + b.width >= box.left && b.top <= box.top + box.height && b.top + b.height >= box.top;
      })
      .map((p) => p.id);
  }

  /**
   * Moves a figure so its centre is at (wantedX, wantedY): on a grid point, inside the picture area. A piece moves in much finer steps than the grid.
   */
  moveFigure(id: string, wantedX: number, wantedY: number, step: number, origin = 0): Puzzle {
    const figure = this.get(id);
    if (!figure) return this;
    // a piece moves in much finer steps than the grid (a step that goes a whole number of times into the grid, so the grid points are still among them)
    const pieceStep = figure.data.piece ? Math.max(PIECE_MIN_STEP_PX, Math.round(step / PIECE_STEP_DIVISOR / PIECE_MIN_STEP_PX) * PIECE_MIN_STEP_PX) : step;
    const moved = figure.at(
      Puzzle.stickCenter(wantedX, figure.object.width, this.width, pieceStep, origin),
      Puzzle.stickCenter(wantedY, figure.object.height, this.height, pieceStep, origin),
    );
    if (moved.centerX === figure.centerX && moved.centerY === figure.centerY) return this;
    return this.with(this.items.map((p) => (p.id === id ? moved : p)));
  }
}
