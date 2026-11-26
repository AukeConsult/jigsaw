import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { readPreference, writePreference } from '../core/preferences';

// A link to a private picture (`share-link.ts` on the server): the owner asks for its key and sends the link; whoever opens the link has the key kept on their device, and every call about that picture carries it.

const KEPT = 'jigsaw.shareKeys';
const KEY = /^[A-Za-z0-9_-]{32}$/;
const isKept = (value: unknown): value is Record<string, string> => !!value && typeof value === 'object' && Object.values(value as object).every((v) => typeof v === 'string' && KEY.test(v));

/** The address of a picture that is sent to somebody: the page before the puzzle, and for a private one the key after `#`, which the browser never sends to a server. */
export const pictureLink = (jigsawId: string, key?: string): string => `${window.location.origin}/play/round/${jigsawId}${key ? `#k=${key}` : ''}`;

/** A link was opened: its key (the part of the address after `#`) is kept for that picture. Whether there was one. */
export function keepShareKey(jigsawId: string, fragment: string | null): boolean {
  const key = /^k=([A-Za-z0-9_-]{32})$/.exec(fragment ?? '')?.[1];
  if (key) writePreference(KEPT, { ...readPreference<Record<string, string>>(KEPT, {}, isKept), [jigsawId]: key });
  return !!key;
}

/** Every call about one picture (`/jigsaw/:id...`) carries the key of the link it was opened with, when there is one. */
export const shareKeyInterceptor: HttpInterceptorFn = (req, next) => {
  const about = `${environment.jigsawApi}/jigsaw/`;
  if (!req.url.startsWith(about)) return next(req);
  const key = readPreference<Record<string, string>>(KEPT, {}, isKept)[req.url.slice(about.length).split(/[/?#]/)[0]];
  return next(key ? req.clone({ setHeaders: { 'X-Jigsaw-Share': key } }) : req);
};

/** The owner's side: the key of the link of their picture, and making a new one (the links sent before stop working). */
@Injectable({ providedIn: 'root' })
export class ShareKeyService {
  private readonly http = inject(HttpClient);

  private url(jigsawId: string): string {
    return `${environment.jigsawApi}/jigsaw/${encodeURIComponent(jigsawId)}/share`;
  }

  async key(jigsawId: string): Promise<string> {
    return (await firstValueFrom(this.http.get<{ key: string }>(this.url(jigsawId)))).key;
  }

  async renew(jigsawId: string): Promise<string> {
    return (await firstValueFrom(this.http.post<{ key: string }>(this.url(jigsawId), {}))).key;
  }
}
