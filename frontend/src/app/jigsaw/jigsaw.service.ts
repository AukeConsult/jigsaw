import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { JigsawInput, JigsawSpec } from '../models/shared/jigsaw-settings';
import { Difficulty, JigsawFacets, JigsawSummary, SearchSort, SizeClass } from '../models/shared/jigsaw-search';
import { ApiCollection } from '../core/api-collection';

/** What is looked for: a field that is null or left out does not narrow the search. */
export interface JigsawSearchRequest {
  categories?: string[] | null;
  sizes?: SizeClass[] | null;
  difficulties?: Difficulty[] | null;
  languages?: string[] | null;
  owners?: string[] | null;
  favorites?: true | null;
  text?: string | null;
  sort?: SearchSort;
  limit?: number;
  page?: number;
}

/** A page of what was found, with how many there are in all. */
export interface JigsawSearchAnswer {
  items: JigsawSummary[];
  total: number;
  hasMore: boolean;
}

/** The saved jigsaw pages (collection `jigsaw`, through the API): jigsaws like the others, kept in their own collection. */
@Injectable({ providedIn: 'root' })
export class JigsawService extends ApiCollection<JigsawInput, JigsawSpec> {
  private readonly client = inject(HttpClient);

  constructor() {
    super(inject(HttpClient), `${environment.jigsawApi}/jigsaw`);
  }

  /** Looks for jigsaws (one query on the server, which reads only what a list needs): the ones the person may see that match, a page of them. */
  search(request: JigsawSearchRequest): Promise<JigsawSearchAnswer> {
    return firstValueFrom(this.client.get<JigsawSearchAnswer>(`${environment.jigsawApi}/jigsaw-search`, { params: this.params(request) }));
  }

  /** The question as the parameters of an address: a list is written with commas, and what is null or left out is not there. */
  private params(request: JigsawSearchRequest): HttpParams {
    let params = new HttpParams();
    for (const [name, value] of Object.entries(request)) if (value !== null && value !== undefined) params = params.set(name, Array.isArray(value) ? value.join(',') : String(value));
    return params;
  }

  /** How many jigsaws there are for each choice of the filter, with the rest of it kept (and how many match all of it): what is shown beside each tick. */
  facets(request: JigsawSearchRequest): Promise<JigsawFacets> {
    return firstValueFrom(this.client.get<JigsawFacets>(`${environment.jigsawApi}/jigsaw-search/facets`, { params: this.params(request) }));
  }

  /**
   * The AI looks at the picture of the jigsaw and says its categories, a name and a description (the texts in the language of the jigsaw). With `apply` they are also put on the
   * jigsaw. Only the owner may. Throws when the AI cannot be asked or fails (the error says why).
   */
  classify(id: string, apply = false, language?: string): Promise<{ categories: string[]; name: string; description: string; applied: boolean }> {
    let params = new HttpParams();
    if (apply) params = params.set('apply', 'true');
    if (language) params = params.set('language', language); // the texts in this language (and with apply the jigsaw gets it), not the language the jigsaw has
    return firstValueFrom(this.client.post<{ categories: string[]; name: string; description: string; applied: boolean }>(`${environment.jigsawApi}/jigsaw/${encodeURIComponent(id)}/classify`, null, { params }));
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
