import { cssVar } from '../core/theme';

/** The side of the picture of an account, in pixels: at most 128, since it is shown small in lists. */
const SIDE = 128;

/**
 * Makes the picture of an account from a file the person chose: the middle of it as a square, shrunk to `SIDE` pixels and saved as a JPEG (a data address, which is what the account keeps).
 * Fails when the file is not a picture the browser can read.
 */
export async function pictureFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = SIDE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas.');
    context.fillStyle = cssVar('--bs-body-bg', 'white'); // a picture with holes in it would be black as a JPEG
    context.fillRect(0, 0, SIDE, SIDE);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    bitmap.close();
  }
}
