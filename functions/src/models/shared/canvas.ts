import { CanvasDiagram } from './diagram';
import { PlacedBase, PlacedObject } from './placed';

// A saved canvas area: its settings, and the check of what comes from outside.

/** The Firestore collection that holds the saved canvas areas. */
export const CANVAS_LIST = 'canvas-list';

/** The Firestore collection that holds the jigsaw pages: canvas areas like the others, kept apart. */
export const JIGSAW = 'jigsaw';

/** The smallest and largest side of a canvas area, in pixels. */
export const CANVAS_MIN_SIDE = 1;
export const CANVAS_MAX_SIDE = 10000;
export const CANVAS_MAX_NAME = 60;
/** The longest name of the picture file that is kept with a jigsaw. */
export const CANVAS_MAX_PICTURE_NAME = 200;
/** The grid: pixels between two grid points. 0 = no grid. */
export const CANVAS_MAX_GRID = 1000;
/** The grid of a new canvas. */
export const CANVAS_DEFAULT_GRID = 50;
/** The grid of a canvas that an older version saved before the grid was a setting: what it had then. */
const CANVAS_LEGACY_GRID = 5;

/** How many times the height of the canvas the store frame of a jigsaw is: its pieces are spread over it and it scrolls. */
export const STORE_HEIGHT_FACTOR = 3;

/** who sees a jigsaw in the lists */
export type CanvasVisibility = 'everyone' | 'owner';
export const CANVAS_VISIBILITIES: readonly CanvasVisibility[] = ['everyone', 'owner'];

/** A canvas area: a name and its size in pixels. */
export interface CanvasSpec {
  id: string;
  name: string;
  /** a jigsaw: who made it (the name of the author, as typed; without it, none is shown) */
  author?: string;
  /** a jigsaw: the UID of its owner, the user who is its author (chosen from the users; the API puts that user's name in `author`); without it, a jigsaw from before owners */
  ownerUid?: string;
  /** a jigsaw: who sees it in the lists: `everyone` (also when it says nothing: the default) or `owner` (only its owner; it needs an owner) */
  visibility?: CanvasVisibility;
  /** a jigsaw: the name of the picture file it was made from (kept as information; not shown while playing) */
  pictureName?: string;
  /** horizontal size in pixels */
  width: number;
  /** vertical size in pixels */
  height: number;
  /** pixels between two grid points; 0 = no grid */
  gridSize: number;
  /** whether the grid points are shown (the grid size is kept when they are hidden) */
  gridVisible: boolean;
  /** the canvas objects placed on the canvas area */
  placed: PlacedObject[];
  /** a jigsaw: how wide its store frame is in pixels, beside the canvas (without it, 0: no store; see `CanvasArea.storeFrame`) */
  storeWidth?: number;
  /** a jigsaw, a game setting: how close to the grid point it belongs on a piece has to be dropped to click into place, in percent of the grid size (0: never; without it, `CanvasArea.DEFAULT_SNAP_PERCENT`) */
  snapPercent?: number;
  /** a jigsaw: how thick the frame around the picture area is, in pixels (0: no frame; without it, `CanvasArea.DEFAULT_FRAME_WIDTH`); chosen when the jigsaw is made */
  frameWidth?: number;
  /** a jigsaw: how thick the line round each piece is, in pixels (0: none; without it, `CanvasArea.DEFAULT_LINE_WIDTH`) */
  lineWidth?: number;
  /** a jigsaw: the colour of the line round each piece, as #rrggbb (without it, `CanvasArea.DEFAULT_LINE_COLOR`) */
  lineColor?: string;
  /** a jigsaw: the background colour of the picture area inside the frame, as #rrggbb (without it, `CanvasArea.DEFAULT_BACK_COLOR`) */
  backColor?: string;
  /** milliseconds since 1970 */
  createdAt: number;
}

/** What the page sends to make a canvas area. */
export type CanvasInput = Pick<CanvasSpec, 'name' | 'author' | 'ownerUid' | 'visibility' | 'pictureName' | 'width' | 'height' | 'gridSize' | 'gridVisible' | 'placed' | 'storeWidth' | 'snapPercent' | 'frameWidth' | 'lineWidth' | 'lineColor' | 'backColor'>;

/** A canvas area as it comes from outside (the page, the API): it checks itself. */
export class CanvasArea {
  constructor(readonly input: { name?: unknown; author?: unknown; ownerUid?: unknown; visibility?: unknown; pictureName?: unknown; width?: unknown; height?: unknown; gridSize?: unknown; gridVisible?: unknown; placed?: unknown; storeWidth?: unknown; snapPercent?: unknown; frameWidth?: unknown; lineWidth?: unknown; lineColor?: unknown; backColor?: unknown }) {}

  /**
   * A side of a canvas whose grid points are half a step in from the edge, made to fit the grid: a whole number of steps (at least one, at most
   * what a canvas can be), so the last row and column of points are as far from the far edge as the first are from the near one. No grid: as it is.
   */
  static fittedSide(side: number, grid: number): number {
    if (!(grid > 0) || !Number.isFinite(side)) return side;
    let steps = Math.max(1, Math.round(side / grid));
    while (steps > 1 && steps * grid > CANVAS_MAX_SIDE) steps--;
    return steps * grid;
  }

  /**
   * The store frame of a jigsaw (where its pieces wait): beside the canvas, one grid step from its right edge (so the grid points go on across), as high
   * as `STORE_HEIGHT_FACTOR` canvases and `storeWidth` wide; null when there is no store.
   */
  static storeFrame(width: number, height: number, grid: number, storeWidth: number | undefined): { left: number; width: number; height: number } | null {
    return storeWidth && storeWidth > 0 ? { left: width + Math.max(0, grid), width: storeWidth, height: STORE_HEIGHT_FACTOR * height } : null;
  }

  /** Everything the objects can be on: the canvas, and its store frame when it has one (one box, so an object is checked against it). */
  static extent(width: number, height: number, grid: number, storeWidth: number | undefined): { width: number; height: number } {
    const store = CanvasArea.storeFrame(width, height, grid, storeWidth);
    return store ? { width: store.left + store.width, height: Math.max(height, store.height) } : { width, height };
  }

  /** How close a piece has to be dropped to its own grid point to click into place when the jigsaw says nothing: half a grid step (50 %). */
  static readonly DEFAULT_SNAP_PERCENT = 25;

  /** How thick the frame around the picture area of a jigsaw is when the jigsaw says nothing: 4 pixels, a frame that can be seen. */
  static readonly DEFAULT_FRAME_WIDTH = 4;
  /** The thickest frame, in pixels. */
  static readonly MAX_FRAME_WIDTH = 20;

  /** How thick the line round each piece is when the jigsaw says nothing: 1 pixel. */
  static readonly DEFAULT_LINE_WIDTH = 1;
  /** The thickest line round a piece, in pixels. */
  static readonly MAX_LINE_WIDTH = 6;
  /** The colour of the line round each piece when the jigsaw says nothing (drawn a little see-through). */
  static readonly DEFAULT_LINE_COLOR = '#212529';
  /** The background colour of the picture area of a jigsaw when the jigsaw says nothing: white. */
  static readonly DEFAULT_BACK_COLOR = '#ffffff';

  /** the snap range in pixels: a percent of the grid size */
  static snapRangePx(percent: number, grid: number): number {
    return grid > 0 && percent > 0 ? (percent / 100) * grid : 0;
  }

  /** The canvas as it is stored, for a canvas that is allowed (`error()` is ''): only the known fields, the name trimmed, the objects as `PlacedBase.stored` gives them. */
  stored(): CanvasInput {
    const i = this.input;
    return {
      name: (i.name as string).trim(),
      ...(typeof i.author === 'string' && i.author.trim() ? { author: i.author.trim() } : {}),
      ...(typeof i.ownerUid === 'string' && i.ownerUid ? { ownerUid: i.ownerUid } : {}),
      ...(i.visibility === 'owner' ? { visibility: 'owner' as const } : {}), // `everyone` is what none says
      ...(typeof i.pictureName === 'string' && i.pictureName.trim() ? { pictureName: i.pictureName.trim() } : {}),
      width: i.width as number,
      height: i.height as number,
      gridSize: i.gridSize as number,
      gridVisible: i.gridVisible as boolean,
      placed: (i.placed as PlacedObject[]).map((p) => PlacedBase.stored(p)),
      ...(i.storeWidth ? { storeWidth: i.storeWidth as number } : {}),
      ...(i.snapPercent !== undefined ? { snapPercent: i.snapPercent as number } : {}),
      ...(i.frameWidth !== undefined ? { frameWidth: i.frameWidth as number } : {}),
      ...(i.lineWidth !== undefined ? { lineWidth: i.lineWidth as number } : {}),
      ...(i.lineColor !== undefined ? { lineColor: (i.lineColor as string).toLowerCase() } : {}),
      ...(i.backColor !== undefined ? { backColor: (i.backColor as string).toLowerCase() } : {}),
    };
  }

  /** A saved canvas as it is now: one that an older version saved lacked the grid (it gets the default, shown), and its objects are read as `PlacedBase.fromStored` says. */
  static fromStored(id: string, doc: Partial<CanvasSpec>): CanvasSpec {
    return {
      id,
      name: doc.name ?? '',
      ...(doc.author ? { author: doc.author } : {}),
      ...(doc.ownerUid ? { ownerUid: doc.ownerUid } : {}),
      ...(doc.visibility === 'owner' ? { visibility: 'owner' as const } : {}),
      ...(doc.pictureName ? { pictureName: doc.pictureName } : {}),
      width: doc.width ?? 800,
      height: doc.height ?? 600,
      gridSize: doc.gridSize ?? CANVAS_LEGACY_GRID,
      gridVisible: doc.gridVisible ?? true,
      placed: (doc.placed ?? []).map((p) => PlacedBase.fromStored(p)),
      ...(doc.storeWidth ? { storeWidth: doc.storeWidth } : {}),
      ...(doc.snapPercent !== undefined ? { snapPercent: doc.snapPercent } : {}),
      ...(doc.frameWidth !== undefined ? { frameWidth: doc.frameWidth } : {}),
      ...(doc.lineWidth !== undefined ? { lineWidth: doc.lineWidth } : {}),
      ...(doc.lineColor !== undefined ? { lineColor: doc.lineColor } : {}),
      ...(doc.backColor !== undefined ? { backColor: doc.backColor } : {}),
      createdAt: doc.createdAt ?? 0,
    };
  }

  /** The reason the canvas is not allowed, or '' when it is fine. */
  error(): string {
    const input = this.input;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return 'Give the canvas a name.';
    if (name.length > CANVAS_MAX_NAME) return `The name can be at most ${CANVAS_MAX_NAME} characters.`;
    if (input.author !== undefined && (typeof input.author !== 'string' || input.author.trim().length > CANVAS_MAX_NAME)) return `The author can be at most ${CANVAS_MAX_NAME} characters.`;
    if (input.ownerUid !== undefined && (typeof input.ownerUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.ownerUid))) return 'The owner must be the id of a user.';
    if (input.visibility !== undefined && !(CANVAS_VISIBILITIES as readonly unknown[]).includes(input.visibility)) return 'A jigsaw is seen by everyone or by its owner only.';
    if (input.visibility === 'owner' && !input.ownerUid) return 'A jigsaw only its owner sees needs an owner: choose the author from the users.';
    if (input.pictureName !== undefined && (typeof input.pictureName !== 'string' || input.pictureName.trim().length > CANVAS_MAX_PICTURE_NAME)) {
      return `The name of the picture file can be at most ${CANVAS_MAX_PICTURE_NAME} characters.`;
    }
    for (const [label, value] of [['Width', input.width], ['Height', input.height]] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < CANVAS_MIN_SIDE || value > CANVAS_MAX_SIDE) {
        return `${label} must be a whole number of pixels from ${CANVAS_MIN_SIDE} to ${CANVAS_MAX_SIDE}.`;
      }
    }
    const grid = input.gridSize;
    if (typeof grid !== 'number' || !Number.isInteger(grid) || grid < 0 || grid > CANVAS_MAX_GRID) {
      return `The grid must be a whole number of pixels from 0 (no grid) to ${CANVAS_MAX_GRID}.`;
    }
    if (typeof input.gridVisible !== 'boolean') return 'Say whether the grid is shown (true or false).';
    const store = input.storeWidth;
    if (store !== undefined && (typeof store !== 'number' || !Number.isInteger(store) || store < 0 || store > CANVAS_MAX_SIDE)) {
      return `The store must be a whole number of pixels from 0 to ${CANVAS_MAX_SIDE} wide.`;
    }
    const range = input.snapPercent;
    if (range !== undefined && (typeof range !== 'number' || !Number.isInteger(range) || range < 0 || range > 100)) {
      return 'The snap range must be a whole number of percent of the grid size, from 0 (a piece never clicks into place) to 100.';
    }
    const frame = input.frameWidth;
    if (frame !== undefined && (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0 || frame > CanvasArea.MAX_FRAME_WIDTH)) {
      return `The frame must be a whole number of pixels from 0 (no frame) to ${CanvasArea.MAX_FRAME_WIDTH}.`;
    }
    const lineWidth = input.lineWidth;
    if (lineWidth !== undefined && (typeof lineWidth !== 'number' || !Number.isInteger(lineWidth) || lineWidth < 0 || lineWidth > CanvasArea.MAX_LINE_WIDTH)) {
      return `The line round the pieces must be a whole number of pixels from 0 (no line) to ${CanvasArea.MAX_LINE_WIDTH}.`;
    }
    const lineColor = input.lineColor;
    if (lineColor !== undefined && (typeof lineColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(lineColor))) return 'The colour of the line round the pieces must be written as #rrggbb.';
    const back = input.backColor;
    if (back !== undefined && (typeof back !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(back))) return 'The background colour must be written as #rrggbb.';
    const extent = CanvasArea.extent(input.width as number, input.height as number, grid, store);
    return CanvasDiagram.validate(input.placed, extent.width, extent.height);
  }
}
