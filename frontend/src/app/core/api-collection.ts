import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/** One collection of documents the API keeps (see the backend `documentStore`): list them, make one, change one, delete one. */
export class ApiCollection<Input, Item> {
  constructor(
    private readonly http: HttpClient,
    private readonly url: string,
  ) {}

  list(): Promise<Item[]> {
    return firstValueFrom(this.http.get<Item[]>(this.url));
  }

  /** one saved one by its id; null when there is none (or it is not for this person to see) */
  async get(id: string): Promise<Item | null> {
    try {
      return await firstValueFrom(this.http.get<Item>(`${this.url}/${encodeURIComponent(id)}`));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 404) return null;
      throw err;
    }
  }

  /** a new one */
  create(input: Input): Promise<Item> {
    return firstValueFrom(this.http.post<Item>(this.url, input));
  }

  /** changes a saved one */
  update(id: string, input: Input): Promise<Item> {
    return firstValueFrom(this.http.put<Item>(`${this.url}/${encodeURIComponent(id)}`, input));
  }

  /** deletes a saved one for good */
  remove(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.url}/${encodeURIComponent(id)}`));
  }
}
