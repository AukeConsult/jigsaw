import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** What is needed to read the picture of a jigsaw: its id, and its key when it is private or hidden. */
export type ImageOf = { id: string; imageKey?: string };

/** The background picture of a jigsaw, kept by the API in Storage (the picture of a jigsaw is read at `url` and sent by id). */
@Injectable({ providedIn: 'root' })
export class JigsawImageService {
  private readonly http = inject(HttpClient);

  private base(id: string): string {
    return `${environment.jigsawApi}/jigsaw-image/${encodeURIComponent(id)}`;
  }

  /**
   * where the picture can be read (the number changes when the picture does, so the browser does not show an old one). A jigsaw that is private or hidden has an `imageKey`, which the API gave with
   * the jigsaw to those who may see it: it goes on the address, since a picture is read with `<img src>`, which cannot say who asks. The key is only ever put on an address here, never kept.
   */
  url(jigsaw: ImageOf, version: number): string {
    return `${this.base(jigsaw.id)}?v=${version}${jigsaw.imageKey ? `&k=${encodeURIComponent(jigsaw.imageKey)}` : ''}`;
  }

  /** whether the jigsaw has a picture */
  async has(jigsaw: ImageOf): Promise<boolean> {
    try {
      await firstValueFrom(this.http.head(this.url(jigsaw, 1)));
      return true;
    } catch {
      return false;
    }
  }

  /** sends the picture (the file itself is the request body; the API finds out what it is) */
  upload(id: string, file: Blob): Promise<unknown> {
    return firstValueFrom(this.http.put(this.base(id), file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
  }
}
