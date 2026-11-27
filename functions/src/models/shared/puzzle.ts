import { Box } from './geometry';
import { JigsawPieces } from './jigsaw';
import { areaMargin, PICTURE_LAYER, MAX_LAYER, PiecePlace, PlacedFigure, PlacedObject } from './placed';

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
/** The layer the pieces that are fixed are on: the bottom one (the picture area is layer 0). Every piece that is free is above it. */
export const FIXED_LAYER = PICTURE_LAYER + 1;
/** The pieces beside a piece in the picture: left, right, above, below, as [columns, rows]. */
const PIECE_NEIGHBOURS: readonly (readonly [number, number])[] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/**
 * The objects placed on a picture area (the jigsaw pieces), and what they do together: pieces stick together and click into place, are collected and are
 * moved as a group. It never changes: every change gives a new puzzle, or this one when nothing changed.
 */
/** the points of a round that can be celebrated: every border piece on its place, half of the pieces, all of them */
export type Milestone = 'border' | 'halfway' | 'finished';

export class Puzzle {
  /** with no more pieces than this in what the piece scroller area shows, it counts as almost empty */
  static readonly SCROLLER_ALMOST_EMPTY = 2;

  /**
   * Whether the piece scroller area is to collect pieces by itself: it shows hardly any (`shown`) while others wait further on (`ahead`: further to the right, or further down, than what is shown). With nothing further on there is
   * nothing to bring, so nothing is moved, even if there are pieces back where the person has scrolled from.
   */
  static scrollerNeedsPieces(shown: number, ahead: number): boolean {
    return ahead > 0 && shown <= Puzzle.SCROLLER_ALMOST_EMPTY;
  }

  /** The milestones the pieces on their places have reached; `grid` is how many pieces the picture is cut into across and down. */
  milestones(grid: { columns: number; rows: number }): Milestone[] {
    const pieces = this.items.filter((p) => p.data.piece);
    if (!pieces.length) return [];
    const placed = pieces.filter((p) => p.inPlace()).length;
    const border = pieces.filter((p) => JigsawPieces.isBorder(p.data.piece!, grid));
    const reached: Milestone[] = [];
    if (border.length && border.every((p) => p.inPlace())) reached.push('border');
    if (placed * 2 >= pieces.length) reached.push('halfway');
    if (placed === pieces.length) reached.push('finished');
    return reached;
  }

  private constructor(
    readonly items: readonly PlacedFigure[],
    readonly width: number,
    readonly height: number,
  ) {}

  /** the margin round the picture area, where a piece may go too: relative to the size of the area (`areaMargin`) */
  get margin(): number {
    return areaMargin(this.width, this.height);
  }

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
  private static stickCenter(wanted: number, size: number, pictureSize: number, step: number, margin: number, origin = 0): number {
    const low = size / 2 - margin; // the box may go into the margin at the top and the left
    const high = pictureSize - size / 2;
    let center = origin + Math.round((wanted - origin) / step) * step;
    if (center < low) center = origin + Math.ceil((low - origin) / step) * step;
    if (center > high) center = origin + Math.floor((high - origin) / step) * step;
    if (center < low || center > high) center = Math.round(Math.min(Math.max(wanted, low), high) * 2) / 2;
    return center;
  }

  /**
   * The pieces that are not in a place a person can see and reach: the middle of the piece is in none of `places` (rectangles, in the pixels the objects are placed in: the picture area, the gutter under
   * it, the free space beside it, the store). Whole groups: when one piece of a group is lost the whole group is (they move together). A group on its place is never lost. This is how "collect pieces"
   * finds what has strayed (after the window was made smaller, or the store was changed) and brings it back with the rest.
   */
  strayPieces(places: readonly { left: number; top: number; width: number; height: number }[]): string[] {
    const inAPlace = (m: PlacedFigure) => places.some((r) => m.centerX >= r.left && m.centerX <= r.left + r.width && m.centerY >= r.top && m.centerY <= r.top + r.height);
    const lost = new Set<string>();
    for (const item of this.items) {
      if (!item.data.piece || lost.has(item.id) || inAPlace(item)) continue;
      const group = this.stuckGroup([item.id]);
      if (this.isFixed(group)) continue;
      for (const id of group) lost.add(id);
    }
    return [...lost];
  }

  /**
   * Collects jigsaw pieces: the pieces of `ids` are put together at the top of `frame` (its left edge, its top and its width, in the pixels the objects
   * are placed in), in rows from the top left, close to each other (`COLLECT_GAP`), the way they were lying: from the top down, and in a row from left
   * to right. The pieces that stick together (see `stuckGroup`) stay as they are in relation to each other and are put as one piece; a group that has a
   * piece that is not in `ids` is not collected (it is not all in the frame). Pieces keep their layers. The same puzzle when nothing moves. With `random` (numbers from 0 up to 1) the pieces are put a little more by chance (`COLLECT_SCATTER`), not in tidy rows.
   * With `across` the store is a strip that scrolls sideways, cut into bands as high as the strip (`bandHeight`) and laid side by side (each `stride` further across: the band
   * a piece is in is its place down divided by `bandHeight`): the pieces are taken in the order they lie across the whole strip (left to right, from the top down in a column) and put
   * column by column from the left end, a column as high as a band, and when a band is full the next band goes on at the right of it. So the strip is filled in the direction it scrolls.
   * With `down` the store scrolls up and down and is cut into slices as wide as the frame (`sliceWidth`, `frame.width` is one slice) laid one under the other in the view (each `sliceHeight`
   * high; the slice a piece is in is its place across divided by `sliceWidth`): the pieces are taken slice by slice, from the top down, and put in rows inside the first slice, and when it
   * is full the next slice goes on, so no row is split over two slices.
   */
  collectPieces(ids: readonly string[], frame: { left: number; top: number; width: number }, random?: () => number, across?: { bandHeight: number; stride: number }, down?: { sliceWidth: number; sliceHeight: number }): Puzzle {
    const wanted = new Set(ids);
    const seen = new Set<string>();
    const blocks: { members: PlacedFigure[]; box: Box }[] = [];
    for (const id of ids) {
      const first = this.get(id);
      if (seen.has(id) || !first?.data.piece) continue;
      const group = this.stuckGroup([id]);
      for (const member of group) seen.add(member);
      if (!group.every((member) => wanted.has(member))) continue; // some of the group is somewhere else
      if (this.isFixed(group)) continue; // a group on its place stays
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
    const columnOf = (b: Box) => Math.round(((Math.floor((b.top + b.height / 2) / (across?.bandHeight ?? 1)) * (across?.stride ?? 0)) + (b.left - frame.left)) / size); // how far across the whole strip
    if (across) blocks.sort((a, b) => columnOf(a.box) - columnOf(b.box) || a.box.top - b.box.top);
    else if (down) {
      const sliceOf = (b: Box) => Math.floor((b.left + b.width / 2 - frame.left) / down.sliceWidth);
      blocks.sort((a, b) => sliceOf(a.box) - sliceOf(b.box) || rowOf(a.box) - rowOf(b.box) || a.box.left - b.box.left);
    } else blocks.sort((a, b) => rowOf(a.box) - rowOf(b.box) || a.box.left - b.box.left);

    const moved = new Map<string, PlacedFigure>();
    let sliceLeft = frame.left; // down: where the slice the pieces are put in begins
    let right = frame.left + frame.width - margin;
    let x = frame.left + margin;
    let y = frame.top + margin;
    let rowHeight = 0; // the height of the row (rows), or the width of the column (across)
    let bandTop = frame.top; // across: where the band the pieces are put in begins
    for (const block of blocks) {
      const moreX = random ? Math.round(random() * COLLECT_SCATTER * size) : 0; // a little further along than the tidy place
      const moreY = random ? Math.round(random() * COLLECT_SCATTER * size) : 0; // and a little further down
      if (across) {
        if (y > bandTop + margin && y + moreY + block.box.height > bandTop + across.bandHeight - margin) {
          // the column is full: the next one, at its right; when the band is full, the next band (below it in the store, at the right of it in the strip)
          x += rowHeight + gap;
          y = bandTop + margin;
          rowHeight = 0;
          if (x + moreX + block.box.width > right) {
            bandTop += across.bandHeight;
            x = frame.left + margin;
            y = bandTop + margin;
          }
        }
      } else if (x > sliceLeft + margin && x + moreX + block.box.width > right) {
        y += rowHeight + gap + (random ? Math.round(random() * COLLECT_SCATTER * size) : 0); // the row is full: the next one, a different distance away each time
        x = sliceLeft + margin;
        rowHeight = 0;
        if (down && y + moreY + block.box.height > frame.top + down.sliceHeight - margin) {
          // the slice is full: the next slice (its places are further across in the store, and it lies under this one in the view)
          sliceLeft += down.sliceWidth;
          right = sliceLeft + frame.width - margin;
          x = sliceLeft + margin;
          y = frame.top + margin;
        }
      }
      const dx = x + moreX - block.box.left;
      const dy = y + moreY - block.box.top;
      if (across) {
        y += moreY + block.box.height + gap;
        rowHeight = Math.max(rowHeight, moreX + block.box.width);
      } else {
        x += moreX + block.box.width + gap;
        rowHeight = Math.max(rowHeight, block.box.height + moreY);
      }
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
    const seeds: PlacedFigure[] = [];
    for (const id of ids) {
      const item = this.get(id);
      if (item?.data.piece) seeds.push(item);
    }
    return [...this.grown(seeds, ids)];
  }

  /** The ids of what the pieces `seeds` stick to, with them and with `also` (see `stuckGroup`). */
  private grown(seeds: readonly PlacedFigure[], also: readonly string[] = [], map = this.pieceMap()): Set<string> {
    const group = new Set<string>([...also, ...seeds.map((s) => s.id)]);
    const queue: PlacedFigure[] = [...seeds];
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
    return group;
  }

  /**
   * Whether these objects are fixed: a piece that lies on its own place stays there, and so does the whole group of pieces that stick to it. A group
   * that has no piece on its place can be moved (all of it together). Only pieces can be fixed.
   */
  isFixed(ids: readonly string[]): boolean {
    return this.stuckGroup(ids).some((id) => this.get(id)?.inPlace());
  }

  /**
   * For every object, the one that stands for its group: pieces that stick together are one piece, so what is drawn and decided for the group (where it is shown, in the picture area, the free
   * space or the store) is decided by one of them, the anchor, and the others follow it. The anchor is the first of `prefer` that is in the group (the piece that is held, or was last), else the
   * one with the lowest id; an object that is not a piece, or sticks to nothing, is its own anchor.
   */
  groupAnchors(prefer: readonly string[] = []): Map<string, string> {
    const map = this.pieceMap();
    const anchors = new Map<string, string>();
    for (const item of this.items) {
      if (anchors.has(item.id)) continue;
      if (!item.data.piece) {
        anchors.set(item.id, item.id);
        continue;
      }
      const group = this.grown([item], [], map);
      const anchor = prefer.find((id) => group.has(id)) ?? [...group].sort()[0];
      for (const id of group) anchors.set(id, anchor);
    }
    return anchors;
  }

  /** Of these objects, the ones that can be moved: those that are not fixed (see `isFixed`), each with its group. */
  movable(ids: readonly string[]): string[] {
    return ids.filter((id) => !this.isFixed([id]));
  }

  /**
   * Jigsaw pieces that are dropped: each group of pieces that stick together (see `stuckGroup`) that was dropped clicks into place when it comes close
   * enough, within `range` pixels, of one of two things: its own grid point (the home of a piece in it, see `PlacedFigure.home`), or the place where a
   * piece in it fits a neighbour that is not in the group (so the group sticks to it). The whole group moves by the smallest of these steps, so the
   * piece is exactly there, and the groups that now fit each other stick together; and when what it clicked to is within `range` of its own place as a whole, it clicks to the grid too. Only pieces are looked at, and only when they are dropped, not while
   * they are moved. `range` 0 (or less) means nothing clicks. Nothing changes (the same puzzle) when nothing is near enough. With `within` (the picture area) a group only clicks when the middle of
   * one of its pieces is inside it: outside it (the free space, the store) a piece settles where it is dropped.
   */
  dropPieces(ids: readonly string[], range: number, within?: Box): Puzzle {
    if (!(range > 0)) return this;
    let puzzle: Puzzle = this;
    const done = new Set<string>();
    for (const id of ids) {
      if (done.has(id)) continue;
      const group = puzzle.stuckGroup([id]);
      for (const member of group) done.add(member);
      const inside = (m: string) => {
        const f = puzzle.get(m);
        return !!f && !!within && f.centerX >= within.left && f.centerX <= within.left + within.width && f.centerY >= within.top && f.centerY <= within.top + within.height;
      };
      if (within && !group.some(inside)) continue;
      puzzle = puzzle.snapGroup(group, range);
      // what it has clicked to is now one group with it: if that whole group is within `range` of its own place, it clicks there too, so pieces that stick to each other do not stay a little off the grid
      const joined = puzzle.stuckGroup([id]);
      if (joined.length > group.length) {
        for (const member of joined) done.add(member);
        puzzle = puzzle.snapGroup(joined, range);
      }
    }
    return puzzle.settled(); // the pieces that are fixed now go to the bottom
  }

  /**
   * The puzzle where no piece can be lost: no free piece is ever below a fixed one, and none is outside the area. Every piece that is fixed (it lies on its own place, or sticks to one
   * that does, see `isFixed`) is on the bottom layer, and every piece that is free is above it (layer 2 and up), whatever layers they had (an older game, a piece that has just
   * clicked into place). A piece that lies (partly) outside the area is pulled in, as little as it takes: it cannot be seen out there. A piece is never below the picture area
   * either: the pieces are drawn in a layer of their own on top of it. Only pieces change, and only their layer and, to come back, their place; the same puzzle when all is right.
   */
  settled(): Puzzle {
    const fixed = this.grown(this.items.filter((p) => p.data.piece && p.inPlace()));
    const back = this.groupShifts({ left: -this.margin, top: -this.margin, width: this.width + this.margin, height: this.height + this.margin }, null, fixed); // a group that is outside the area comes back whole, never piece by piece
    let changed = false;
    const items = this.items.map((p) => {
      if (!p.data.piece) return p;
      const shift = back.get(p.id);
      let next = shift ? p.at(p.centerX + shift.dx, p.centerY + shift.dy) : p;
      const layer = Math.min(MAX_LAYER, fixed.has(p.id) ? FIXED_LAYER : Math.max(FIXED_LAYER + 1, next.layer));
      if (layer !== next.layer) next = next.withLayer(layer);
      if (next !== p) changed = true;
      return next;
    });
    return changed ? this.with(items) : this;
  }

  /**
   * How far each free group has to move to be inside the box `into` (the whole group: the box round all its pieces), as little as it takes, in half pixels, the same for every piece of the group, so
   * the pieces keep their places in relation to each other and the group stays bound. With a `region`, only the groups that have a piece with its centre in it. Pieces that are fixed are left.
   */
  private groupShifts(into: Box, region: Box | null, fixed: ReadonlySet<string>): Map<string, { dx: number; dy: number }> {
    const map = this.pieceMap();
    const shifts = new Map<string, { dx: number; dy: number }>();
    const seen = new Set<string>();
    for (const p of this.items) {
      if (!p.data.piece || fixed.has(p.id) || seen.has(p.id)) continue;
      const group = [...this.grown([p], [], map)].map((id) => this.get(id)).filter((f): f is PlacedFigure => !!f);
      for (const f of group) seen.add(f.id);
      if (region && !group.some((f) => f.centerX >= region.left && f.centerX <= region.left + region.width && f.centerY >= region.top && f.centerY <= region.top + region.height)) continue;
      const boxes = group.map((f) => f.box());
      const left = Math.min(...boxes.map((b) => b.left));
      const top = Math.min(...boxes.map((b) => b.top));
      const right = Math.max(...boxes.map((b) => b.left + b.width));
      const bottom = Math.max(...boxes.map((b) => b.top + b.height));
      const dx = Math.round((Math.max(into.left - left, 0) + Math.min(into.left + into.width - right, 0)) * 2) / 2;
      const dy = Math.round((Math.max(into.top - top, 0) + Math.min(into.top + into.height - bottom, 0)) * 2) / 2;
      if (dx || dy) for (const f of group) shifts.set(f.id, { dx, dy });
    }
    return shifts;
  }

  /**
   * The puzzle where the free pieces whose centre is in `region` are pulled into the box `into` (the whole piece inside it), as little as it takes: a place on the board that is shown
   * smaller than the part of the model it stands for (the free space beside the picture, when the store is below it) can never hold a piece that cannot be seen. Fixed pieces and what
   * is not a piece stay; the same puzzle when nothing has to move.
   */
  confine(region: Box, into: Box): Puzzle {
    const fixed = this.grown(this.items.filter((p) => p.data.piece && p.inPlace()));
    const shifts = this.groupShifts(into, region, fixed); // a group moves whole
    if (!shifts.size) return this;
    return this.with(this.items.map((p) => (shifts.has(p.id) ? p.at(p.centerX + shifts.get(p.id)!.dx, p.centerY + shifts.get(p.id)!.dy) : p)));
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
    if (!figures.length || this.isFixed(ids) || !Number.isFinite(dx) || !Number.isFinite(dy)) return this;
    const boxes = figures.map((f) => f.box());
    // the furthest the whole group can go each way: the figure that is nearest to an edge decides
    const lowX = Math.max(...boxes.map((b) => -this.margin - b.left));
    const highX = Math.min(...boxes.map((b) => this.width - (b.left + b.width)));
    const lowY = Math.max(...boxes.map((b) => -this.margin - b.top));
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
    if (!figure || this.isFixed([id])) return this;
    // a piece moves in much finer steps than the grid (a step that goes a whole number of times into the grid, so the grid points are still among them)
    const pieceStep = figure.data.piece ? Math.max(PIECE_MIN_STEP_PX, Math.round(step / PIECE_STEP_DIVISOR / PIECE_MIN_STEP_PX) * PIECE_MIN_STEP_PX) : step;
    const moved = figure.at(
      Puzzle.stickCenter(wantedX, figure.object.width, this.width, pieceStep, this.margin, origin),
      Puzzle.stickCenter(wantedY, figure.object.height, this.height, pieceStep, this.margin, origin),
    );
    if (moved.centerX === figure.centerX && moved.centerY === figure.centerY) return this;
    return this.with(this.items.map((p) => (p.id === id ? moved : p)));
  }
}
