import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { JigsawInput, JigsawSpec } from '../models/shared/jigsaw-settings';
import { JigsawKind } from '../models/shared/jigsaw-kind';
import { MotiveLevel } from '../models/shared/motive';
import { Difficulty, JigsawFacets, JigsawSearch, JigsawSummary, MineAnswer, MineShown, SearchSort, SizeClass } from '../models/shared/jigsaw-search';
import { ApiCollection } from '../core/api-collection';

/** What is looked for: a field that is null or left out does not narrow the search. */
export interface JigsawSearchRequest {
  kinds?: JigsawKind[] | null;
  categories?: string[] | null;
  sizes?: SizeClass[] | null;
  difficulties?: Difficulty[] | null;
  motives?: MotiveLevel[] | null;
  languages?: string[] | null;
  owners?: string[] | null;
  favorites?: true | null;
  solved?: true | null;
  visibilities?: string[] | null;
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

  /**
   * A page of the jigsaws of one user, also the private and the hidden ones, for the page where the user looks after them: with words, who sees them, an order and the page asked for;
   * with how many there are for each choice of who sees them. Only the user can ask for their own (the header says who asks).
   */
  async mineSearch(userId: string, query: { text?: string; sort: SearchSort; visibility?: MineShown; limit: number; page: number }): Promise<MineAnswer> {
    try {
      return await firstValueFrom(this.client.get<MineAnswer>(`${environment.jigsawApi}/jigsaw-search/mine`, { params: this.params(query as JigsawSearchRequest), headers: { 'X-Jigsaw-User': userId } }));
    } catch (err) {
      if (!(err instanceof HttpErrorResponse) || err.status !== 404) throw err;
      // a server that is older than this page (the page is new, the function is not yet) does not have the route: the newest jigsaws it lists are looked at here, with the same rules, so the person still has a list
      const own = (await this.list()).filter((j) => j.ownerUid === userId).map(({ placed: _placed, ...summary }) => summary);
      return JigsawSearch.mine(own, { text: query.text, sort: query.sort, limit: query.limit, page: query.page }, query.visibility);
    }
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
  classify(id: string, apply = false, language?: string): Promise<{ categories: string[]; motive?: MotiveLevel; name: string; description: string; applied: boolean }> {
    let params = new HttpParams();
    if (apply) params = params.set('apply', 'true');
    if (language) params = params.set('language', language); // the texts in this language (and with apply the jigsaw gets it), not the language the jigsaw has
    return firstValueFrom(this.client.post<{ categories: string[]; motive?: MotiveLevel; name: string; description: string; applied: boolean }>(`${environment.jigsawApi}/jigsaw/${encodeURIComponent(id)}/classify`, null, { params }));
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
