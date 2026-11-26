import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { JigsawPiece } from '../models/shared/jigsaw';

/** A piece as it is sent when the jigsaw is cut: with its graphic, a data address of a small picture of the piece. */
export type JigsawPieceToSave = JigsawPiece & { graphic?: string };

/** The pieces of a jigsaw in the database (the API keeps them under the jigsaw document, and their graphics as files). */
@Injectable({ providedIn: 'root' })
export class JigsawPiecesService {
  private readonly http = inject(HttpClient);

  private base(id: string): string {
    return `${environment.jigsawApi}/jigsaw-pieces/${encodeURIComponent(id)}`;
  }

  /** all the pieces of the jigsaw, replacing what was there (the jigsaw was cut again) */
  replace(id: string, pieces: JigsawPieceToSave[]): Promise<unknown> {
    return firstValueFrom(this.http.put(this.base(id), { pieces }));
  }
}
