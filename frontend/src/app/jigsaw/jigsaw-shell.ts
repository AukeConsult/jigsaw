import { Component, HostListener, computed, inject, signal } from '@angular/core';
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
        <a class="navbar-brand brand-lockup d-flex align-items-center gap-2" routerLink="/jigsaw" aria-label="Karins jigsaw">
          <img class="brand-logo" src="logo.svg" alt="" width="32" height="32">
          <span class="brand-text"><span class="brand-name">Karins</span><span class="brand-sub">jigsaw</span></span>
        </a>
        <ul class="navbar-nav flex-shrink-0">
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/list" routerLinkActive="active" [title]="t('jigsawShell.jigsaws') || 'Jigsaws'"><i class="bi bi-grid-3x3-gap me-1" aria-hidden="true"></i><span class="d-none d-md-inline">{{ t('jigsawShell.jigsaws') || 'Jigsaws' }}</span></a>
          </li>
        </ul>
        @if (tools.active()) {
          <!-- the helper, on the page of a jigsaw: the helper picture (a frame on top of the page with the whole picture), only the corner and edge pieces -->
          <div class="jigsaw-helper-bar d-flex align-items-center flex-wrap gap-2 gap-sm-3" [attr.aria-label]="t('jigsawShell.helper') || 'Helper'">
            @if (tools.clock(); as time) {
              <!-- the time played in this round, a small clock that runs while the round is open on the screen -->
              <span class="small text-nowrap text-body-secondary" role="timer" [title]="t('jigsawShell.timePlayed') || 'Time played'"><i class="bi bi-stopwatch me-1" aria-hidden="true"></i><span class="visually-hidden">{{ t('jigsawShell.timePlayed') || 'Time played' }}: </span><span class="font-monospace">{{ time }}</span></span>
            }
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
        <!-- who plays and the language: always at the right end of the menu -->
        <div class="d-flex align-items-center gap-2 ms-auto order-1">
          <ul class="navbar-nav flex-shrink-0">
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
          <!-- the language of the texts, chosen on this device: the flag of the language in use, and a list of flags with the names of the languages -->
          <div class="position-relative">
            <button id="language" type="button" class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 px-2" aria-haspopup="listbox" [attr.aria-expanded]="languageOpen()"
                    [attr.aria-label]="(t('jigsawShell.language') || 'Language') + ': ' + current().name" [title]="current().name" (click)="toggleLanguages($event)">
              <img class="flag" [src]="'flags/' + current().code + '.svg'" alt="" width="24" height="16"><i class="bi bi-chevron-down small" aria-hidden="true"></i>
            </button>
            @if (languageOpen()) {
              <ul class="dropdown-menu language-menu show" role="listbox" [style.top.px]="languageTop()" [attr.aria-label]="t('jigsawShell.language') || 'Language'">
                @for (l of languages; track l.code) {
                  <li role="option" [attr.aria-selected]="l.code === language.lang()">
                    <button type="button" class="dropdown-item d-flex align-items-center gap-2" [class.active]="l.code === language.lang()" (click)="chooseLanguage(l.code)">
                      <img class="flag" [src]="'flags/' + l.code + '.svg'" alt="" width="24" height="16">{{ l.name }}
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
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
  /** the list of languages is open */
  protected readonly languageOpen = signal(false);
  protected readonly current = computed(() => LANGUAGES.find((l) => l.code === this.language.lang()) ?? LANGUAGES[0]);

  /** where the list starts: just under the button (the list is fixed to the window, so it is always inside the view, whatever clips the menu) */
  protected readonly languageTop = signal(48);

  protected toggleLanguages(event: MouseEvent): void {
    this.languageTop.set(Math.round((event.currentTarget as HTMLElement).getBoundingClientRect().bottom) + 4);
    this.languageOpen.set(!this.languageOpen());
  }

  protected chooseLanguage(code: string): void {
    this.language.use(code);
    this.languageOpen.set(false);
  }

  /** a click anywhere else closes the list of languages */
  @HostListener('document:click', ['$event'])
  closeLanguages(event: MouseEvent): void {
    if (this.languageOpen() && !(event.target as Element | null)?.closest?.('#language, .dropdown-menu')) this.languageOpen.set(false);
  }

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
