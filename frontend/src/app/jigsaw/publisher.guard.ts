import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { JigsawUserService } from './jigsaw-user.service';

/** A page for a publisher or an admin: anybody else goes to the front page. Only a convenience: the server decides what each level may do. */
export const publisherGuard: CanActivateFn = async () => {
  const users = inject(JigsawUserService); // everything is injected first: inject() works only before the first await
  const router = inject(Router);
  await users.load();
  return users.mayPublish() ? true : router.createUrlTree(['/']);
};
