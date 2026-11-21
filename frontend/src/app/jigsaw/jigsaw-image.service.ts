import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/** The background picture of a jcanvas, kept by the API in Storage (the picture of a jcanvas is read at `url`, sent and taken away by id). */
@Injectable({ providedIn: 'root' })
export class JigsawImageService {
  private readonly http = inject(HttpClient);

  private base(id: string): string {
    return `${environment.jigsawApi}/jigsaw-image/${encodeURIComponent(id)}`;
  }

  /** where the picture can be read (the number changes when the picture does, so the browser does not show an old one) */
  url(id: string, version: number): string {
    return `${this.base(id)}?v=${version}`;
  }

  /** whether the jcanvas has a picture */
  async has(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.head(this.base(id)));
      return true;
    } catch {
      return false;
    }
  }

  /** sends the picture (the file itself is the request body; the API finds out what it is) */
  upload(id: string, file: Blob): Promise<unknown> {
    return firstValueFrom(this.http.put(this.base(id), file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
  }

  remove(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(this.base(id)));
  }
}
