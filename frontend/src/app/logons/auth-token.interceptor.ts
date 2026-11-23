import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LogonRequired } from './logon-required.service';

/**
 * Every call to the API carries the token of the account that is signed in (when somebody is). The server decides, from the user the call acts as, whether it is needed: a user with no verified
 * account ignores it. A call that the server turns down because the user needs a login (401 `logon-required`) or needs another one (403 `wrong-logon`) is told to `LogonRequired`.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.jigsawApi)) return next(req);
  const auth = inject(AuthService);
  const injector = inject(Injector);
  const withToken = async () => {
    await auth.ready; // the sign-in of an earlier visit is restored first, or the first calls of a page would go without
    const user = auth.user();
    if (!user) return req;
    try {
      return req.clone({ setHeaders: { Authorization: `Bearer ${await user.getIdToken()}` } });
    } catch {
      return req; // no token now: the server says so if it is needed
    }
  };
  return from(withToken()).pipe(
    switchMap((sent) => next(sent)),
    catchError((err: unknown) => {
      const code = err instanceof HttpErrorResponse ? (err.error as { code?: string } | null)?.code : undefined;
      if (code === 'logon-required' || code === 'wrong-logon') injector.get(LogonRequired).handle(code);
      return throwError(() => err);
    }),
  );
};
