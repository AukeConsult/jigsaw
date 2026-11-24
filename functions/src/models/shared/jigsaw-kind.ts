// The kind of a jigsaw entry: a ready jigsaw (cut into pieces when it is made, with its number of pieces and its difficulty fixed in the document) or a picture
// (only the stored picture: the pieces and the difficulty are chosen in each round).

/** `jigsaw`: a ready jigsaw (what a document that says nothing is); `picture`: only a picture, cut anew in each round. */
export type JigsawKind = 'jigsaw' | 'picture';
export const JIGSAW_KINDS: readonly JigsawKind[] = ['jigsaw', 'picture'];

/** How wide the stored picture of a picture entry is to begin with, in pixels (its height follows the shape of the picture). */
export const PICTURE_DEFAULT_WIDTH = 1200;
/** The longest side of the picture of a picture entry, in pixels (rounds are cut from it, so it is sharp enough, and a file stays small). */
export const PICTURE_MAX_SIDE = 2000;

/** The rules of the kinds. One place, so the forms, the pages, the search and the API cannot disagree. */
export class JigsawKinds {
  /** Whether this is a kind. */
  static is(value: unknown): value is JigsawKind {
    return JIGSAW_KINDS.includes(value as JigsawKind);
  }

  /** The kind a document has: `picture` when it says so, else a ready jigsaw (every document from before kinds). */
  static of(doc: { kind?: unknown }): JigsawKind {
    return doc.kind === 'picture' ? 'picture' : 'jigsaw';
  }

  /** Whether the entry is only a picture. */
  static isPicture(doc: { kind?: unknown }): boolean {
    return JigsawKinds.of(doc) === 'picture';
  }

  /**
   * The size the stored picture of a picture entry gets from the picture it is made of: `PICTURE_DEFAULT_WIDTH` wide (not wider than the picture itself), as high as the shape of the
   * picture says, and never more than `PICTURE_MAX_SIDE` on its longest side (a tall picture is made smaller to fit). Whole pixels, at least 1.
   */
  static pictureSize(pictureWidth: number, pictureHeight: number): { width: number; height: number } {
    const shape = Math.max(1, pictureWidth) / Math.max(1, pictureHeight);
    let width = Math.min(PICTURE_DEFAULT_WIDTH, Math.max(1, pictureWidth));
    let height = width / shape;
    const scale = Math.min(1, PICTURE_MAX_SIDE / Math.max(width, height));
    width *= scale;
    height *= scale;
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  /** The reason a kind is not allowed, or '' (none is fine: a ready jigsaw). */
  static error(value: unknown): string {
    return value === undefined || JigsawKinds.is(value) ? '' : 'A jigsaw entry is a ready jigsaw or a picture.';
  }
}
