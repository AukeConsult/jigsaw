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
/** The grid: pixels between two grid points. 0 = no grid. */
export const CANVAS_MAX_GRID = 1000;
/** The grid of a new canvas. */
export const CANVAS_DEFAULT_GRID = 50;
/** The grid of a canvas that an older version saved before the grid was a setting: what it had then. */
const CANVAS_LEGACY_GRID = 5;

/** A canvas area: a name and its size in pixels. */
export interface CanvasSpec {
  id: string;
  name: string;
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
  /** milliseconds since 1970 */
  createdAt: number;
}

/** What the page sends to make a canvas area. */
export type CanvasInput = Pick<CanvasSpec, 'name' | 'width' | 'height' | 'gridSize' | 'gridVisible' | 'placed'>;

/** A canvas area as it comes from outside (the page, the API): it checks itself. */
export class CanvasArea {
  constructor(readonly input: { name?: unknown; width?: unknown; height?: unknown; gridSize?: unknown; gridVisible?: unknown; placed?: unknown }) {}

  /** The canvas as it is stored, for a canvas that is allowed (`error()` is ''): only the known fields, the name trimmed, the objects as `PlacedBase.stored` gives them. */
  stored(): CanvasInput {
    const i = this.input;
    return {
      name: (i.name as string).trim(),
      width: i.width as number,
      height: i.height as number,
      gridSize: i.gridSize as number,
      gridVisible: i.gridVisible as boolean,
      placed: (i.placed as PlacedObject[]).map((p) => PlacedBase.stored(p)),
    };
  }

  /** A saved canvas as it is now: one that an older version saved lacked the grid (it gets the default, shown), and its objects are read as `PlacedBase.fromStored` says. */
  static fromStored(id: string, doc: Partial<CanvasSpec>): CanvasSpec {
    return {
      id,
      name: doc.name ?? '',
      width: doc.width ?? 800,
      height: doc.height ?? 600,
      gridSize: doc.gridSize ?? CANVAS_LEGACY_GRID,
      gridVisible: doc.gridVisible ?? true,
      placed: (doc.placed ?? []).map((p) => PlacedBase.fromStored(p)),
      createdAt: doc.createdAt ?? 0,
    };
  }

  /** The reason the canvas is not allowed, or '' when it is fine. */
  error(): string {
    const input = this.input;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return 'Give the canvas a name.';
    if (name.length > CANVAS_MAX_NAME) return `The name can be at most ${CANVAS_MAX_NAME} characters.`;
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
    return CanvasDiagram.validate(input.placed, input.width as number, input.height as number);
  }
}
