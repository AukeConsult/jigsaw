import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { JigsawUserService } from '../jigsaw/jigsaw-user.service';
import { AuthService } from './auth.service';

/**
 * What happens when the server says the user that plays needs a login: the person stops playing as that user (it stays in the database) and is sent on, to sign in (`logon-required`: nobody
 * is signed in) or to choose a user that this login can use (`wrong-logon`). Everything is looked up when it happens, not when this is made, since the interceptor that calls it is in the way
 * of the user service and the router.
 */
@Injectable({ providedIn: 'root' })
export class LogonRequired {
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  /** several calls fail at once: it is handled once */
  private busy = false;

  handle(code: 'logon-required' | 'wrong-logon'): void {
    if (this.busy) return;
    this.busy = true;
    setTimeout(() => (this.busy = false), 2000);
    const router = this.injector.get(Router);
    this.injector.get(JigsawUserService).leave();
    const here = router.url;
    if (here.startsWith('/login')) return; // already where the person can sign in
    if (here.startsWith('/play/account')) {
      // already where the person can choose: the reason is said there (`app-my-logon-users` reads it), without leaving the page
      void router.navigate([], { queryParams: { logon: code === 'wrong-logon' && this.auth.user() ? 'wrong' : 'needlogin' }, queryParamsHandling: 'merge', replaceUrl: true });
      return;
    }
    const next = /^\/(jigsaw|play)(\/|$)/.test(here) ? here : undefined;
    if (code === 'wrong-logon' && this.auth.user()) void router.navigate(['/play/account'], { queryParams: { logon: 'wrong' } });
    else void router.navigate(['/login'], { queryParams: { notice: 'needlogin', ...(next ? { next } : {}) } });
  }
}
