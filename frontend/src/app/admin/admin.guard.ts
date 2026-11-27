import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { JigsawUserService } from '../jigsaw/jigsaw-user.service';
import { AuthService } from '../logons/auth.service';

/**
 * Who may open a page of the admin: nobody logged on is sent to log on in the app and comes back here after; an account that may not is sent home. Only a convenience: the server decides what each level may
 * do (such as setting a level, `PUT /jigsaw-levels/:id`).
 */
const adminPage = (may: (users: JigsawUserService) => boolean): CanActivateFn => async (_route, state) => {
  // everything is injected first: inject() works only before the first await
  const users = inject(JigsawUserService);
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready; // the earlier login is restored first (an account that is locked needs it)
  await users.load();
  if (!users.acting()) return router.createUrlTree(['/play/account'], { queryParams: { next: state.url } });
  return may(users) ? true : router.createUrlTree(['/']);
};

/** The levels of the accounts: for an admin, and for every account that plays while there is no admin, so the first one can be made. */
export const adminGuard = adminPage((users) => users.mayOpenLevels());

/** A page for an admin only (the AI use). */
export const adminOnlyGuard = adminPage((users) => users.isAdmin());
