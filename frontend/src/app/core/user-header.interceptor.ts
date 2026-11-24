import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** The key the admin who has gone into an account is kept under, in this tab (`sessionStorage`; see `JigsawUserService.openAs`). */
export const ADMIN_KEY = 'jigsaw.adminInto';

/** The key the user who plays is kept under in this browser (see `JigsawUserService`). */
const USER_KEY = 'jigsaw.userId';

/**
 * Every request to the API says who asks (the header `X-Jigsaw-User`, the UID of the user who plays), so the lists show a jigsaw that only its owner sees to the owner.
 * It is read straight from the browser's storage (the user service itself uses the HttpClient). There is no sign-in yet, so this is honest, not a lock.
 */
export const userHeaderInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.jigsawApi) || req.headers.has('X-Jigsaw-User')) return next(req);
  let id: string | null = null;
  try {
    id = localStorage.getItem(USER_KEY);
  } catch {
    /* no storage: nobody asks */
  }
  // an admin who has gone into an account says so (kept for this tab only): the token that comes is the admin's own, and the server lets it act as the account (`createGate`)
  let admin: string | null = null;
  try {
    admin = (JSON.parse(sessionStorage.getItem(ADMIN_KEY) ?? 'null') as { id?: string } | null)?.id ?? null;
  } catch {
    /* none */
  }
  return next(id ? req.clone({ setHeaders: { 'X-Jigsaw-User': id, ...(admin ? { 'X-Jigsaw-Admin': admin } : {}) } }) : req);
};
