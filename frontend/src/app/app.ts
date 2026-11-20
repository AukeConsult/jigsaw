import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar navbar-expand bg-body-tertiary border-bottom">
      <div class="container-fluid">
        <a class="navbar-brand" routerLink="/">Canvas</a>
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <a class="nav-link" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Canvas area</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw" routerLinkActive="active">Jigsaw</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/objects" routerLinkActive="active">Objects</a>
          </li>
        </ul>
      </div>
    </nav>
    <router-outlet />
  `,
})
export class App {}
