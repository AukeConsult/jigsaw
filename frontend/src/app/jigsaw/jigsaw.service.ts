import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { JigsawInput, JigsawSpec } from '../models/shared/jigsaw-settings';
import { ApiCollection } from '../core/api-collection';

/** The saved jigsaw pages (collection `jigsaw`, through the API): jigsaws like the others, kept in their own collection. */
@Injectable({ providedIn: 'root' })
export class JigsawService extends ApiCollection<JigsawInput, JigsawSpec> {
  private readonly client = inject(HttpClient);

  constructor() {
    super(inject(HttpClient), `${environment.jigsawApi}/jigsaw`);
  }

  /** The most popular jigsaws the person may see (at most ten), the best first: by the rounds played and by being new. The server ranks them (`Popularity`). */
  popular(): Promise<JigsawSpec[]> {
    return firstValueFrom(this.client.get<JigsawSpec[]>(`${environment.jigsawApi}/jigsaw-popular`));
  }

  /** Deletes a jigsaw for good, with its pieces, picture and all its rounds. Says who asks: only the owner of a jigsaw that has one may. */
  removeAs(id: string, userId: string): Promise<unknown> {
    return firstValueFrom(this.client.delete(`${environment.jigsawApi}/jigsaw/${encodeURIComponent(id)}`, { headers: { 'X-Jigsaw-User': userId } }));
  }
}
