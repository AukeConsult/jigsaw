// The shape of a picture tile where pictures are shown in their own shapes (the home page, a package), as its width for each unit of its height: the tile shows its picture in the picture's own shape, the shapes of a phone camera too (to 9:21 and 21:9);
// only one wider or taller than that is cut, so no tile is a thin strip or a long band.

export class TileShapes {
  /** the shape of a tile with no picture of its own to follow (information, an offer, a package), and of the tile that says how many fit in a line */
  static readonly PLAIN = 4 / 3;
  static readonly NARROWEST = 2 / 5;
  static readonly WIDEST = 5 / 2;

  /** The shape of the tile of a picture of this size; the plain one when the size is not known. */
  static of(width: unknown, height: unknown): number {
    if (!(typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0)) return TileShapes.PLAIN;
    return Math.min(TileShapes.WIDEST, Math.max(TileShapes.NARROWEST, width / height));
  }
}
