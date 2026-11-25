import { Routes } from '@angular/router';
import { InstallPage } from './guide/install-page';
import { JigsawShell } from './jigsaw/jigsaw-shell';
import { homeGuard, modeGuard, topRouteGuard } from './core/app-mode';
import { LOGON_ROUTES } from './logons/logons.routes';

/**
 * **Two modes** (`core/app-mode.ts`): `play` is the new app (`src/play/`, at `/play/...`: its main page and the sub routes of it) and `jigsaw` is the existing app (the website, at `/jigsaw/...`; to be refactored later). **The top routes go by the mode that
 * is set** (kept on the device): home, `/`, goes to the home of the mode, and a top route such as `/list` goes to `/play/list` in play mode and to `/jigsaw/list` in jigsaw mode. Opening anything under `/play` sets the mode `play`, and opening
 * anything under `/jigsaw` sets the mode `jigsaw`. How to get the app is `/install` (a short address to share), inside the header menu of the jigsaw module.
 */
export const routes: Routes = [
  { path: 'install', component: JigsawShell, children: [{ path: '', component: InstallPage, title: 'Install' }] },
  ...LOGON_ROUTES, // signing in with Firebase: /login, /login/email, /login/link and /account
  { path: 'jigsaw', canActivate: [modeGuard('jigsaw')], loadChildren: () => import('./jigsaw/jigsaw.routes').then((m) => m.JIGSAW_ROUTES) }, // the existing app: the mode is jigsaw
  { path: 'play', loadChildren: () => import('../play/play.routes').then((m) => m.PLAY_ROUTES) }, // the new app: the main page is the main route, its pages are its sub routes (opening it sets the mode play)
  { path: '', pathMatch: 'full', canActivate: [homeGuard], children: [] }, // home: goes to the home of the mode that is set
  { path: '**', canActivate: [topRouteGuard], children: [] }, // a top route: the same address under the prefix of the mode that is set
];
