import { Route, Routes } from '@angular/router';
import { guestGuard } from './auth.guard';
import { LogonShell } from './logon-shell';

/** A page of the logon inside its frame; its component is loaded when the page is first opened. */
const page = (path: string, load: Route['loadComponent'], title: string, guard?: Route['canActivate']): Route => ({
  path,
  component: LogonShell,
  children: [{ path: '', loadComponent: load, title, canActivate: guard }],
});

/**
 * Signing in with Firebase, beside the users of the jigsaw (which are not changed), at the top of the address space:
 * `/login`: sign in or create an account (Google, an emailed link, email and password); `/login/email`: ask for the link; `/login/link`: the page the link opens.
 * Who is signed in, and Sign out, are on the account page of the app (`/play/account`).
 */
export const LOGON_ROUTES: Routes = [
  page('login/email', () => import('./login-email/login-email').then((m) => m.LoginEmail), 'Email link', [guestGuard]),
  page('login/link', () => import('./login-link/login-link').then((m) => m.LoginLink), 'Signing in'),
  page('login', () => import('./login/login').then((m) => m.Login), 'Sign in', [guestGuard]),
];
