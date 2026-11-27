import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { JigsawPiece } from '../models/shared/jigsaw';

/** The pieces of a jigsaw in the database (the API keeps them under the jigsaw document). */
@Injectable({ providedIn: 'root' })
export class JigsawPiecesService {
  private readonly http = inject(HttpClient);

  private base(id: string): string {
    return `${environment.jigsawApi}/jigsaw-pieces/${encodeURIComponent(id)}`;
  }

  /** all the pieces of the jigsaw, replacing what was there (the jigsaw was cut again) */
  replace(id: string, pieces: JigsawPiece[]): Promise<unknown> {
    return firstValueFrom(this.http.put(this.base(id), { pieces }));
  }
}
