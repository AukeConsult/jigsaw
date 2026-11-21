import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { JigsawUserService } from './jigsaw-user.service';

/** A page that needs to know who plays: without a user the person is sent to choose or make one first, and comes back here after. */
export const userGuard: CanActivateFn = async (_route, state) => {
  // everything is injected first: inject() works only before the first await
  const users = inject(JigsawUserService);
  const router = inject(Router);
  if (await users.load()) return true;
  return router.createUrlTree(['/jigsaw/user'], { queryParams: { next: state.url } });
};
