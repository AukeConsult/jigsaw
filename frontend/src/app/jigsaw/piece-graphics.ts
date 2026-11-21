import { cssVar } from '../core/theme';
import { JigsawCut, JigsawPiece } from '../models/shared/jigsaw';

/** How far the tabs of a piece reach out of its square, as a share of its side (a little more than they do, so the outline is not cut). */
const TAB_REACH = 0.35;
/** The longest side of the graphic of a piece, in pixels: a piece on a big grid is drawn smaller than its size (its graphic is kept small). */
const MAX_GRAPHIC_SIDE_PX = 256;

/**
 * The graphic of each piece: a small picture of the piece with its outline, cut out of the picture of the jigsaw (the picture covers `columns` × `rows` pieces
 * of the size of a piece), with a see-through background, as a data address of a webp (a png where the browser cannot make webp). It is kept with the piece in the
 * database. Pieces that cannot be drawn are left out.
 */
export async function renderPieceGraphics(pictureUrl: string, pieces: readonly JigsawPiece[], columns: number, rows: number): Promise<Map<string, string>> {
  const graphics = new Map<string, string>();
  const bitmap = await createImageBitmap(await (await fetch(pictureUrl)).blob());
  for (const piece of pieces) {
    const size = piece.size;
    const margin = Math.ceil(size * TAB_REACH);
    const side = size + 2 * margin; // the graphic holds the piece and its tabs
    const scale = Math.min(2, MAX_GRAPHIC_SIDE_PX / side); // device pixels per pixel of the jigsaw
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(side * scale));
    canvas.height = canvas.width;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.scale(scale, scale);
    ctx.translate(margin, margin);
    const outline = new Path2D(JigsawCut.path(size, piece));
    ctx.save();
    ctx.clip(outline);
    ctx.drawImage(bitmap, -piece.col * size, -piece.row * size, columns * size, rows * size);
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cssVar('--app-piece-outline', 'gray'); // the outline of a piece, from the look (styles.scss)
    ctx.stroke(outline);
    graphics.set(piece.id, canvas.toDataURL('image/webp', 0.8));
  }
  bitmap.close();
  return graphics;
}
