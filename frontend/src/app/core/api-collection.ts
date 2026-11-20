import { HttpClient } from '@angular/common/http';
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
