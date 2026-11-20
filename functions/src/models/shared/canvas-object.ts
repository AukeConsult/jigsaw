/** The Firestore collection that holds the canvas objects. */
export const CANVAS_OBJECTS = 'canvas-objects';

/**
 * The two kinds of canvas object:
 *  - a figure is a shape (square, circle, triangle or histogram) with connection points around its outer border: 8, and 6 on a triangle;
 *  - a connector is a line with a connection point at each end.
 */
export const OBJECT_KINDS = ['figure', 'connector'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** The two kinds of connector: an arrow that points one way (to its end), and an arrow that points both ways. */
export const ARROW_TYPES = ['one-way', 'both-ways'] as const;
export type ArrowType = (typeof ARROW_TYPES)[number];

/** How the arrowheads of a connector look: solid (filled) or hollow (an outline). */
export const ARROW_STYLES = ['solid', 'hollow'] as const;
export type ArrowStyle = (typeof ARROW_STYLES)[number];

/** The shapes a figure can have. */
export const CANVAS_SHAPES = ['square', 'circle', 'triangle', 'histogram'] as const;
/** A connector is always a line. */
export type CanvasShape = (typeof CANVAS_SHAPES)[number] | 'line';

/** Square and circle have the same width and height; triangle and histogram have both. */
export const EQUAL_SIDE_SHAPES: readonly CanvasShape[] = ['square', 'circle'];

export const OBJECT_MIN_SIDE = 1;
export const OBJECT_MAX_SIDE = 10000;
export const OBJECT_MAX_BORDER = 100;
export const OBJECT_MAX_NAME = 60;
/** The rounding of the corners, in pixels (at most half of the shorter side; a circle has no corners). */
export const OBJECT_MAX_RADIUS = OBJECT_MAX_SIDE / 2;
export const OBJECT_MIN_FONT = 1;
export const OBJECT_MAX_FONT = 500;
/** The smallest a figure can be made by resizing, in pixels. */
export const MIN_RESIZED_SIDE_PX = 4;

/**
 * What every canvas object has: a name, an overall size, the colours and the font size.
 * These are the stored fields of the parent, `CanvasBaseObject`; a figure and an arrow add their own.
 */
export interface CanvasBaseObjectFields {
  id: string;
  kind: ObjectKind;
  name: string;
  /** overall default width in pixels (the length of an arrow) */
  width: number;
  /** overall default height in pixels (a solid arrow: its thickness; a hollow arrow: its size across) */
  height: number;
  /** #rrggbb */
  borderColor: string;
  /** #rrggbb */
  backgroundColor: string;
  /** #rrggbb: the colour in front of the background (the bars of a histogram, the text of the other shapes) */
  frontColor: string;
  /** default font size in pixels, for the text of the object */
  fontSize: number;
  /** milliseconds since 1970 */
  createdAt: number;
}

/** The stored fields a figure adds: a shape, and what goes with a shape, the border and the corners. */
export interface CanvasFigureFields extends CanvasBaseObjectFields {
  /** a connector is always a line */
  shape: CanvasShape;
  /** border thickness in pixels; 0 = no border (an arrow: the thickness of a solid one, or of the outline of a hollow one; at least 1) */
  borderWidth: number;
  /** how round the corners are, in pixels; 0 = sharp corners (a circle has none) */
  cornerRadius: number;
}

/**
 * The stored fields an arrow adds: a direction, and the look of its heads.
 * A solid arrow is a line (`borderWidth` is its thickness and `height` is the same); a hollow arrow is an outlined block arrow
 * (`height` is its size across and `borderWidth` is the thickness of its outline).
 */
export interface CanvasArrowFields extends CanvasFigureFields {
  arrow: ArrowType;
  arrowStyle: ArrowStyle;
}

/**
 * A saved canvas object, as it is stored: the whole chain, base object, figure and arrow. Every object is stored with all of these fields,
 * so a figure keeps the arrow fields at their defaults and an arrow has a line shape.
 */
export type CanvasObject = CanvasArrowFields;

/** What the page sends to make a canvas object. */
export type CanvasObjectInput = Omit<CanvasObject, 'id' | 'createdAt'>;

export const DEFAULT_OBJECT: CanvasObjectInput = {
  kind: 'figure',
  name: 'New object',
  shape: 'square',
  width: 100,
  height: 100,
  borderWidth: 2,
  borderColor: '#212529',
  backgroundColor: '#ffffff',
  frontColor: '#0d6efd',
  fontSize: 16,
  cornerRadius: 0,
  arrow: 'one-way',
  arrowStyle: 'solid',
};

export const DEFAULT_CONNECTOR: CanvasObjectInput = {
  ...DEFAULT_OBJECT,
  kind: 'connector',
  name: 'New connector',
  shape: 'line',
  width: 150,
  height: 2,
  borderWidth: 2,
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** A connection point of an object: where a connector can be fastened. */
export interface ConnectionPoint {
  /** a figure: n, ne, e, se, s, sw, w, nw (the compass directions from its centre; a triangle has n, ne, se, s, sw, nw); a connector: start (its left end), end (its right end) */
  id: string;
  /**
   * What a connector's end is. An arrow that points one way starts at `start` (the tail, no head) and ends at `end` (the tip, with the head).
   * An arrow that points both ways has two ends that are each a start and an end: both are 'start-end'.
   * A figure's points have no role: a connector can be fastened to them as its start or its end.
   */
  role?: 'start' | 'end' | 'start-end';
  /** pixels from the left edge of the object */
  x: number;
  /** pixels from the top edge of the object */
  y: number;
}

/** The 8 connection points of a figure, clockwise from the top, as directions from its centre (x to the right, y down). */
const FIGURE_POINTS: readonly { id: string; dx: number; dy: number }[] = [
  { id: 'n', dx: 0, dy: -1 },
  { id: 'ne', dx: 1, dy: -1 },
  { id: 'e', dx: 1, dy: 0 },
  { id: 'se', dx: 1, dy: 1 },
  { id: 's', dx: 0, dy: 1 },
  { id: 'sw', dx: -1, dy: 1 },
  { id: 'w', dx: -1, dy: 0 },
  { id: 'nw', dx: -1, dy: -1 },
];

/**
 * The parent of every canvas object: it holds the settings every object has (name, overall size, colours, font) and checks them.
 * Its children work on their own settings: a figure has a shape with its connection points, an arrow is a figure with a direction.
 *
 * The settings may come from outside (the API, a form) and not be checked yet: `error()` says if they are fine.
 */
export abstract class CanvasBaseObject {
  constructor(readonly data: CanvasObjectInput) {}

  /** The object for these settings: an arrow for a connector, a figure for anything else. */
  static of(data: Partial<CanvasObjectInput>): CanvasBaseObject {
    return data.kind === 'connector' ? new CanvasArrow(data as CanvasObjectInput) : new CanvasFigure(data as CanvasObjectInput);
  }

  /** where a connector can be fastened to this object, in pixels from its top-left corner (the size it has by default, they scale with the object) */
  /**
   * The settings that are stored for settings that are allowed: only the known fields (whatever else came with them is left out), the name
   * trimmed; a figure keeps the arrow settings at their defaults.
   */
  static stored(data: CanvasObjectInput): CanvasObjectInput {
    return {
      kind: data.kind,
      name: data.name.trim(),
      shape: data.shape,
      width: data.width,
      height: data.height,
      borderWidth: data.borderWidth,
      borderColor: data.borderColor,
      backgroundColor: data.backgroundColor,
      frontColor: data.frontColor,
      fontSize: data.fontSize,
      cornerRadius: data.cornerRadius,
      arrow: data.arrow ?? DEFAULT_OBJECT.arrow,
      arrowStyle: data.arrowStyle ?? DEFAULT_OBJECT.arrowStyle,
    };
  }

  /** The settings of an object that an older version saved, which lacked some fields: what it lacked gets its default (it is a figure, a solid arrow, a font of 16). */
  static fromStored(doc: Partial<CanvasObjectInput>): CanvasObjectInput {
    return { ...DEFAULT_OBJECT, ...doc };
  }

  abstract connectionPoints(): ConnectionPoint[];

  /**
   * These settings with the sizes scaled, for an object whose box is scaled by these factors along x and y (the sizes are whole pixels, never
   * outside what an object can be). Each kind of object scales what it has.
   */
  abstract scaledSettings(scaleX: number, scaleY: number): CanvasObjectInput;

  /** The smallest factors the object can be scaled by along x and y (none for what can be made as small as wanted). */
  minScale(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  /**
   * The factor for the sizes that scale evenly (a square, the thickness of an arrow): of the two factors the one that changed more, so they follow
   * the box when it is made bigger or smaller along one axis or along both.
   */
  evenScale(scaleX: number, scaleY: number): number {
    return Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  }

  /** the names of the two sizes, for the messages */
  protected sizeLabels(): readonly [string, string] {
    return ['Width', 'Height'];
  }

  /** The reason the settings are not allowed, or '' when they are fine. */
  error(): string {
    const d = this.data;
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!name) return 'Give the object a name.';
    if (name.length > OBJECT_MAX_NAME) return `The name can be at most ${OBJECT_MAX_NAME} characters.`;
    if (!OBJECT_KINDS.includes(d.kind)) return `The kind must be one of: ${OBJECT_KINDS.join(', ')}.`;
    const [widthLabel, heightLabel] = this.sizeLabels();
    for (const [label, value] of [[widthLabel, d.width], [heightLabel, d.height]] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < OBJECT_MIN_SIDE || value > OBJECT_MAX_SIDE) {
        return `${label} must be a whole number of pixels from ${OBJECT_MIN_SIDE} to ${OBJECT_MAX_SIDE}.`;
      }
    }
    for (const [label, value] of [['Border color', d.borderColor], ['Background color', d.backgroundColor], ['Front color', d.frontColor]] as const) {
      if (typeof value !== 'string' || !COLOR.test(value)) return `${label} must be a color like #rrggbb.`;
    }
    const font = d.fontSize;
    if (typeof font !== 'number' || !Number.isInteger(font) || font < OBJECT_MIN_FONT || font > OBJECT_MAX_FONT) {
      return `The font size must be a whole number of pixels from ${OBJECT_MIN_FONT} to ${OBJECT_MAX_FONT}.`;
    }
    return '';
  }
}

/** A figure is a base object with a shape, and what goes with a shape: the border and the corners. It has connection points around its outer border. */
export class CanvasFigure extends CanvasBaseObject {
  /** the shape must be one a figure can have (an arrow's is a line) */
  protected shapeError(): string {
    return CANVAS_SHAPES.includes(this.data.shape as (typeof CANVAS_SHAPES)[number]) ? '' : `The shape must be one of: ${CANVAS_SHAPES.join(', ')}.`;
  }

  /** the thinnest border (an arrow needs a thickness) */
  protected minBorder(): number {
    return 0;
  }

  protected borderMessage(): string {
    return `The border must be a whole number of pixels from 0 (no border) to ${OBJECT_MAX_BORDER}.`;
  }

  /** a circle has no corners, and an arrow is a line: only the other shapes have their corners limited to half of the shorter side */
  protected limitsCornerRadius(): boolean {
    return this.data.shape !== 'circle';
  }

  override error(): string {
    return super.error() || this.shapeError() || this.equalSidesError() || this.borderError() || this.cornerError();
  }

  /** a square and a circle have the same width and height; the other shapes have both */
  get equalSides(): boolean {
    return EQUAL_SIDE_SHAPES.includes(this.data.shape);
  }

  private equalSidesError(): string {
    const d = this.data;
    return this.equalSides && d.width !== d.height ? `A ${String(d.shape)} has the same width and height.` : '';
  }

  /** a figure is not made smaller than MIN_RESIZED_SIDE_PX */
  override minScale(): { x: number; y: number } {
    const least = MIN_RESIZED_SIDE_PX / Math.min(this.data.width, this.data.height); // both sides scale by one factor, so the shorter one decides
    return { x: least, y: least };
  }

  /**
   * A figure keeps its shape: both sides scale by the same factor (the one of the two that changed more, so it follows the box when that is made
   * bigger or smaller), so a square stays square, a circle round and a triangle as high as it was wide.
   */
  scaledSettings(scaleX: number, scaleY: number): CanvasObjectInput {
    const d = this.data;
    const factor = this.evenScale(scaleX, scaleY);
    const width = Math.max(MIN_RESIZED_SIDE_PX, Math.round(d.width * factor));
    const height = Math.max(MIN_RESIZED_SIDE_PX, Math.round(d.height * factor));
    return { ...d, width, height, cornerRadius: Math.min(d.cornerRadius, Math.floor(Math.min(width, height) / 2)) };
  }

  private borderError(): string {
    const border = this.data.borderWidth;
    const bad = typeof border !== 'number' || !Number.isInteger(border) || border < this.minBorder() || border > OBJECT_MAX_BORDER;
    return bad ? this.borderMessage() : '';
  }

  private cornerError(): string {
    const d = this.data;
    const radius = d.cornerRadius;
    if (typeof radius !== 'number' || !Number.isInteger(radius) || radius < 0 || radius > OBJECT_MAX_RADIUS) {
      return `The corner radius must be a whole number of pixels from 0 (sharp) to ${OBJECT_MAX_RADIUS}.`;
    }
    if (this.limitsCornerRadius() && radius > Math.floor(Math.min(d.width, d.height) / 2)) return 'The corner radius can be at most half of the shorter side.';
    return '';
  }

  /**
   * 8 points, on its outer border, where the line from its centre in each of the 8 directions meets the border
   * (a square and a histogram: the middle of each side and the corners, on the curve when a corner is rounded; a circle: on the circle);
   * a triangle has 6: its three corners and the middle of each of its three sides.
   */
  connectionPoints(): ConnectionPoint[] {
    const { width: w, height: h } = this.data;
    if (this.data.shape === 'triangle') {
      // the apex at the top, the corners of the base, and the middle of each side
      return [
        { id: 'n', x: w / 2, y: 0 },
        { id: 'ne', x: (w * 3) / 4, y: h / 2 },
        { id: 'se', x: w, y: h },
        { id: 's', x: w / 2, y: h },
        { id: 'sw', x: 0, y: h },
        { id: 'nw', x: w / 4, y: h / 2 },
      ];
    }
    const cx = w / 2;
    const cy = h / 2;
    return FIGURE_POINTS.map(({ id, dx, dy }) => {
      if (this.data.shape === 'circle') {
        const length = Math.hypot(dx, dy);
        return { id, x: cx + (dx / length) * cx, y: cy + (dy / length) * cy };
      }
      // square and histogram: the middle of a side, or a corner (a rounded corner: the point of its curve towards the corner)
      if (dx === 0 || dy === 0) return { id, x: cx + dx * cx, y: cy + dy * cy };
      const r = Math.min(this.data.cornerRadius, cx, cy);
      const k = r * (1 - Math.SQRT1_2); // how far the curve is from the corner, along each side
      return { id, x: cx + dx * (cx - k), y: cy + dy * (cy - k) };
    });
  }
}

/**
 * An arrow is a figure that has a direction: it points one way (to its end) or both ways, with solid or hollow heads.
 * It is a connector: it has a connection point at each end. An arrow that points one way has a start and an end, an arrow that points both ways
 * has two points that are each both a start and an end.
 */
export class CanvasArrow extends CanvasFigure {
  /** a hollow arrow is an outlined block arrow with a height of its own; a solid arrow is a line */
  get hollow(): boolean {
    return this.data.arrowStyle === 'hollow';
  }

  protected override sizeLabels(): readonly [string, string] {
    return ['Length', this.hollow ? 'Height' : 'Thickness'];
  }

  protected override shapeError(): string {
    return this.data.shape === 'line' ? '' : 'The shape of a connector is a line.';
  }

  protected override minBorder(): number {
    return 1;
  }

  protected override borderMessage(): string {
    return `The thickness must be a whole number of pixels from 1 to ${OBJECT_MAX_BORDER}.`;
  }

  protected override limitsCornerRadius(): boolean {
    return false;
  }

  override error(): string {
    return super.error() || this.arrowError();
  }

  /** a direction, a head style, and a height that fits: a solid arrow's is its thickness, a hollow arrow's outline is at most half of it */
  private arrowError(): string {
    const d = this.data;
    if (!ARROW_TYPES.includes(d.arrow)) return `The arrow must be one of: ${ARROW_TYPES.join(', ')}.`;
    if (!ARROW_STYLES.includes(d.arrowStyle)) return `The arrow head must be one of: ${ARROW_STYLES.join(', ')}.`;
    if (this.hollow) {
      if (d.borderWidth * 2 > d.height) return 'The outline of a hollow arrow can be at most half of its height.';
    } else if (d.height !== d.borderWidth) {
      return 'The height of a solid arrow is its thickness.';
    }
    return '';
  }

  /** how wide it is across: the thickness of a solid arrow (its height is the same), the height of a hollow arrow */
  get across(): number {
    return this.data.height;
  }

  /**
   * These settings with this width across, in whole pixels: the thickness of a solid arrow (from 1 to OBJECT_MAX_BORDER; its height is the same), the
   * height of a hollow arrow (at least twice its outline, at most OBJECT_MAX_SIDE).
   */
  withAcross(size: number): CanvasObjectInput {
    const d = this.data;
    const pixels = Math.round(size);
    if (this.hollow) return { ...d, height: Math.min(OBJECT_MAX_SIDE, Math.max(2 * d.borderWidth, pixels)) };
    const thickness = Math.min(OBJECT_MAX_BORDER, Math.max(1, pixels));
    return { ...d, borderWidth: thickness, height: thickness };
  }

  /** an arrow can be stretched to almost nothing */
  override minScale(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  /**
   * The length of an arrow is stretched by its ends, not here. Its thickness scales evenly like a square: the thickness of a solid arrow (its height is
   * the same), the height and the outline of a hollow one (the outline stays at most half of the height). A thickness is at least a pixel.
   */
  override scaledSettings(scaleX: number, scaleY: number): CanvasObjectInput {
    const d = this.data;
    const factor = this.evenScale(scaleX, scaleY);
    const thickness = Math.min(OBJECT_MAX_BORDER, Math.max(1, Math.round(d.borderWidth * factor)));
    const height = this.hollow ? Math.min(OBJECT_MAX_SIDE, Math.max(2 * thickness, Math.round(d.height * factor))) : thickness;
    return { ...d, borderWidth: thickness, height };
  }

  override connectionPoints(): ConnectionPoint[] {
    const { width: w, height: h } = this.data;
    const both = this.data.arrow === 'both-ways';
    return [
      { id: 'start', x: 0, y: h / 2, role: both ? 'start-end' : 'start' },
      { id: 'end', x: w, y: h / 2, role: both ? 'start-end' : 'end' },
    ];
  }
}
