import { Routes } from '@angular/router';

/** Karins jigsaw is the app: `/jigsaw`, loaded when it is first opened, with its own header menu. The app opens with it. */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'jigsaw' },
  { path: 'jigsaw', loadChildren: () => import('./jigsaw/jigsaw.routes').then((m) => m.JIGSAW_ROUTES) },
  { path: '**', redirectTo: 'jigsaw' },
];
