import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { JigsawPiece, PieceMove } from '../models/shared/jigsaw';

/** A piece as it is sent when the jigsaw is cut: with its graphic, a data address of a small picture of the piece. */
export type JigsawPieceToSave = JigsawPiece & { graphic?: string };

/** The pieces of a jigsaw in the database (the API keeps them under the jigsaw document, and their graphics as files). */
@Injectable({ providedIn: 'root' })
export class JigsawPiecesService {
  private readonly http = inject(HttpClient);

  private base(id: string): string {
    return `${environment.jigsawApi}/jigsaw-pieces/${encodeURIComponent(id)}`;
  }

  /** the pieces of a saved jigsaw, by number (without their graphics) */
  async list(id: string): Promise<JigsawPiece[]> {
    return (await firstValueFrom(this.http.get<{ pieces: JigsawPiece[] }>(this.base(id)))).pieces;
  }

  /** all the pieces of the jigsaw, replacing what was there (the jigsaw was cut again) */
  replace(id: string, pieces: JigsawPieceToSave[]): Promise<unknown> {
    return firstValueFrom(this.http.put(this.base(id), { pieces }));
  }

  /** where pieces are now, and on which layer */
  move(id: string, moves: PieceMove[]): Promise<unknown> {
    return firstValueFrom(this.http.patch(this.base(id), { moves }));
  }

  /** The same, for the moment the page is being closed: the request goes on after the page is gone (`keepalive`; nothing waits for the answer). */
  moveWhileLeaving(id: string, moves: PieceMove[]): void {
    fetch(this.base(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moves }), keepalive: true }).catch(() => undefined);
  }

  /** where the graphic of a piece can be read */
  graphicUrl(id: string, pieceId: string): string {
    return `${this.base(id)}/graphic/${encodeURIComponent(pieceId)}`;
  }
}
