import { Routes } from '@angular/router';
import { JigsawFront } from './jigsaw/jigsaw-front/jigsaw-front';
import { JigsawShell } from './jigsaw/jigsaw-shell';

/** The front page is the top route `/` (inside the same header menu as the jigsaw module); the rest of Karins jigsaw is `/jigsaw`, loaded when it is first opened. The older front page stays at `/jigsaw`. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', component: JigsawShell, children: [{ path: '', component: JigsawFront, title: 'Karins jigsaw' }] },
  { path: 'jigsaw', loadChildren: () => import('./jigsaw/jigsaw.routes').then((m) => m.JIGSAW_ROUTES) },
  { path: '**', redirectTo: '' },
];
