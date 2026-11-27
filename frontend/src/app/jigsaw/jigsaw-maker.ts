import { Injectable, inject } from '@angular/core';
import { JigsawCut, JigsawPieces } from '../models/shared/jigsaw';
import { PlacedObject } from '../models/shared/placed';
import { JIGSAW_MAX_PICTURE_NAME, JIGSAW_MAX_NAME, JIGSAW_MAX_SIDE, JIGSAW_MIN_SIDE, JigsawInput, JigsawSettings, JigsawSpec } from '../models/shared/jigsaw-settings';
import { JigsawKind, JigsawKinds } from '../models/shared/jigsaw-kind';
import { JigsawUserSpec } from '../models/shared/jigsaw-user';
import { MAX_PICTURE_BYTES, fitPicture } from './fit-picture';
import { JigsawImageService } from './jigsaw-image.service';
import { JigsawPiecesService } from './jigsaw-pieces.service';
import { JigsawService } from './jigsaw.service';

/** What the jigsaws that are made are like: the same for every picture. */
export interface MakeOptions {
  /** the picture belongs to this package (`packageId`): it is public, as the package is, and is not in the general list */
  packageId?: string;
  /** a picture (nothing is cut: each round is) or a ready jigsaw (what none says) */
  kind?: JigsawKind;
  /** about how many pieces (the picture area is made a whole number of pieces wide and high, so it can differ a little) */
  pieces: number;
  /** how wide the picture area is, in pixels (its height follows the shape of the picture) */
  width: number;
  /** the snap range, in percent of the grid (the difficulty) */
  snapPercent: number;
  timed: boolean;
  /** the language the name and the description are written in */
  language: string;
}

/** Where a jigsaw is on its way. */
export type MakeStep = 'cutting' | 'uploading' | 'keeping';

/** A name for a jigsaw from the name of its picture file: no extension, spaces for _ and -, at most as long as a name can be. */
export function nameOfFile(fileName: string): string {
  const name = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (name || 'Jigsaw').slice(0, JIGSAW_MAX_NAME);
}

/**
 * Makes a jigsaw of a picture, all in one: the picture is cut to the shape of the picture area, the jigsaw is saved with its picture, and then its pieces. What a person
 * does one picture at a time on the page that adds a picture, for many pictures. The owner is the user who plays. A jigsaw that could not be made is taken away again, so nothing half
 * made is left (and the error is thrown).
 */
@Injectable({ providedIn: 'root' })
export class JigsawMaker {
  private readonly jigsaws = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly pieceApi = inject(JigsawPiecesService);

  async make(file: File, owner: JigsawUserSpec, options: MakeOptions, step: (s: MakeStep) => void = () => undefined): Promise<JigsawSpec> {
    if (options.kind === 'picture') return this.makePicture(file, owner, options, step);
    step('cutting');
    // the picture area has the shape of the picture, and is cut into whole pieces
    const bitmap = await createImageBitmap(file);
    const shape = bitmap.width / bitmap.height;
    bitmap.close();
    const width = Math.min(JIGSAW_MAX_SIDE, Math.max(JIGSAW_MIN_SIDE, options.width));
    const height = Math.min(JIGSAW_MAX_SIDE, Math.max(JIGSAW_MIN_SIDE, Math.round(width / shape)));
    const layout = JigsawCut.layoutFor(width, height, options.pieces);
    const cutting = JigsawCut.cut(layout.width, layout.height, layout.grid);
    if ('error' in cutting) throw new Error(cutting.error);
    const picture = await fitPicture(file, layout.width, layout.height, MAX_PICTURE_BYTES);

    const input: JigsawInput = {
      name: nameOfFile(file.name),
      author: owner.name,
      ownerUid: owner.id,
      ...(options.packageId ? { packageId: options.packageId } : { visibility: 'owner' as const }), // a picture of a package is public; a jigsaw that is made is private to begin with: its owner looks at it, and makes it public when it is good
      ...(options.timed ? {} : { timed: false }),
      pictureName: file.name.slice(0, JIGSAW_MAX_PICTURE_NAME),
      language: options.language,
      width: layout.width,
      height: layout.height,
      gridSize: layout.grid,
      gridVisible: false,
      placed: [],
      snapPercent: options.snapPercent,
      lineWidth: JigsawSettings.DEFAULT_LINE_WIDTH,
      lineColor: JigsawSettings.DEFAULT_LINE_COLOR,
      backColor: JigsawSettings.DEFAULT_BACK_COLOR,
      storeWidth: cutting.storeWidth,
    };
    step('uploading');
    return this.createWithPicture(input, picture, async (made) => {
      step('keeping');
      await this.keepPieces(made.id, cutting);
    });
  }

  /**
   * Saves a new jigsaw with its picture, and then does what else it needs (`then`: its pieces). When a step fails the jigsaw is taken away again, so nothing half made is left, and the error is thrown. What every
   * way of making one shares: many at once (here) and the form of a picture.
   */
  async createWithPicture(input: JigsawInput, picture: Blob, then?: (made: JigsawSpec) => Promise<void>): Promise<JigsawSpec> {
    const made = await this.jigsaws.create(input);
    try {
      await this.images.upload(made.id, picture);
      await then?.(made);
    } catch (err) {
      await this.jigsaws.remove(made.id).catch(() => undefined);
      throw err;
    }
    return made;
  }

  /** Keeps the pieces of a cut under the jigsaw, in place of any it had. (The board draws them from the picture.) */
  async keepPieces(id: string, cutting: { placed: readonly PlacedObject[]; columns: number; rows: number }): Promise<void> {
    await this.pieceApi.replace(id, JigsawPieces.ofCut(cutting));
  }

  /**
   * Makes a picture entry of a picture: the whole picture at the size `JigsawKinds.pictureSize` says, saved with its picture and nothing else (no cut, no pieces, no graphics: each round of it is cut
   * as the person who plays chooses). A picture that could not be saved is taken away again.
   */
  private async makePicture(file: File, owner: JigsawUserSpec, options: MakeOptions, step: (s: MakeStep) => void): Promise<JigsawSpec> {
    step('cutting');
    const bitmap = await createImageBitmap(file);
    const size = JigsawKinds.pictureSize(bitmap.width, bitmap.height);
    bitmap.close();
    const picture = await fitPicture(file, size.width, size.height, MAX_PICTURE_BYTES);
    const input: JigsawInput = {
      name: nameOfFile(file.name),
      author: owner.name,
      ownerUid: owner.id,
      kind: 'picture',
      ...(options.packageId ? { packageId: options.packageId } : { visibility: 'owner' as const }), // a picture of a package is public (its owner makes the package, and may change it); another is private to begin with: its owner looks at it, and makes it public when it is good
      ...(options.timed ? {} : { timed: false }),
      pictureName: file.name.slice(0, JIGSAW_MAX_PICTURE_NAME),
      language: options.language,
      width: size.width,
      height: size.height,
      gridSize: 0,
      gridVisible: false,
      placed: [],
      lineWidth: JigsawSettings.DEFAULT_LINE_WIDTH,
      lineColor: JigsawSettings.DEFAULT_LINE_COLOR,
      backColor: JigsawSettings.DEFAULT_BACK_COLOR,
    };
    step('uploading');
    return this.createWithPicture(input, picture);
  }
}
