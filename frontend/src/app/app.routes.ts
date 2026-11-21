import { Routes } from '@angular/router';

/**
 * Two modules, each loaded when it is first opened and each with its own header menu:
 *  - `/jigsaw`: Karins jigsaw. The default: the app opens with it.
 *  - `/canvas`: the canvas page and the objects page, for other purposes and for testing.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'jigsaw' },
  { path: 'jigsaw', loadChildren: () => import('./jigsaw/jigsaw.routes').then((m) => m.JIGSAW_ROUTES) },
  { path: 'canvas', loadChildren: () => import('./canvas/canvas.routes').then((m) => m.CANVAS_ROUTES) },
  { path: 'objects', redirectTo: 'canvas/objects' }, // where the objects page was before there were modules
  { path: '**', redirectTo: 'jigsaw' },
];
