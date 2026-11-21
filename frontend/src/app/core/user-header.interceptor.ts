import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** The key the user who plays is kept under in this browser (see `JigsawUserService`). */
const USER_KEY = 'jigsaw.userId';

/**
 * Every request to the API says who asks (the header `X-Jigsaw-User`, the UID of the user who plays), so the lists show a jigsaw that only its owner sees to the owner.
 * It is read straight from the browser's storage (the user service itself uses the HttpClient). There is no sign-in yet, so this is honest, not a lock.
 */
export const userHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBase) || req.headers.has('X-Jigsaw-User')) return next(req);
  let id: string | null = null;
  try {
    id = localStorage.getItem(USER_KEY);
  } catch {
    /* no storage: nobody asks */
  }
  return next(id ? req.clone({ setHeaders: { 'X-Jigsaw-User': id } }) : req);
};
