import { Routes } from '@angular/router';
import { InstallPage } from './guide/install-page';
import { JigsawFront } from './jigsaw/jigsaw-front/jigsaw-front';
import { JigsawShell } from './jigsaw/jigsaw-shell';
import { LOGON_ROUTES } from './logons/logons.routes';

/** The front page is the top route `/` and how to get the app is `/install` (a short address to share), both inside the same header menu as the jigsaw module; the rest of Karins jigsaw is `/jigsaw`, loaded when it is first opened. The older front page stays at `/jigsaw`. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', component: JigsawShell, children: [{ path: '', component: JigsawFront, title: 'Karins jigsaw' }] },
  { path: 'install', component: JigsawShell, children: [{ path: '', component: InstallPage, title: 'Install' }] },
  ...LOGON_ROUTES, // signing in with Firebase: /login, /login/email, /login/link and /account
  { path: 'jigsaw', loadChildren: () => import('./jigsaw/jigsaw.routes').then((m) => m.JIGSAW_ROUTES) },
  { path: '**', redirectTo: '' },
];
