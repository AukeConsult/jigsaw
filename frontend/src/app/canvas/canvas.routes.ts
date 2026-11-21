import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Objects } from './objects/objects';
import { GuidePage } from '../guide/guide-page';
import { CanvasShell } from './canvas-shell';

/** The canvas module, `/canvas`: the canvas page and the objects page. It is for other purposes and for testing; the app does not open with it. */
export const CANVAS_ROUTES: Routes = [
  {
    path: '',
    component: CanvasShell,
    children: [
      { path: '', component: Home, title: 'Canvas' },
      { path: 'objects', component: Objects, title: 'Canvas objects' },
      { path: 'guide', component: GuidePage, title: 'User guide', data: { guide: 'user-guide.md' } },
    ],
  },
];
