import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { JigsawHelper } from './jigsaw-helper';

/** The jigsaw module: its own header menu above whatever page of the module is open. */
@Component({
  selector: 'app-jigsaw-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="app-navbar navbar navbar-expand bg-body-tertiary border-bottom" aria-label="Karins jigsaw menu">
      <div class="container-fluid flex-wrap gap-1">
        <a class="navbar-brand d-flex align-items-center gap-2" routerLink="/jigsaw">
          <img class="brand-logo" src="logo.svg" alt="" width="28" height="28">
          <span>Karins jigsaw</span>
        </a>
        <ul class="navbar-nav me-auto flex-shrink-0">
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/list" routerLinkActive="active" title="Jigsaws"><i class="bi bi-grid-3x3-gap me-1" aria-hidden="true"></i><span class="d-none d-md-inline">Jigsaws</span></a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/guide" routerLinkActive="active" title="User guide"><i class="bi bi-book me-1" aria-hidden="true"></i><span class="d-none d-md-inline">User guide</span></a>
          </li>
        </ul>
        @if (tools.active()) {
          <!-- the helper, on the page of a jigsaw: the helper picture (a frame on top of the page with the whole picture), only the corner and edge pieces -->
          <div class="d-flex align-items-center flex-wrap gap-2 gap-sm-3 ms-auto" aria-label="Helper">
            <div class="form-check form-switch mb-0">
              <input id="helper-picture" class="form-check-input" type="checkbox" role="switch" [checked]="tools.helper()" [disabled]="!tools.hasPicture()"
                     (change)="tools.helper.set($any($event.target).checked)">
              <label class="form-check-label small text-nowrap" for="helper-picture" title="Show the whole picture in a small frame"><i class="bi bi-image me-1" aria-hidden="true"></i>Picture</label>
            </div>
            <div class="form-check form-switch mb-0">
              <input id="edges-only" class="form-check-input" type="checkbox" role="switch" [checked]="tools.edgesOnly()" [disabled]="!tools.hasPieces()"
                     (change)="tools.edgesOnly.set($any($event.target).checked)">
              <label class="form-check-label small text-nowrap" for="edges-only" title="Only the corner and edge pieces"><i class="bi bi-bounding-box me-1" aria-hidden="true"></i>Edges</label>
            </div>
            @if (tools.edgesOnly() && tools.hasPieces()) {
              <span class="small text-body-secondary text-nowrap d-none d-lg-inline" role="status">Showing {{ tools.counts().shown }} of {{ tools.counts().total }} pieces</span>
            }
            <!-- on a narrow screen the sidebar is folded away: this shows the details; a click anywhere else closes them again (on a wide screen they are always there) -->
            <button id="sidebar-open" type="button" class="btn btn-sm btn-outline-secondary text-nowrap d-xl-none" title="Details" aria-controls="jigsaw-sidebar" [attr.aria-expanded]="tools.sidebarOpen()"
                    (click)="tools.sidebarOpen.set(true)"><i class="bi bi-layout-sidebar me-1" aria-hidden="true"></i>Details</button>
          </div>
        }
      </div>
    </nav>
    <router-outlet />
  `,
})
export class JigsawShell {
  protected readonly tools = inject(JigsawHelper);

  /** A click anywhere closes the details again, also on the empty parts of them; the title, the buttons and the settings in them are used, so they stay open, as does the button that opened them. */
  @HostListener('document:click', ['$event'])
  closeDetails(event: MouseEvent): void {
    if (!this.tools.sidebarOpen()) return;
    const target = event.target as Element | null;
    if (target?.closest('#sidebar-open, #jigsaw-sidebar input, #jigsaw-sidebar button, #jigsaw-sidebar label, #jigsaw-sidebar a, #jigsaw-sidebar select')) return;
    this.tools.sidebarOpen.set(false);
  }
}
