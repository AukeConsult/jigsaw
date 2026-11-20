import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Objects } from './objects/objects';

export const routes: Routes = [
  { path: '', component: Home, title: 'Canvas' },
  { path: 'jigsaw', component: Home, title: 'Jigsaw', data: { heading: 'Jigsaw', collection: 'jigsaw', frameDots: false } },
  { path: 'objects', component: Objects, title: 'Canvas objects' },
  { path: '**', redirectTo: '' },
];
