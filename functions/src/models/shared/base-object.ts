
// The settings of a placed object. The jigsaw only places pieces, which are square figures: a name and a size is all an object has.

export const OBJECT_MIN_SIDE = 1;
export const OBJECT_MAX_SIDE = 10000;
export const OBJECT_MAX_NAME = 60;

/** The settings of a placed object: its name and its size in pixels. */
export interface ObjectInput {
  name: string;
  /** width in pixels */
  width: number;
  /** height in pixels */
  height: number;
}

export const DEFAULT_OBJECT: ObjectInput = {
  name: 'New object',
  width: 100,
  height: 100,
};

/**
 * The settings of an object, and the check of them. They may come from outside (the API, a form) and not be checked yet: `error()` says if they are fine.
 */
export class BaseObject {
  constructor(readonly data: ObjectInput) {}

  static of(data: Partial<ObjectInput>): BaseObject {
    return new BaseObject(data as ObjectInput);
  }

  /** The settings that are stored for settings that are allowed: only the known fields (whatever else came with them is left out), the name trimmed. */
  static stored(data: ObjectInput): ObjectInput {
    return { name: data.name.trim(), width: data.width, height: data.height };
  }

  /**
   * The settings of an object that an older version saved: what it lacked gets its default, and what only an older version had (a shape, colours, a font,
   * the settings of an arrow ...) is left out.
   */
  static fromStored(doc: Partial<ObjectInput>): ObjectInput {
    return { name: doc.name ?? DEFAULT_OBJECT.name, width: doc.width ?? DEFAULT_OBJECT.width, height: doc.height ?? DEFAULT_OBJECT.height };
  }

  /** The reason the settings are not allowed, or '' when they are fine. */
  error(): string {
    const d = this.data;
    const name = typeof d.name === 'string' ? d.name.trim() : '';
    if (!name) return 'Give the object a name.';
    if (name.length > OBJECT_MAX_NAME) return `The name can be at most ${OBJECT_MAX_NAME} characters.`;
    for (const [label, value] of [['Width', d.width], ['Height', d.height]] as const) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < OBJECT_MIN_SIDE || value > OBJECT_MAX_SIDE) {
        return `${label} must be a whole number of pixels from ${OBJECT_MIN_SIDE} to ${OBJECT_MAX_SIDE}.`;
      }
    }
    return '';
  }
}
