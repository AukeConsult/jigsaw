import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { JigsawUserService } from './jigsaw-user.service';

/** The page of the levels is for an admin: anybody else goes to the front page. Only a convenience: the server decides who may set a level (`PUT /jigsaw-levels/:id`). */
export const adminGuard: CanActivateFn = async () => {
  const users = inject(JigsawUserService); // everything is injected first: inject() works only before the first await
  const router = inject(Router);
  await users.load();
  return users.mayOpenLevels() ? true : router.createUrlTree(['/']);
};

/** A page for an admin only (the AI use): anybody else goes to the front page. Only a convenience: the server decides what each level may do. */
export const adminOnlyGuard: CanActivateFn = async () => {
  const users = inject(JigsawUserService);
  const router = inject(Router);
  await users.load();
  return users.isAdmin() ? true : router.createUrlTree(['/']);
};
