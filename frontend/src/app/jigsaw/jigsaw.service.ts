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

  /** Deletes a jigsaw for good, with its pieces, picture and all its rounds. Says who asks: only the owner of a jigsaw that has one may. */
  removeAs(id: string, userId: string): Promise<unknown> {
    return firstValueFrom(this.client.delete(`${environment.jigsawApi}/jigsaw/${encodeURIComponent(id)}`, { headers: { 'X-Jigsaw-User': userId } }));
  }
}
