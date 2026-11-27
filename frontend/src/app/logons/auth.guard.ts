import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** A person who has signed in does not need the sign-in pages: they go to the account page of the app. */
export const guestGuard: CanActivateFn = async () => {
  // inject() works only before the first await, so everything is injected first
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.user() ? router.createUrlTree(['/play/account']) : true;
};
