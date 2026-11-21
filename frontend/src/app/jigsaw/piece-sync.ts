import { effect, signal, untracked } from '@angular/core';
import { JigsawPiece, PieceMove } from '../models/shared/jigsaw';
import { JigsawPieceToSave } from './jigsaw-pieces.service';

/** idle: nothing to save, waiting: a change is waiting for the pause, saving, saved, failed */
export type PieceSyncState = 'idle' | 'waiting' | 'saving' | 'saved' | 'failed';

const PAUSE_MS = 800;
const RETRY_MS = 5000;

/** Where the pieces are saved (the pieces of a jigsaw in the database, or the positions of a game): the id is the one the sync works with. */
export interface PieceSyncApi {
  /** all the pieces, replacing what was there (a cut) */
  replace(id: string, pieces: JigsawPieceToSave[]): Promise<unknown>;
  /** where pieces are now */
  move(id: string, moves: PieceMove[]): Promise<unknown>;
  /** the same, for the moment the page is being closed: nothing waits for the answer */
  moveWhileLeaving(id: string, moves: PieceMove[]): void;
}

export interface PieceSyncOptions {
  /** the saved jigsaw that is open (null: not saved yet: the pieces wait for it) */
  jigsawId: () => string | null;
  /** the pieces on the page now (read in an effect: every signal it reads is watched) */
  pieces: () => JigsawPiece[];
  api: PieceSyncApi;
}

/** where a piece is, as text: what is saved of a piece while the game is played */
const placeOf = (p: JigsawPiece) => `${p.centerX},${p.centerY},${p.layer}`;

/**
 * Keeps the pieces of the open jigsaw in the database, a pause after the last change: the first save after a cut sends all the pieces with their graphics (the
 * old ones are replaced), after that only the pieces that were moved. Nothing is saved while the jigsaw is not saved itself (its pieces are saved when it is).
 * A failed save is tried again after a while. Create it where the page's component is made (it starts an effect).
 */
export class PieceSync {
  readonly state = signal<PieceSyncState>('idle');

  /** where each piece is in the database (as text) */
  private saved = new Map<string, string>();
  /** the jigsaw was cut: all the pieces are sent when the graphics are drawn */
  private replacing: Promise<ReadonlyMap<string, string>> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private busy = false;

  constructor(private readonly options: PieceSyncOptions) {
    effect(() => {
      const id = options.jigsawId();
      const pieces = options.pieces();
      untracked(() => {
        clearTimeout(this.timer);
        if (id && (this.replacing || this.moved(pieces).length)) {
          this.state.set('waiting');
          this.timer = setTimeout(() => void this.flush(), PAUSE_MS);
        }
      });
    });
  }

  /** What is on the page is what the database has (a saved jigsaw was opened, or a new one was started). */
  markSaved(pieces: readonly JigsawPiece[]): void {
    clearTimeout(this.timer);
    this.replacing = null;
    this.saved = new Map(pieces.map((p) => [p.id, placeOf(p)]));
    this.state.set('idle');
  }

  /** The jigsaw was cut (or its pieces came from an older save): all its pieces go to the database, with these graphics (a data address for each piece id) once they are drawn. */
  queueReplace(graphics: Promise<ReadonlyMap<string, string>>): void {
    this.replacing = graphics.catch(() => new Map<string, string>()); // pieces without a graphic are better than none
    this.state.set('waiting');
  }

  /** Leaving the page: what is waiting is saved now. */
  destroy(): void {
    clearTimeout(this.timer);
    if (this.state() === 'waiting' && this.options.jigsawId()) void this.flush();
  }

  /**
   * The page is being closed or hidden: the moves that wait for the pause are sent at once, so what the person did is not lost (the game is as they
   * left it when they come back). A cut that waits for its graphics cannot be sent this way.
   */
  leaving(): void {
    const id = this.options.jigsawId();
    if (!id || this.replacing) return;
    const moves: PieceMove[] = this.moved(this.options.pieces()).map((p) => ({ id: p.id, centerX: p.centerX, centerY: p.centerY, layer: p.layer }));
    if (!moves.length) return;
    clearTimeout(this.timer);
    this.options.api.moveWhileLeaving(id, moves);
    for (const p of this.options.pieces()) if (this.saved.has(p.id)) this.saved.set(p.id, placeOf(p));
    this.state.set('saved');
  }

  /** the pieces that are not where the database has them */
  private moved(pieces: readonly JigsawPiece[]): JigsawPiece[] {
    return pieces.filter((p) => this.saved.has(p.id) && this.saved.get(p.id) !== placeOf(p));
  }

  private async flush(): Promise<void> {
    const id = this.options.jigsawId();
    if (this.busy || !id) return;
    this.busy = true;
    this.state.set('saving');
    try {
      const pieces = this.options.pieces();
      if (this.replacing) {
        const graphics = await this.replacing;
        const send: JigsawPieceToSave[] = pieces.map((p) => (graphics.has(p.id) ? { ...p, graphic: graphics.get(p.id) } : p));
        await this.options.api.replace(id, send);
        this.saved = new Map(pieces.map((p) => [p.id, placeOf(p)]));
        this.replacing = null;
      } else {
        const moves: PieceMove[] = this.moved(pieces).map((p) => ({ id: p.id, centerX: p.centerX, centerY: p.centerY, layer: p.layer }));
        if (moves.length) await this.options.api.move(id, moves);
        for (const p of pieces) if (this.saved.has(p.id)) this.saved.set(p.id, placeOf(p));
      }
      this.state.set('saved');
    } catch {
      this.state.set('failed');
    } finally {
      this.busy = false;
    }
    // something moved while saving (or the save failed: try again after a while)
    const failed = this.state() === 'failed';
    if (failed || this.replacing || this.moved(this.options.pieces()).length) {
      this.timer = setTimeout(() => void this.flush(), failed ? RETRY_MS : PAUSE_MS);
    }
  }
}
