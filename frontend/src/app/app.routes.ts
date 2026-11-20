import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Objects } from './objects/objects';

export const routes: Routes = [
  { path: '', component: Home, title: 'Canvas' },
  { path: 'jigsaw', component: Home, title: 'Jigsaw', data: { heading: 'Jigsaw', collection: 'jigsaw', gridInset: true, numberPoints: true, palette: false, background: true, tools: false, fillScreen: true, sidebar: true } },
  { path: 'objects', component: Objects, title: 'Canvas objects' },
  { path: '**', redirectTo: '' },
];
