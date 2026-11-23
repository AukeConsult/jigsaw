import { Puzzle } from './puzzle';
import { PlacedFigure, PlacedObject } from './placed';
import { JigsawCategories } from './category';
import { JigsawLanguages } from './language';
import { JigsawMotives, MotiveLevel } from './motive';

// A saved jigsaw: its settings, and the check of what comes from outside.

/** The Firestore collection that holds the jigsaws. */
export const JIGSAW = 'jigsaw';

/** The smallest and largest side of a jigsaw, in pixels. */
export const JIGSAW_MIN_SIDE = 1;
export const JIGSAW_MAX_SIDE = 10000;
export const JIGSAW_MAX_NAME = 60;
/** The longest name of the picture file that is kept with a jigsaw. */
export const JIGSAW_MAX_PICTURE_NAME = 200;
/** The longest description of a jigsaw (a few sentences about the picture). */
export const JIGSAW_MAX_DESCRIPTION = 500;
/** The grid: pixels between two grid points. 0 = no grid. */
export const JIGSAW_MAX_GRID = 1000;
/** The grid of a jigsaw that an older version saved before the grid was a setting: what it had then. */
const LEGACY_GRID = 5;

/** How many times the height of the picture area the store frame of a jigsaw is: its pieces are spread over it and it scrolls. */
export const STORE_HEIGHT_FACTOR = 3;

/**
 * The free space beside the picture (when the store is below it, on a narrow screen) stands for stored places under the picture. When the room beside the picture is wider than the picture it is cut into
 * columns, each as wide as the picture, one under the other in the stored places: at most this many (the area has the room for them, `JigsawSettings.extent`).
 */
export const FREE_SPACE_COLUMNS_MAX = 12;

/** who sees a jigsaw in the lists: everyone (public), its owner and its players (private), or only its owner in the list of the owner's own jigsaws (hidden) */
export type JigsawVisibility = 'everyone' | 'owner' | 'hidden';
export const JIGSAW_VISIBILITIES: readonly JigsawVisibility[] = ['everyone', 'owner', 'hidden'];

/** What the kinds of visibility mean (what a document without one means is `everyone`). */
export class JigsawVisibilities {
  /** only its owner, and the players who have a round on it, may see it (private and hidden) */
  static restricted(visibility: string | undefined): boolean {
    return visibility === 'owner' || visibility === 'hidden';
  }

  /** it may be found: on the front page, in the search and among the popular jigsaws (a hidden one is only in the list of its owner's own jigsaws) */
  static listed(visibility: string | undefined): boolean {
    return visibility !== 'hidden';
  }
}

/** A jigsaw: a name and its size in pixels. */
export interface JigsawSpec {
  id: string;
  name: string;
  /** a jigsaw: who made it (the name of the author, as typed; without it, none is shown) */
  author?: string;
  /** a jigsaw: the UID of its owner, the user who is its author (chosen from the users; the API puts that user's name in `author`); without it, a jigsaw from before owners */
  ownerUid?: string;
  /** a jigsaw: who sees it: `everyone` (also when it says nothing: the default), `owner` (private: its owner and its players) or `hidden` (only in the list of its owner's own jigsaws, nowhere else); the last two need an owner */
  visibility?: JigsawVisibility;
  /** a jigsaw: a clock counts how long each round takes (also when it says nothing: the default); `false` means no clock */
  timed?: boolean;
  /** a jigsaw: the name of the picture file it was made from (kept as information; not shown while playing) */
  pictureName?: string;
  /** a jigsaw: a few words about the picture, shown on its page (a place, a day, a memory; optional) */
  description?: string;
  /** a jigsaw: the language its name and description are written in (a code of `JIGSAW_LANGUAGES`; English when it says nothing): the language of the user who made it, to begin with */
  language?: string;
  /** a jigsaw: the keys of the categories it is in (see `JigsawCategories`; none when it says nothing, at most `CATEGORIES_MAX_PER_JIGSAW`) */
  categories?: string[];
  /** a jigsaw: the motive difficulty, how hard the picture itself is to put together (see `JigsawMotives`; none when nobody has said it): a property of the jigsaw, not a category */
  motive?: MotiveLevel;
  /** horizontal size in pixels */
  width: number;
  /** vertical size in pixels */
  height: number;
  /** pixels between two grid points; 0 = no grid */
  gridSize: number;
  /** whether the grid points are shown (the grid size is kept when they are hidden) */
  gridVisible: boolean;
  /** the objects placed on the picture area */
  placed: PlacedObject[];
  /** a jigsaw: how wide its store frame is in pixels, beside the picture area (without it, 0: no store; see `JigsawSettings.storeFrame`) */
  storeWidth?: number;
  /** a jigsaw, a game setting: how close to the grid point it belongs on a piece has to be dropped to click into place, in percent of the grid size (0: never; without it, `JigsawSettings.DEFAULT_SNAP_PERCENT`) */
  snapPercent?: number;
  /** a jigsaw: how thick the frame around the picture area is, in pixels (0: no frame; without it, `JigsawSettings.DEFAULT_FRAME_WIDTH`); chosen when the jigsaw is made */
  frameWidth?: number;
  /** a jigsaw: how thick the line round each piece is, in pixels (0: none; without it, `JigsawSettings.DEFAULT_LINE_WIDTH`) */
  lineWidth?: number;
  /** a jigsaw: the colour of the line round each piece, as #rrggbb (without it, `JigsawSettings.DEFAULT_LINE_COLOR`) */
  lineColor?: string;
  /** a jigsaw: the background colour of the picture area inside the frame, as #rrggbb (without it, `JigsawSettings.DEFAULT_BACK_COLOR`) */
  backColor?: string;
  /** milliseconds since 1970 */
  createdAt: number;
  /**
   * OUTPUT ONLY, never stored: the key that lets the page read the picture of a jigsaw that is private or hidden (it is put on `?k=` of the address of the picture). The API adds it, in an answer, for the
   * people who may see such a jigsaw, and it is made again at every answer (it runs out after some hours). A jigsaw that everybody sees has none. Not in `JigsawInput`, so `stored()` never keeps it.
   */
  imageKey?: string;
}

/** What the page sends to make a jigsaw. */
export type JigsawInput = Pick<JigsawSpec, 'name' | 'author' | 'ownerUid' | 'visibility' | 'timed' | 'pictureName' | 'description' | 'categories' | 'motive' | 'language' | 'width' | 'height' | 'gridSize' | 'gridVisible' | 'placed' | 'storeWidth' | 'snapPercent' | 'frameWidth' | 'lineWidth' | 'lineColor' | 'backColor'>;

/** A jigsaw as it comes from outside (the page, the API): it checks itself. */
export class JigsawSettings {
  constructor(readonly input: { name?: unknown; author?: unknown; ownerUid?: unknown; visibility?: unknown; timed?: unknown; pictureName?: unknown; description?: unknown; categories?: unknown; motive?: unknown; language?: unknown; width?: unknown; height?: unknown; gridSize?: unknown; gridVisible?: unknown; placed?: unknown; storeWidth?: unknown; snapPercent?: unknown; frameWidth?: unknown; lineWidth?: unknown; lineColor?: unknown; backColor?: unknown }) {}

  /**
   * A side of a jigsaw whose grid points are half a step in from the edge, made to fit the grid: a whole number of steps (at least one, at most
   * what a jigsaw can be), so the last row and column of points are as far from the far edge as the first are from the near one. No grid: as it is.
   */
  static fittedSide(side: number, grid: number): number {
    if (!(grid > 0) || !Number.isFinite(side)) return side;
    let steps = Math.max(1, Math.round(side / grid));
    while (steps > 1 && steps * grid > JIGSAW_MAX_SIDE) steps--;
    return steps * grid;
  }

  /**
   * The store frame of a jigsaw (where its pieces wait): beside the picture area, `storeGap` from its right edge, as high
   * as `STORE_HEIGHT_FACTOR` times the height of the picture area and `storeWidth` wide; null when there is no store.
   */
  static storeFrame(width: number, height: number, grid: number, storeWidth: number | undefined): { left: number; width: number; height: number } | null {
    return storeWidth && storeWidth > 0 ? { left: width + JigsawSettings.storeGap(grid), width: storeWidth, height: STORE_HEIGHT_FACTOR * height } : null;
  }

  /** The room between the picture area and its store frame: an eighth of a grid step (a tiny gap, so the frame is close to the picture). */
  static storeGap(grid: number): number {
    return Math.round(Math.max(0, grid) / 8);
  }

  /** Everything the objects can be on: the picture area, and its store frame when it has one (one box, so an object is checked against it). */
  static extent(width: number, height: number, grid: number, storeWidth: number | undefined): { width: number; height: number } {
    const store = JigsawSettings.storeFrame(width, height, grid, storeWidth);
    return store ? { width: store.left + store.width, height: Math.max(height, store.height, JigsawSettings.freeSpaceBottom(height, grid)) } : { width, height };
  }

  /** Where the stored places of the free space beside the picture begin: a little under the picture (the picture, a grid step and half a piece). */
  static freeSpaceTop(height: number, grid: number): number {
    return height + grid + grid / 2;
  }

  /** How high a column of the free space is: as high as the picture and a step above and below it, so a piece can be taken all the way from it to the store. */
  static freeSpaceColumnHeight(height: number, grid: number): number {
    return height + 2 * grid;
  }

  /** The lowest stored place of the free space, with all its columns (the area is high enough for it). */
  static freeSpaceBottom(height: number, grid: number): number {
    return JigsawSettings.freeSpaceTop(height, grid) + FREE_SPACE_COLUMNS_MAX * JigsawSettings.freeSpaceColumnHeight(height, grid);
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

  /** What is said when a change is refused because the jigsaw has been played. */
  static readonly PLAYED_MESSAGE = 'This jigsaw has been played: its size, pieces, picture, difficulty and clock can not change.';

  /**
   * Whether a change of a jigsaw that has been played touches what every round of it shares: its size, its cut into pieces (the grid and the store), its difficulty or its
   * clock. A jigsaw that says nothing about its difficulty or clock has the default (the default difficulty, timed), so saying the default is not a change. Everything else
   * (the name, the description, the author, who sees it, the look) can still change.
   */
  static changesWhatPlayersShare(
    before: Pick<JigsawSpec, 'width' | 'height' | 'gridSize' | 'storeWidth' | 'snapPercent' | 'timed'>,
    after: { width?: unknown; height?: unknown; gridSize?: unknown; storeWidth?: unknown; snapPercent?: unknown; timed?: unknown },
  ): boolean {
    return (
      after.width !== before.width ||
      after.height !== before.height ||
      after.gridSize !== before.gridSize ||
      (after.storeWidth ?? 0) !== (before.storeWidth ?? 0) ||
      (after.snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT) !== (before.snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT) ||
      (after.timed !== false) !== (before.timed !== false)
    );
  }

  /** the snap range in pixels: a percent of the grid size */
  static snapRangePx(percent: number, grid: number): number {
    return grid > 0 && percent > 0 ? (percent / 100) * grid : 0;
  }

  /** The jigsaw as it is stored, for a jigsaw that is allowed (`error()` is ''): only the known fields, the name trimmed, the objects as `PlacedFigure.stored` gives them. */
  stored(): JigsawInput {
    const i = this.input;
    return {
      name: (i.name as string).trim(),
      ...(typeof i.author === 'string' && i.author.trim() ? { author: i.author.trim() } : {}),
      ...(typeof i.ownerUid === 'string' && i.ownerUid ? { ownerUid: i.ownerUid } : {}),
      ...(i.visibility === 'owner' || i.visibility === 'hidden' ? { visibility: i.visibility } : {}), // `everyone` is what none says
      ...(i.timed === false ? { timed: false } : {}), // timed is what none says
      ...(typeof i.pictureName === 'string' && i.pictureName.trim() ? { pictureName: i.pictureName.trim() } : {}),
      ...(typeof i.description === 'string' && i.description.trim() ? { description: i.description.trim() } : {}),
      ...(JigsawCategories.stored(i.categories).length ? { categories: JigsawCategories.stored(i.categories) } : {}),
      ...(JigsawMotives.is(i.motive) ? { motive: i.motive } : {}),
      ...(JigsawLanguages.is(i.language) ? { language: i.language } : {}),
      width: i.width as number,
      height: i.height as number,
      gridSize: i.gridSize as number,
      gridVisible: i.gridVisible as boolean,
      placed: (i.placed as PlacedObject[]).map((p) => PlacedFigure.stored(p)),
      ...(i.storeWidth ? { storeWidth: i.storeWidth as number } : {}),
      ...(i.snapPercent !== undefined ? { snapPercent: i.snapPercent as number } : {}),
      ...(i.frameWidth !== undefined ? { frameWidth: i.frameWidth as number } : {}),
      ...(i.lineWidth !== undefined ? { lineWidth: i.lineWidth as number } : {}),
      ...(i.lineColor !== undefined ? { lineColor: (i.lineColor as string).toLowerCase() } : {}),
      ...(i.backColor !== undefined ? { backColor: (i.backColor as string).toLowerCase() } : {}),
    };
  }

  /** A saved jigsaw as it is now: one that an older version saved lacked the grid (it gets the default, shown), and its objects are read as `PlacedFigure.fromStored` says. */
  static fromStored(id: string, doc: Partial<JigsawSpec>): JigsawSpec {
    return {
      id,
      name: doc.name ?? '',
      ...(doc.author ? { author: doc.author } : {}),
      ...(doc.ownerUid ? { ownerUid: doc.ownerUid } : {}),
      ...(doc.visibility === 'owner' || doc.visibility === 'hidden' ? { visibility: doc.visibility } : {}),
      ...(doc.timed === false ? { timed: false } : {}),
      ...(doc.pictureName ? { pictureName: doc.pictureName } : {}),
      ...(doc.description ? { description: doc.description } : {}),
      ...(JigsawCategories.stored(doc.categories).length ? { categories: JigsawCategories.stored(doc.categories) } : {}),
      ...(JigsawMotives.of(doc) ? { motive: JigsawMotives.of(doc) } : {}), // a motive difficulty that an older version kept among the categories is the property now
      ...(JigsawLanguages.is(doc.language) ? { language: doc.language } : {}),
      width: doc.width ?? 800,
      height: doc.height ?? 600,
      gridSize: doc.gridSize ?? LEGACY_GRID,
      gridVisible: doc.gridVisible ?? true,
      placed: (doc.placed ?? []).map((p) => PlacedFigure.fromStored(p)),
      ...(doc.storeWidth ? { storeWidth: doc.storeWidth } : {}),
      ...(doc.snapPercent !== undefined ? { snapPercent: doc.snapPercent } : {}),
      ...(doc.frameWidth !== undefined ? { frameWidth: doc.frameWidth } : {}),
      ...(doc.lineWidth !== undefined ? { lineWidth: doc.lineWidth } : {}),
      ...(doc.lineColor !== undefined ? { lineColor: doc.lineColor } : {}),
      ...(doc.backColor !== undefined ? { backColor: doc.backColor } : {}),
      createdAt: doc.createdAt ?? 0,
    };
  }

  /** The reason the jigsaw is not allowed, or '' when it is fine. */
  error(): string {
    const input = this.input;
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) return 'Give the jigsaw a name.';
    if (name.length > JIGSAW_MAX_NAME) return `The name can be at most ${JIGSAW_MAX_NAME} characters.`;
    if (input.author !== undefined && (typeof input.author !== 'string' || input.author.trim().length > JIGSAW_MAX_NAME)) return `The author can be at most ${JIGSAW_MAX_NAME} characters.`;
    if (input.ownerUid !== undefined && (typeof input.ownerUid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.ownerUid))) return 'The owner must be the id of a user.';
    if (input.timed !== undefined && typeof input.timed !== 'boolean') return 'Timed is yes or no.';
    if (input.visibility !== undefined && !(JIGSAW_VISIBILITIES as readonly unknown[]).includes(input.visibility)) return 'A jigsaw is public, private or hidden.';
    if (JigsawVisibilities.restricted(input.visibility as string) && !input.ownerUid) return 'A private or hidden jigsaw needs an owner: choose the author from the users.';
    if (input.pictureName !== undefined && (typeof input.pictureName !== 'string' || input.pictureName.trim().length > JIGSAW_MAX_PICTURE_NAME)) {
      return `The name of the picture file can be at most ${JIGSAW_MAX_PICTURE_NAME} characters.`;
    }
    if (input.description !== undefined && (typeof input.description !== 'string' || input.description.trim().length > JIGSAW_MAX_DESCRIPTION)) {
      return `The description can be at most ${JIGSAW_MAX_DESCRIPTION} characters.`;
    }
    if (input.categories !== undefined) {
      const bad = JigsawCategories.error(input.categories);
      if (bad) return bad;
    }
    const motive = JigsawMotives.error(input.motive);
    if (motive) return motive;
    const language = JigsawLanguages.error(input.language);
    if (language) return language;
    for (const [label, value] of [['Width', input.width], ['Height', input.height]] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < JIGSAW_MIN_SIDE || value > JIGSAW_MAX_SIDE) {
        return `${label} must be a whole number of pixels from ${JIGSAW_MIN_SIDE} to ${JIGSAW_MAX_SIDE}.`;
      }
    }
    const grid = input.gridSize;
    if (typeof grid !== 'number' || !Number.isInteger(grid) || grid < 0 || grid > JIGSAW_MAX_GRID) {
      return `The grid must be a whole number of pixels from 0 (no grid) to ${JIGSAW_MAX_GRID}.`;
    }
    if (typeof input.gridVisible !== 'boolean') return 'Say whether the grid is shown (true or false).';
    const store = input.storeWidth;
    if (store !== undefined && (typeof store !== 'number' || !Number.isInteger(store) || store < 0 || store > JIGSAW_MAX_SIDE)) {
      return `The store must be a whole number of pixels from 0 to ${JIGSAW_MAX_SIDE} wide.`;
    }
    const range = input.snapPercent;
    if (range !== undefined && (typeof range !== 'number' || !Number.isInteger(range) || range < 0 || range > 100)) {
      return 'The snap range must be a whole number of percent of the grid size, from 0 (a piece never clicks into place) to 100.';
    }
    const frame = input.frameWidth;
    if (frame !== undefined && (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0 || frame > JigsawSettings.MAX_FRAME_WIDTH)) {
      return `The frame must be a whole number of pixels from 0 (no frame) to ${JigsawSettings.MAX_FRAME_WIDTH}.`;
    }
    const lineWidth = input.lineWidth;
    if (lineWidth !== undefined && (typeof lineWidth !== 'number' || !Number.isInteger(lineWidth) || lineWidth < 0 || lineWidth > JigsawSettings.MAX_LINE_WIDTH)) {
      return `The line round the pieces must be a whole number of pixels from 0 (no line) to ${JigsawSettings.MAX_LINE_WIDTH}.`;
    }
    const lineColor = input.lineColor;
    if (lineColor !== undefined && (typeof lineColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(lineColor))) return 'The colour of the line round the pieces must be written as #rrggbb.';
    const back = input.backColor;
    if (back !== undefined && (typeof back !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(back))) return 'The background colour must be written as #rrggbb.';
    const extent = JigsawSettings.extent(input.width as number, input.height as number, grid, store);
    return Puzzle.validate(input.placed, extent.width, extent.height);
  }
}
