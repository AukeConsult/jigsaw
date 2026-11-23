import { Route, Routes } from '@angular/router';
import { JigsawShell } from '../jigsaw/jigsaw-shell';
import { authGuard, guestGuard } from './auth.guard';

/** A page of the logon inside the same header menu as the rest of the app; its component is loaded when the page is first opened. */
const page = (path: string, load: Route['loadComponent'], title: string, guard?: Route['canActivate']): Route => ({
  path,
  component: JigsawShell,
  children: [{ path: '', loadComponent: load, title, canActivate: guard }],
});

/**
 * Signing in with Firebase, beside the users of the jigsaw (which are not changed), at the top of the address space:
 *  - `/login`: sign in or create an account (Google, an emailed link, email and password); `/login/email`: ask for the link; `/login/link`: the page the link opens
 *  - `/account`: who is signed in, and Sign out (only for somebody who is)
 */
export const LOGON_ROUTES: Routes = [
  page('login/email', () => import('./login-email/login-email').then((m) => m.LoginEmail), 'Email link', [guestGuard]),
  page('login/link', () => import('./login-link/login-link').then((m) => m.LoginLink), 'Signing in'),
  page('login', () => import('./login/login').then((m) => m.Login), 'Sign in', [guestGuard]),
  page('account', () => import('./account/account').then((m) => m.Account), 'Account', [authGuard]),
];
