import { Routes } from '@angular/router';
import { LOGON_ROUTES } from './logons/logons.routes';

/**
 * The three parts of the site: **the app** (`src/play/`, at `/play/...`), where everything a player does is; **the admin** (`app/admin/`, at `/jigsaw`); and **signing in** (`/login`). Home, `/`, and every address that is not
 * known go to the app. `/install` is a short address to share for how to get the app.
 */
export const routes: Routes = [
  { path: 'install', redirectTo: 'play/info/install' },
  ...LOGON_ROUTES, // signing in with Firebase: /login, /login/email and /login/link
  { path: 'jigsaw', loadChildren: () => import('./admin/admin.routes').then((m) => m.ADMIN_ROUTES) }, // the admin
  { path: 'play', loadChildren: () => import('../play/play.routes').then((m) => m.PLAY_ROUTES) }, // the app: the main page is the main route, its pages are its sub routes
  { path: '**', redirectTo: 'play/list' },
];
