import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** The canvas module: its own header menu above whatever page of the module is open. */
@Component({
  selector: 'app-canvas-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="app-navbar navbar navbar-expand bg-body-tertiary border-bottom" aria-label="Canvas menu">
      <div class="container-fluid">
        <a class="navbar-brand" routerLink="/canvas">Canvas</a>
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <a class="nav-link" routerLink="/canvas" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Canvas area</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/canvas/objects" routerLinkActive="active">Objects</a>
          </li>
        </ul>
      </div>
    </nav>
    <router-outlet />
  `,
})
export class CanvasShell {}
