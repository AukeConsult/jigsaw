import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES, LanguageService } from '../core/language.service';
import { JigsawHelper } from './jigsaw-helper';
import { JigsawUserService } from './jigsaw-user.service';

/** The jigsaw module: its own header menu above whatever page of the module is open. */
@Component({
  selector: 'app-jigsaw-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawShell')],
  template: `
    <nav class="app-navbar navbar navbar-expand bg-body-tertiary border-bottom" *transloco="let t" [attr.aria-label]="t('jigsawShell.menu') || 'Karins jigsaw menu'">
      <div class="container-fluid flex-wrap gap-1">
        <a class="navbar-brand d-flex align-items-center gap-2" routerLink="/jigsaw">
          <img class="brand-logo" src="logo.svg" alt="" width="28" height="28">
          <span>Karins jigsaw</span>
        </a>
        <ul class="navbar-nav me-auto flex-shrink-0">
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/list" routerLinkActive="active" [title]="t('jigsawShell.jigsaws') || 'Jigsaws'"><i class="bi bi-grid-3x3-gap me-1" aria-hidden="true"></i><span class="d-none d-md-inline">{{ t('jigsawShell.jigsaws') || 'Jigsaws' }}</span></a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/guide" routerLinkActive="active" [title]="t('jigsawShell.guide') || 'User guide'"><i class="bi bi-book me-1" aria-hidden="true"></i><span class="d-none d-md-inline">{{ t('jigsawShell.guide') || 'User guide' }}</span></a>
          </li>
          <li class="nav-item">
            <!-- who plays: the name of the user, and a way to choose another -->
            <a class="nav-link text-nowrap" routerLink="/jigsaw/user" routerLinkActive="active" [title]="users.user() ? (t('jigsawShell.whoPlaysTitle', { name: users.user()!.username }) || 'Who plays: ' + users.user()!.username) : (t('jigsawShell.choosePlayer') || 'Choose who plays')">
              <i class="bi bi-person-circle me-1" aria-hidden="true"></i><span class="d-none d-md-inline">{{ users.user()?.name ?? (t('jigsawShell.whoPlays') || 'Who plays?') }}</span>
            </a>
          </li>
        </ul>
        <!-- the language of the texts, chosen on this device -->
        <label class="visually-hidden" for="language">{{ t('jigsawShell.language') || 'Language' }}</label>
        <select id="language" class="form-select form-select-sm w-auto" [value]="language.lang()" (change)="language.use($any($event.target).value)">
          @for (l of languages; track l.code) {
            <option [value]="l.code" [selected]="l.code === language.lang()">{{ l.name }}</option>
          }
        </select>
        @if (tools.active()) {
          <!-- the helper, on the page of a jigsaw: the helper picture (a frame on top of the page with the whole picture), only the corner and edge pieces -->
          <div class="d-flex align-items-center flex-wrap gap-2 gap-sm-3 ms-auto" [attr.aria-label]="t('jigsawShell.helper') || 'Helper'">
            <div class="form-check form-switch mb-0">
              <input id="helper-picture" class="form-check-input" type="checkbox" role="switch" [checked]="tools.helper()" [disabled]="!tools.hasPicture()"
                     (change)="tools.helper.set($any($event.target).checked)">
              <label class="form-check-label small text-nowrap" for="helper-picture" [title]="t('jigsawShell.pictureTitle') || 'Show the whole picture in a small frame'"><i class="bi bi-image me-1" aria-hidden="true"></i>{{ t('jigsawShell.picture') || 'Picture' }}</label>
            </div>
            <div class="form-check form-switch mb-0">
              <input id="edges-only" class="form-check-input" type="checkbox" role="switch" [checked]="tools.edgesOnly()" [disabled]="!tools.hasPieces()"
                     (change)="tools.edgesOnly.set($any($event.target).checked)">
              <label class="form-check-label small text-nowrap" for="edges-only" [title]="t('jigsawShell.edgesTitle') || 'Only the corner and edge pieces'"><i class="bi bi-bounding-box me-1" aria-hidden="true"></i>{{ t('jigsawShell.edges') || 'Edges' }}</label>
            </div>
            @if (tools.edgesOnly() && tools.hasPieces()) {
              <span class="small text-body-secondary text-nowrap d-none d-lg-inline" role="status">{{ t('jigsawShell.showing', { shown: tools.counts().shown, total: tools.counts().total }) || 'Showing ' + tools.counts().shown + ' of ' + tools.counts().total + ' pieces' }}</span>
            }
            <!-- on a narrow screen the sidebar is folded away: this shows the details; a click anywhere else closes them again (on a wide screen they are always there) -->
            <button id="sidebar-open" type="button" class="btn btn-sm btn-outline-secondary text-nowrap d-xl-none" [title]="t('jigsawShell.details') || 'Details'" aria-controls="jigsaw-sidebar" [attr.aria-expanded]="tools.sidebarOpen()"
                    (click)="tools.sidebarOpen.set(true)"><i class="bi bi-layout-sidebar me-1" aria-hidden="true"></i>{{ t('jigsawShell.details') || 'Details' }}</button>
          </div>
        }
      </div>
    </nav>
    <router-outlet />
  `,
})
export class JigsawShell {
  protected readonly tools = inject(JigsawHelper);
  protected readonly users = inject(JigsawUserService);
  protected readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;

  constructor() {
    void this.users.load(); // the user who played here last is read, so the menu can show the name
  }

  /** A click anywhere closes the details again, also on the empty parts of them; the title, the buttons and the settings in them are used, so they stay open, as does the button that opened them. */
  @HostListener('document:click', ['$event'])
  closeDetails(event: MouseEvent): void {
    if (!this.tools.sidebarOpen()) return;
    const target = event.target as Element | null;
    if (target?.closest('#sidebar-open, #jigsaw-sidebar input, #jigsaw-sidebar button, #jigsaw-sidebar label, #jigsaw-sidebar a, #jigsaw-sidebar select')) return;
    this.tools.sidebarOpen.set(false);
  }
}
