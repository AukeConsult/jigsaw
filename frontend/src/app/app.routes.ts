import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Objects } from './objects/objects';

export const routes: Routes = [
  { path: '', component: Home, title: 'Canvas' },
  { path: 'objects', component: Objects, title: 'Canvas objects' },
  { path: '**', redirectTo: '' },
];
