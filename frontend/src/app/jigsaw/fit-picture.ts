import { cssVar } from '../core/theme';
import { SourceRect } from '../models/shared/geometry';

/** The longest side a picture is made first, in pixels. */
const FIRST_SIDE_PX = 2400;
/** How the quality of the jpeg goes down while the picture is still too big. */
const QUALITIES = [0.85, 0.7, 0.55, 0.4];

/** A cut made to lie inside the picture (the cut of the page is exact, this only keeps a rounding error from reaching outside). */
function inside(cut: SourceRect, width: number, height: number): SourceRect {
  const w = Math.min(cut.w, width);
  const h = Math.min(cut.h, height);
  return { w, h, x: Math.min(Math.max(0, cut.x), width - w), y: Math.min(Math.max(0, cut.y), height - h) };
}

/**
 * The picture made to fit the jigsaw: cut to the shape of the picture area (`width` : `height`: the cut the person found, or the middle of the picture, the way it covers the picture area) and
 * small enough to keep in the document of the jigsaw (a Firestore document holds at most 1 MiB): drawn as a jpeg at up to twice the size of the picture area
 * (and no more than the picture has), with less quality and then fewer pixels until it is at most `maxBytes`. Throws when it cannot be read or cannot
 * be made small enough.
 */
export async function fitPicture(file: Blob, width: number, height: number, maxBytes: number, cut?: SourceRect): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const shape = width > 0 && height > 0 ? width / height : bitmap.width / bitmap.height;
  // the part of the picture that is used: the cut the person found, or what covers the picture area: all of one side, the middle of the other
  const wide = bitmap.width / bitmap.height > shape;
  const covering = wide
    ? { w: bitmap.height * shape, h: bitmap.height, x: (bitmap.width - bitmap.height * shape) / 2, y: 0 }
    : { w: bitmap.width, h: bitmap.width / shape, x: 0, y: (bitmap.height - bitmap.width / shape) / 2 };
  const source = cut ? inside(cut, bitmap.width, bitmap.height) : covering;
  let side = Math.min(FIRST_SIDE_PX, Math.max(width, height) * 2, Math.max(source.w, source.h)); // the longest side of the result
  for (let round = 0; round < 6; round++, side = Math.round(side * 0.75)) {
    const scale = side / Math.max(source.w, source.h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.w * scale));
    canvas.height = Math.max(1, Math.round(source.h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('The picture cannot be drawn.');
    ctx.fillStyle = cssVar('--app-picture-backdrop', 'white'); // a picture with see-through parts gets this behind it, not black (styles.scss)
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, source.x, source.y, source.w, source.h, 0, 0, canvas.width, canvas.height);
    for (const quality of QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= maxBytes) return blob;
    }
  }
  throw new Error('The picture cannot be made small enough.');
}
