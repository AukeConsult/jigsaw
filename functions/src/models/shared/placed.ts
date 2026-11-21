import { BaseObject, ObjectInput } from './base-object';
import { Box, Point } from './geometry';

// The objects placed on a picture area: what is stored (`PlacedObject`) and the class that works on it. The jigsaw places pieces: square figures with a `piece`.

/** The picture area itself is always layer 0. The placed objects are on the layers above it. */
export const PICTURE_LAYER = 0;
/** The layer a first object goes on (the objects after it go on the last layer). */
export const DEFAULT_LAYER = 10;
/** The highest layer an object can be on. */
export const MAX_LAYER = 1000;

/** An object placed on the picture area, as it is stored: a copy of the object as it was when placed, and where its centre is. */
export interface PlacedObject {
  /** identifies this placement on the picture area */
  id: string;
  object: ObjectInput;
  /** the centre of the object: pixels from the left edge of the picture area (a whole or a half pixel); this is the point that sticks to a grid point */
  centerX: number;
  /** the centre of the object: pixels from the top edge of the picture area */
  centerY: number;
  /** the layer it is on: above the picture area (layer 0), a higher layer is in front of a lower one (without it: DEFAULT_LAYER) */
  layer?: number;
  /** a figure that is a piece of a jigsaw: which piece it is (see `JigsawCut`) */
  piece?: PiecePlace;
}

/** A piece of a jigsaw: which cell of the picture it is, and its four edges (1 a tab that goes out, -1 a blank that goes in, 0 flat: on the border). */
export interface PiecePlace {
  col: number;
  row: number;
  top: -1 | 0 | 1;
  right: -1 | 0 | 1;
  bottom: -1 | 0 | 1;
  left: -1 | 0 | 1;
}

/** The most columns or rows of pieces. */
export const MAX_PIECE_INDEX = 1000;

/**
 * A placed figure (a jigsaw piece): a box, it knows its own place, its own box and its own home in the picture area.
 * It never changes: moving it gives a new one.
 */
export class PlacedFigure {
  constructor(readonly data: PlacedObject) {}

  /**
   * The data that is stored for a placed object that is allowed: only the known fields, whatever else came with it is left out (the object itself
   * by `BaseObject.stored`).
   */
  static stored(data: PlacedObject): PlacedObject {
    return {
      id: data.id,
      centerX: data.centerX,
      centerY: data.centerY,
      object: BaseObject.stored(data.object),
      ...(data.layer !== undefined ? { layer: data.layer } : {}),
      ...(data.piece ? { piece: { col: data.piece.col, row: data.piece.row, top: data.piece.top, right: data.piece.right, bottom: data.piece.bottom, left: data.piece.left } } : {}),
    };
  }

  /**
   * A placed object that an older version saved, as it is now: one saved before its centre was stored has its top-left corner in x and y (its centre
   * is half its size further), its object lacked fields (see `BaseObject.fromStored`), and one saved before there were layers is on the default layer.
   * What only an older version had (the settings of an arrow: its connections, length, bend and angle) is left out.
   */
  static fromStored(doc: PlacedObject & { x?: number; y?: number }): PlacedObject {
    const { x, y, ...rest } = doc;
    const object = BaseObject.fromStored(rest.object);
    const centre = typeof rest.centerX === 'number' && typeof rest.centerY === 'number' ? rest : { centerX: (x ?? 0) + object.width / 2, centerY: (y ?? 0) + object.height / 2 };
    return { ...PlacedFigure.stored({ ...rest, ...centre, object }), layer: rest.layer ?? DEFAULT_LAYER };
  }

  get id(): string {
    return this.data.id;
  }

  get object(): ObjectInput {
    return this.data.object;
  }

  get centerX(): number {
    return this.data.centerX;
  }

  get centerY(): number {
    return this.data.centerY;
  }

  /** the layer it is on: 1 or more (the picture area is layer 0), a higher layer is in front of a lower one */
  get layer(): number {
    return this.data.layer ?? DEFAULT_LAYER;
  }

  /** the same object on another layer */
  withLayer(layer: number): PlacedFigure {
    return new PlacedFigure({ ...this.data, layer });
  }

  get left(): number {
    return this.centerX - this.object.width / 2;
  }

  get top(): number {
    return this.centerY - this.object.height / 2;
  }

  /** whether it is inside a picture area of this size */
  fits(width: number, height: number): boolean {
    return this.left >= 0 && this.top >= 0 && this.left + this.object.width <= width && this.top + this.object.height <= height;
  }

  /** the same object with its centre somewhere else */
  at(centerX: number, centerY: number): PlacedFigure {
    return new PlacedFigure({ ...this.data, centerX, centerY });
  }

  /**
   * A jigsaw piece: where it belongs on the picture area, as the centre of its cell of the picture (its own grid point). Null for a figure that is not a piece.
   * The picture covers the picture area, so the cell (col, row) of pieces of this size is at col × size, row × size.
   */
  home(): Point | null {
    const piece = this.data.piece;
    if (!piece) return null;
    const size = this.object.width;
    return { x: (piece.col + 0.5) * size, y: (piece.row + 0.5) * size };
  }

  /** its box */
  box(): Box {
    return { left: this.left, top: this.top, width: this.object.width, height: this.object.height };
  }

  bounds(): Box {
    return this.box();
  }

  /** The reason the jigsaw piece (if it is one) is not allowed, or '' when it is fine. */
  private pieceError(): string {
    const piece = this.data.piece as Partial<PiecePlace> | null | undefined;
    if (piece === undefined) return '';
    const index = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < MAX_PIECE_INDEX;
    const edge = (v: unknown) => v === -1 || v === 0 || v === 1;
    if (!piece || typeof piece !== 'object' || !index(piece.col) || !index(piece.row) || ![piece.top, piece.right, piece.bottom, piece.left].every(edge)) {
      return `"${this.object.name}" has a bad jigsaw piece.`;
    }
    return '';
  }

  /** The reason it is not allowed on a picture area of this size, or '' when it is fine. */
  error(width: number, height: number): string {
    const modelError = BaseObject.of(this.data.object ?? {}).error();
    if (modelError) return `A placed object is not valid: ${modelError}`;
    const { centerX: cx, centerY: cy } = this.data;
    // a centre is a whole or a half pixel (an object with an odd size has a centre between two pixels)
    if (typeof cx !== 'number' || typeof cy !== 'number' || !Number.isFinite(cx) || !Number.isFinite(cy)) return 'A placed object has a bad position.';
    const layer = this.data.layer;
    if (layer !== undefined && (typeof layer !== 'number' || !Number.isInteger(layer) || layer <= PICTURE_LAYER || layer > MAX_LAYER)) {
      return `A placed object is on a layer from ${PICTURE_LAYER + 1} to ${MAX_LAYER} (the picture area is layer ${PICTURE_LAYER}).`;
    }
    return this.pieceError() || (this.fits(width, height) ? '' : `"${this.object.name}" does not fit inside the picture area.`);
  }
}
