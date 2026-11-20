import { CANVAS_MAX_SIDE, CanvasArea, STORE_HEIGHT_FACTOR } from './canvas';
import { DEFAULT_OBJECT, OBJECT_MAX_SIDE } from './canvas-object';
import { CANVAS_MAX_PLACED } from './diagram';
import { DEFAULT_LAYER, MAX_LAYER, MAX_PIECE_INDEX, PiecePlace, PlacedObject } from './placed';

// The jigsaw: a canvas cut into pieces, one for each cell of the grid, with the edges of a jigsaw puzzle.

/** What the cutting makes: the pieces as placed objects, or why it cannot. */
export type JigsawCutResult = { placed: PlacedObject[]; columns: number; rows: number; storeWidth: number } | { error: string };

/** How many pieces a canvas of this size and grid is cut into: a whole cell of the grid each (what is left over at the far edges is not a piece). */
export function pieceGrid(width: number, height: number, grid: number): { columns: number; rows: number } {
  if (!(grid > 0)) return { columns: 0, rows: 0 };
  return { columns: Math.floor(width / grid), rows: Math.floor(height / grid) };
}

/** The space between two neighbouring pieces in the store, from this to this many piece widths (edge to edge, across and down); below 0 they overlap. */
export const PIECE_GAP_MIN = -0.3;
export const PIECE_GAP_MAX = 0.8;

/** The fewest pieces a jigsaw is cut into. */
export const MIN_PIECES = 2;

/** What a number of pieces makes of a canvas: the grid size and the size of the canvas that goes with it, and how many pieces that really is. */
export interface PieceLayout {
  /** the side of a piece, and the grid size, in pixels */
  grid: number;
  /** the width and the height of the canvas, a whole number of pieces each */
  width: number;
  height: number;
  columns: number;
  rows: number;
}

export class JigsawCut {
  /**
   * The grid size for a canvas that is to be cut into about `pieces` pieces, and the canvas made a whole number of pieces wide and high: the pieces are
   * square, a piece is the square root of (area / pieces) on each side, and of the grids near that the one that gives the number of pieces closest to
   * what was asked for is taken (never more pieces than fit on a canvas, never fewer than `MIN_PIECES`). The pieces that come out can be a few more or
   * fewer than asked for, since they are whole squares.
   */
  static layoutFor(width: number, height: number, pieces: number): PieceLayout {
    const wanted = Math.min(CANVAS_MAX_PLACED, Math.max(MIN_PIECES, Math.round(Number.isFinite(pieces) ? pieces : MIN_PIECES)));
    const ideal = Math.sqrt((Math.max(1, width) * Math.max(1, height)) / wanted);
    let best: (PieceLayout & { miss: number; away: number }) | null = null;
    for (let grid = Math.max(1, Math.floor(ideal) - 3); grid <= Math.ceil(ideal) + 3; grid++) {
      const w = CanvasArea.fittedSide(width, grid);
      const h = CanvasArea.fittedSide(height, grid);
      const columns = Math.round(w / grid);
      const rows = Math.round(h / grid);
      const count = columns * rows;
      if (count > CANVAS_MAX_PLACED || count < MIN_PIECES) continue;
      const candidate = { grid, width: w, height: h, columns, rows, miss: Math.abs(count - wanted), away: Math.abs(grid - ideal) };
      if (!best || candidate.miss < best.miss || (candidate.miss === best.miss && candidate.away < best.away)) best = candidate;
    }
    if (best) return { grid: best.grid, width: best.width, height: best.height, columns: best.columns, rows: best.rows };
    // nothing near fits (a canvas that is very small or very big for this number): the smallest grid that does not give too many pieces
    let grid = Math.max(1, Math.ceil(ideal));
    while (grid < CANVAS_MAX_SIDE && Math.round(CanvasArea.fittedSide(width, grid) / grid) * Math.round(CanvasArea.fittedSide(height, grid) / grid) > CANVAS_MAX_PLACED) grid++;
    const w = CanvasArea.fittedSide(width, grid);
    const h = CanvasArea.fittedSide(height, grid);
    return { grid, width: w, height: h, columns: Math.round(w / grid), rows: Math.round(h / grid) };
  }

  /**
   * Cuts a canvas into pieces of `grid` × `grid` pixels. Each piece is a placed square (so it moves, saves and snaps like any figure) that says which
   * cell of the picture it is (`piece`: column, row and its four edges). Every edge between two pieces is a tab on one and the matching blank on the
   * other, chosen by chance; the edges on the border of the canvas are flat. The pieces are put in the store frame beside the canvas (see
   * `CanvasArea.storeFrame`), scattered over it (see `scatter`), none over another and each on a random layer; `storeWidth` is how wide the frame has to be. `random` gives numbers from 0 up to 1.
   */
  static cut(width: number, height: number, grid: number, random: () => number = Math.random): JigsawCutResult {
    const { columns, rows } = pieceGrid(width, height, grid);
    if (columns * rows < 2) return { error: 'The canvas needs a grid and room for at least two pieces.' };
    if (columns * rows > CANVAS_MAX_PLACED) return { error: `That would be ${columns * rows} pieces, and at most ${CANVAS_MAX_PLACED} fit on a canvas: use a bigger grid.` };

    const sign = () => (random() < 0.5 ? -1 : 1) as -1 | 1;
    // the tab of each edge between two pieces: right of (c, r) is the left of (c + 1, r), bottom of (c, r) is the top of (c, r + 1), opposite for the neighbour
    const right = Array.from({ length: columns }, () => Array.from({ length: rows }, sign));
    const bottom = Array.from({ length: columns }, () => Array.from({ length: rows }, sign));
    const edges = (c: number, r: number): Omit<PiecePlace, 'col' | 'row'> => ({
      top: r === 0 ? 0 : (-bottom[c][r - 1] as -1 | 1),
      right: c === columns - 1 ? 0 : right[c][r],
      bottom: r === rows - 1 ? 0 : bottom[c][r],
      left: c === 0 ? 0 : (-right[c - 1][r] as -1 | 1),
    });

    const pieces = Array.from({ length: columns * rows }, (_, i): PlacedObject => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      return {
        id: `piece-${col}-${row}`,
        object: { ...DEFAULT_OBJECT, name: `Piece ${col + 1},${row + 1}`, width: grid, height: grid },
        centerX: 0,
        centerY: 0,
        piece: { col, row, ...edges(col, row) },
      };
    });
    const { placed, storeWidth } = JigsawCut.scatterPieces(pieces, width, height, grid, random);
    return { placed, columns, rows, storeWidth };
  }

  /**
   * The pieces put in the store frame beside the canvas (see `CanvasArea.storeFrame`), scattered over it (see `scatter`), none over another, in a random
   * order and each on a random layer; they keep their own edges. `storeWidth` is how wide the frame has to be.
   */
  static scatterPieces(pieces: PlacedObject[], width: number, height: number, grid: number, random: () => number): { placed: PlacedObject[]; storeWidth: number } {
    const count = pieces.length;
    const { spots, storeWidth } = JigsawCut.scatter(count, grid, STORE_HEIGHT_FACTOR * height, random);
    const left = width + grid;
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const placed = pieces.map((piece, i): PlacedObject => {
      const spot = spots[order[i]];
      return { ...piece, centerX: left + spot.x, centerY: spot.y, layer: DEFAULT_LAYER + Math.floor(random() * count) };
    });
    return { placed, storeWidth };
  }

  /**
   * Starts a cut jigsaw over: all its pieces are scattered again in the store frame, in new places and on new layers, with the edges they have. What is
   * on the canvas that is not a piece stays as it is. `error` when there is nothing to shuffle.
   */
  static reshuffle(placed: readonly PlacedObject[], width: number, height: number, grid: number, random: () => number = Math.random): JigsawCutResult | { error: string } {
    const pieces = placed.filter((p) => p.piece);
    const { columns, rows } = pieceGrid(width, height, grid);
    if (pieces.length < 2) return { error: 'There are no pieces to shuffle: cut the picture first.' };
    const { placed: shuffled, storeWidth } = JigsawCut.scatterPieces(pieces, width, height, grid, random);
    const byId = new Map(shuffled.map((p) => [p.id, p]));
    return { placed: placed.map((p) => byId.get(p.id) ?? p), columns, rows, storeWidth };
  }

  /**
   * Where `count` pieces of `size` pixels go in a store frame that is `frameHeight` high, as the centre of each piece measured from the left edge of the
   * frame: in rows from the top left, the space between two neighbours (across and down) chosen by chance from `PIECE_GAP_MIN` to `PIECE_GAP_MAX`
   * pieces (so they can overlap), whole pixels. The frame is made as wide as the pieces need (`storeWidth`): the layout is tried with more and more
   * columns until all the pieces are inside the frame, with room for the tabs.
   */
  static scatter(count: number, size: number, frameHeight: number, random: () => number): { spots: { x: number; y: number }[]; storeWidth: number } {
    const gap = () => Math.round(size * (PIECE_GAP_MIN + (PIECE_GAP_MAX - PIECE_GAP_MIN) * random()));
    const margin = Math.round(size * 0.4); // the tabs reach out of a piece by about this much
    const pitch = size * (1 + (PIECE_GAP_MIN + PIECE_GAP_MAX) / 2); // the room a piece takes in a row, on average
    for (let columns = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(frameHeight / pitch)))); ; columns++) {
      const storeWidth = Math.round(columns * pitch);
      const spots: { x: number; y: number }[] = [];
      let y = margin;
      while (spots.length < count && y + size + margin <= frameHeight) {
        let x = margin + Math.round(random() * size * 0.5); // each row starts a little further in or out
        while (spots.length < count && x + size + margin <= storeWidth) {
          spots.push({ x: x + size / 2, y: y + size / 2 });
          x += size + gap();
        }
        y += size + gap();
      }
      if (spots.length === count) return { spots, storeWidth };
    }
  }

  /**
   * The outline of a piece as an SVG path in a square of `size` pixels (the tabs reach outside the square, about a quarter of its side): its four edges,
   * a tab (1) goes out, a blank (-1) goes in, flat (0) is straight.
   */
  static path(size: number, piece: Pick<PiecePlace, 'top' | 'right' | 'bottom' | 'left'>): string {
    const s = size;
    // a tab in local coordinates: u along the edge (0..1), v out of the piece (units of the side)
    const knob: [number, number][][] = [
      [[0.38, 0.1], [0.28, 0.12], [0.3, 0.22]],
      [[0.32, 0.32], [0.68, 0.32], [0.7, 0.22]],
      [[0.72, 0.12], [0.62, 0.1], [0.62, 0]],
    ];
    const edge = (ax: number, ay: number, bx: number, by: number, ox: number, oy: number, k: number): string => {
      const at = (u: number, v: number) => `${(ax + (bx - ax) * u + ox * v * k * s).toFixed(2)},${(ay + (by - ay) * u + oy * v * k * s).toFixed(2)}`;
      if (!k) return `L ${bx},${by}`;
      return `L ${at(0.38, 0)} ${knob.map((c) => `C ${c.map(([u, v]) => at(u, v)).join(' ')}`).join(' ')} L ${bx},${by}`;
    };
    return [
      `M 0,0`,
      edge(0, 0, s, 0, 0, -1, piece.top),
      edge(s, 0, s, s, 1, 0, piece.right),
      edge(s, s, 0, s, 0, 1, piece.bottom),
      edge(0, s, 0, 0, -1, 0, piece.left),
      'Z',
    ].join(' ');
  }
}

/** The subcollection of a jigsaw document that holds its pieces: `jigsaw/<id>/pieces/<piece id>`. */
export const JIGSAW_PIECES = 'pieces';

/** One piece of a jigsaw as it is kept in the database: what it is (its number and its edges), where it is, and whether it is matched. Its graphic is kept next to it. */
export interface JigsawPiece {
  id: string;
  /** the number of the grid point it belongs on in the picture: 1, 2, 3 ... row by row (row × columns + column + 1) */
  number: number;
  col: number;
  row: number;
  top: -1 | 0 | 1;
  right: -1 | 0 | 1;
  bottom: -1 | 0 | 1;
  left: -1 | 0 | 1;
  /** the side of the piece in pixels (the size of a cell of the grid when it was cut) */
  size: number;
  /** where its centre is on the jigsaw pieces area, in pixels */
  centerX: number;
  centerY: number;
  layer: number;
  /** it lies in its own place (its centre is on the centre of its cell of the picture): the database says so, whatever the page says */
  matched: boolean;
}

/** The change of a piece that is saved while the game is played: where it is. */
export type PieceMove = Pick<JigsawPiece, 'id' | 'centerX' | 'centerY' | 'layer'>;

/** The pieces of a jigsaw in the database and how they go to and from the objects of the page. */
export class JigsawPieces {
  /** a piece within this many pixels of its own place is matched (a half pixel is the finest a piece is moved) */
  static readonly MATCH_TOLERANCE_PX = 0.5;

  /** the number of the grid point a piece belongs on: the points are numbered along each row */
  static numberOf(col: number, row: number, columns: number): number {
    return row * columns + col + 1;
  }

  /** whether a piece lies on its own place: the centre of its cell of the picture */
  static matched(piece: Pick<JigsawPiece, 'col' | 'row' | 'size' | 'centerX' | 'centerY'>): boolean {
    const tolerance = JigsawPieces.MATCH_TOLERANCE_PX;
    return Math.abs(piece.centerX - (piece.col + 0.5) * piece.size) <= tolerance && Math.abs(piece.centerY - (piece.row + 0.5) * piece.size) <= tolerance;
  }

  /** the piece for a placed jigsaw piece of a jigsaw that is cut into `columns` columns (null for an object that is not a piece) */
  static of(placed: PlacedObject, columns: number): JigsawPiece | null {
    const piece = placed.piece;
    if (!piece) return null;
    const stored: Omit<JigsawPiece, 'matched'> = {
      id: placed.id,
      number: JigsawPieces.numberOf(piece.col, piece.row, columns),
      col: piece.col,
      row: piece.row,
      top: piece.top,
      right: piece.right,
      bottom: piece.bottom,
      left: piece.left,
      size: placed.object.width,
      centerX: placed.centerX,
      centerY: placed.centerY,
      layer: placed.layer ?? DEFAULT_LAYER,
    };
    return { ...stored, matched: JigsawPieces.matched(stored) };
  }

  /** the placed object the page works with, for a piece from the database */
  static toPlaced(piece: JigsawPiece): PlacedObject {
    return {
      id: piece.id,
      object: { ...DEFAULT_OBJECT, name: `Piece ${piece.col + 1},${piece.row + 1}`, width: piece.size, height: piece.size },
      centerX: piece.centerX,
      centerY: piece.centerY,
      layer: piece.layer,
      piece: { col: piece.col, row: piece.row, top: piece.top, right: piece.right, bottom: piece.bottom, left: piece.left },
    };
  }

  /** The piece as it is stored, for a piece that is allowed: only the known fields, and `matched` as the position says (not as it was sent). */
  static stored(piece: JigsawPiece): JigsawPiece {
    const known: Omit<JigsawPiece, 'matched'> = {
      id: piece.id,
      number: piece.number,
      col: piece.col,
      row: piece.row,
      top: piece.top,
      right: piece.right,
      bottom: piece.bottom,
      left: piece.left,
      size: piece.size,
      centerX: piece.centerX,
      centerY: piece.centerY,
      layer: piece.layer,
    };
    return { ...known, matched: JigsawPieces.matched(known) };
  }

  /** The reason a place and a layer are not allowed for a piece (a move), or ''. */
  static moveError(move: unknown): string {
    const m = move as Partial<PieceMove> | null;
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id || m.id.length > 60) return 'A piece needs its id.';
    const limit = 2 * OBJECT_MAX_SIDE;
    for (const v of [m.centerX, m.centerY]) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > limit || !Number.isInteger(v * 2)) return `The place of piece ${m.id} is not allowed.`;
    }
    if (typeof m.layer !== 'number' || !Number.isInteger(m.layer) || m.layer < 1 || m.layer > MAX_LAYER) return `The layer of piece ${m.id} is not allowed.`;
    return '';
  }

  /** The reason a whole piece is not allowed, or ''. */
  static error(piece: unknown): string {
    const p = piece as Partial<JigsawPiece> | null;
    if (!p || typeof p !== 'object') return 'A piece must be an object.';
    const moved = JigsawPieces.moveError(p);
    if (moved) return moved;
    const index = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < MAX_PIECE_INDEX;
    const edge = (v: unknown) => v === -1 || v === 0 || v === 1;
    if (!index(p.col) || !index(p.row) || ![p.top, p.right, p.bottom, p.left].every(edge)) return `Piece ${p.id} has a bad place in the picture or bad edges.`;
    if (typeof p.number !== 'number' || !Number.isInteger(p.number) || p.number < 1 || p.number > MAX_PIECE_INDEX * MAX_PIECE_INDEX) return `Piece ${p.id} has a bad number.`;
    if (typeof p.size !== 'number' || !Number.isFinite(p.size) || p.size < 1 || p.size > OBJECT_MAX_SIDE) return `Piece ${p.id} has a bad size.`;
    return '';
  }
}
