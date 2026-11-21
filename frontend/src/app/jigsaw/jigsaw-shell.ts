import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { JigsawHelper } from './jigsaw-helper';

/** The jigsaw module: its own header menu above whatever page of the module is open. */
@Component({
  selector: 'app-jigsaw-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="app-navbar navbar navbar-expand bg-body-tertiary border-bottom" aria-label="Karins jigsaw menu">
      <div class="container-fluid">
        <a class="navbar-brand d-flex align-items-center gap-2" routerLink="/jigsaw">
          <img class="brand-logo" src="logo.svg" alt="" width="28" height="28">
          <span>Karins jigsaw</span>
        </a>
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/list" routerLinkActive="active"><i class="bi bi-grid-3x3-gap me-1" aria-hidden="true"></i>Jigsaws</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/guide" routerLinkActive="active"><i class="bi bi-book me-1" aria-hidden="true"></i>User guide</a>
          </li>
        </ul>
        @if (tools.active()) {
          <!-- the helper, on the page of a jigsaw: the helper picture (a frame on top of the page with the whole picture), only the corner and edge pieces, and Collect pieces (the pieces in the store are put together at the top of it) -->
          <div class="d-flex align-items-center gap-3" aria-label="Helper">
            <div class="form-check form-switch mb-0">
              <input id="helper-picture" class="form-check-input" type="checkbox" role="switch" [checked]="tools.helper()" [disabled]="!tools.hasPicture()"
                     (change)="tools.helper.set($any($event.target).checked)">
              <label class="form-check-label small text-nowrap" for="helper-picture"><i class="bi bi-image me-1" aria-hidden="true"></i>Helper<span class="d-none d-sm-inline"> picture</span></label>
            </div>
            <div class="form-check form-switch mb-0">
              <input id="edges-only" class="form-check-input" type="checkbox" role="switch" [checked]="tools.edgesOnly()" [disabled]="!tools.hasPieces()"
                     (change)="tools.edgesOnly.set($any($event.target).checked)">
              <label class="form-check-label small text-nowrap" for="edges-only"><i class="bi bi-bounding-box me-1" aria-hidden="true"></i><span class="d-sm-none">Edges</span><span class="d-none d-sm-inline">Only corner and edge pieces</span></label>
            </div>
            @if (tools.edgesOnly() && tools.hasPieces()) {
              <span class="small text-body-secondary text-nowrap d-none d-lg-inline" role="status">Showing {{ tools.counts().shown }} of {{ tools.counts().total }} pieces</span>
            }
            <button type="button" class="btn btn-sm btn-outline-primary border-0 text-nowrap" [disabled]="!tools.canCollect()" (click)="tools.collect()"
                    title="Put the pieces in the store together at the top of it"><i class="bi bi-magnet me-1" aria-hidden="true"></i>Collect<span class="d-none d-sm-inline"> pieces</span></button>
          </div>
        }
      </div>
    </nav>
    <router-outlet />
  `,
})
export class JigsawShell {
  protected readonly tools = inject(JigsawHelper);
}
