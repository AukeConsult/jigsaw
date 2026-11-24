import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES, LanguageService } from '../core/language.service';
import { LabelFit } from '../core/label-fit';
import { WelcomeTime } from '../core/welcome-time';
import { JigsawHelper } from './jigsaw-helper';
import { JigsawUserService } from './jigsaw-user.service';
import { ShareButton } from './share-button/share-button';

/** The jigsaw module: its own header menu above whatever page of the module is open. */
@Component({
  selector: 'app-jigsaw-shell',
  imports: [NgTemplateOutlet, RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective, ShareButton, LabelFit],
  providers: [provideTranslocoScope('jigsawShell')],
  template: `
    <ng-container *transloco="let t">
    <ng-template #helper let-sfx>
  <!-- the helper, on the page of a jigsaw: the helper picture (a frame on top of the page with the whole picture), only the corner and edge pieces -->
  <div appLabelFit class="jigsaw-helper-bar d-flex align-items-center flex-wrap gap-2 gap-sm-3" [attr.aria-label]="t('jigsawShell.helper') || 'Helper'">
    @if (tools.current(); as jigsawId) {
      <!-- the page of the jigsaw, for every round (the same as the name of the jigsaw and the details in the sidebar) -->
      <a class="btn btn-sm btn-outline-secondary" [routerLink]="['/jigsaw', jigsawId]" [title]="t('jigsawShell.toJigsaw') || 'Show the page of the jigsaw'" [attr.aria-label]="t('jigsawShell.toJigsaw') || 'Show the page of the jigsaw'"><i class="bi bi-puzzle" aria-hidden="true"></i></a>
    }
    @if (tools.clock(); as time) {
      <!-- the time played in this round, a small clock that runs while the round is open on the screen -->
      <span class="fit-drop small text-nowrap text-body-secondary" role="timer" [title]="t('jigsawShell.timePlayed') || 'Time played'"><i class="bi bi-stopwatch me-1" aria-hidden="true"></i><span class="visually-hidden">{{ t('jigsawShell.timePlayed') || 'Time played' }}: </span><span class="font-monospace">{{ time }}</span></span>
    }
    @if (tools.viewing(); as name) {
      <!-- another player's round is looked at: whose it is -->
      <span class="small fw-semibold text-nowrap" role="status" [title]="t('jigsawShell.viewing', { name }) || 'You are looking at the round of ' + name"><i class="bi bi-eye me-1" aria-hidden="true"></i>{{ name }}</span>
    }
    <div class="form-check form-switch mb-0">
      <input [id]="'helper-picture' + sfx" class="form-check-input" type="checkbox" role="switch" [checked]="tools.helper()" [disabled]="!tools.hasPicture()"
             (change)="tools.helper.set($any($event.target).checked)">
      <label class="form-check-label small text-nowrap" [attr.for]="'helper-picture' + sfx" [title]="t('jigsawShell.pictureTitle') || 'Show the whole picture in a small frame'"><i class="bi bi-image me-1" aria-hidden="true"></i><span class="fit-label">{{ t('jigsawShell.picture') || 'Picture' }}</span></label>
    </div>
    <div class="form-check form-switch mb-0">
      <input [id]="'edges-only' + sfx" class="form-check-input" type="checkbox" role="switch" [checked]="tools.edgesOnly()" [disabled]="!tools.hasPieces()"
             (change)="tools.edgesOnly.set($any($event.target).checked)">
      <label class="form-check-label small text-nowrap" [attr.for]="'edges-only' + sfx" [title]="t('jigsawShell.edgesTitle') || 'Only the corner and edge pieces'"><i class="bi bi-bounding-box me-1" aria-hidden="true"></i><span class="fit-label">{{ t('jigsawShell.edges') || 'Edges' }}</span></label>
    </div>
    @if (tools.edgesOnly() && tools.hasPieces()) {
      <span class="small text-body-secondary text-nowrap d-none d-lg-inline" role="status">{{ t('jigsawShell.showing', { shown: tools.counts().shown, total: tools.counts().total }) || 'Showing ' + tools.counts().shown + ' of ' + tools.counts().total + ' pieces' }}</span>
    }
    <!-- on a narrow screen the sidebar is folded away: this shows the details; a click anywhere else closes them again (on a wide screen they are always there) -->
    <button type="button" class="sidebar-open btn btn-sm btn-outline-secondary text-nowrap d-xl-none" [title]="t('jigsawShell.details') || 'Details'" aria-controls="jigsaw-sidebar" [attr.aria-expanded]="tools.sidebarOpen()" [class.active]="tools.sidebarOpen()"
            (click)="tools.sidebarOpen.set(!tools.sidebarOpen())"><i class="bi bi-layout-sidebar me-1" aria-hidden="true"></i><span class="fit-label">{{ t('jigsawShell.details') || 'Details' }}</span></button>
  </div>
    </ng-template>
    @if (tools.active()) {
      <!-- the helper of a round, on a phone or a tablet: at the top of the page, stuck there, while the menu is at the bottom -->
      <div class="app-toolbar menu-style d-flex align-items-center gap-2 d-xl-none border-bottom">
        <!-- where the menu is at the bottom (under the width of lg) the logo, with the house that says it takes you home, is the first thing of this bar: the way back to the front page -->
        <a class="brand-lockup d-lg-none flex-shrink-0" routerLink="/" aria-label="Karins jigsaw" [title]="t('jigsawShell.home') || 'Home'"><span class="brand-mark"><img class="brand-logo" src="logo.svg" alt="" width="32" height="32"><i class="bi bi-house-fill brand-home" aria-hidden="true"></i></span></a>
        <ng-container *ngTemplateOutlet="helper; context: { $implicit: '-top' }" />
      </div>
    }
    <nav class="app-navbar menu-style navbar navbar-expand border-bottom" [attr.aria-label]="t('jigsawShell.menu') || 'Karins jigsaw menu'">
      <div appLabelFit class="container-fluid flex-wrap gap-1">
        <a class="navbar-brand brand-lockup d-flex align-items-center gap-2" routerLink="/" aria-label="Karins jigsaw">
          <span class="brand-mark"><img class="brand-logo" src="logo.svg" alt="" width="32" height="32"><i class="bi bi-house-fill brand-home" aria-hidden="true"></i></span>
          <span class="brand-text"><span class="brand-name">Karins</span><span class="brand-sub">jigsaw</span></span>
        </a>
        <ul class="navbar-nav flex-shrink-0">
          <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/find" routerLinkActive="active" [title]="t('jigsawShell.find') || 'Find a jigsaw'"><i class="bi bi-search me-md-1 d-block d-md-inline" aria-hidden="true"></i><span class="nav-label">{{ t('jigsawShell.find') || 'Find' }}</span></a>
          </li>
        </ul>
        @if (tools.active()) {
          <!-- on a wide screen the helper is in the menu; on a narrow one it is its own bar at the top of the page (below) -->
          <div class="d-none d-xl-block"><ng-container *ngTemplateOutlet="helper; context: { $implicit: '' }" /></div>
        }
        <!-- who plays and the language: always at the right end of the menu -->
        <div class="d-flex align-items-center gap-2 ms-auto order-1">
          <ul class="navbar-nav flex-shrink-0">
            <li class="nav-item"><app-share-button /></li>
            <li class="nav-item">
            <a class="nav-link" routerLink="/jigsaw/guide" routerLinkActive="active" [title]="t('jigsawShell.guide') || 'Help'"><i class="bi bi-book me-md-1 d-block d-md-inline" aria-hidden="true"></i><span class="nav-label">{{ t('jigsawShell.guide') || 'Help' }}</span></a>
            </li>
            <li class="nav-item">
            <!-- who plays: the name of the user, and a way to choose another -->
            <a class="nav-link text-nowrap" routerLink="/jigsaw/user" routerLinkActive="active" [title]="users.user() ? (t('jigsawShell.whoPlaysTitle', { name: users.user()!.username }) || 'Who plays: ' + users.user()!.username) : (t('jigsawShell.choosePlayer') || 'Choose who plays')">
              <i class="bi bi-person-circle me-md-1 d-block d-md-inline" aria-hidden="true"></i><span class="nav-label">{{ users.user()?.name ?? (t('jigsawShell.whoPlays') || 'Who plays?') }}</span>
            </a>
            </li>
          </ul>
          <!-- the language of the texts, chosen on this device: the flag of the language in use, and a list of flags with the names of the languages -->
          <div class="position-relative">
            <button id="language" type="button" class="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 px-2 py-1" aria-haspopup="listbox" [attr.aria-expanded]="languageOpen()"
                    [attr.aria-label]="(t('jigsawShell.language') || 'Language') + ': ' + current().name" [title]="current().name" (click)="toggleLanguages($event)">
              <img class="flag" [src]="'flags/' + current().code + '.svg'" alt="" width="18" height="12"><i class="bi bi-chevron-down tiny" aria-hidden="true"></i>
            </button>
            @if (languageOpen()) {
              <ul class="dropdown-menu language-menu show" role="listbox" [style.top.px]="languageTop()" [style.bottom.px]="languageBottom()"[attr.aria-label]="t('jigsawShell.language') || 'Language'">
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
    </ng-container>
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

  /** where the list starts: just under the button, or just over it (`languageBottom`) when the menu is at the bottom of the screen (the list is fixed to the window, so it is always inside the view, whatever clips the menu) */
  protected readonly languageTop = signal<number | null>(48);
  protected readonly languageBottom = signal<number | null>(null);

  protected toggleLanguages(event: MouseEvent): void {
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const below = button.top < window.innerHeight / 2;
    this.languageTop.set(below ? Math.round(button.bottom) + 4 : null);
    this.languageBottom.set(below ? null : Math.round(window.innerHeight - button.top) + 4);
    this.languageOpen.set(!this.languageOpen());
  }

  protected chooseLanguage(code: string): void {
    void this.users.changeLanguage(code); // shown at once, and kept as the language of the user
    this.languageOpen.set(false);
  }

  /** a click anywhere else closes the list of languages */
  @HostListener('document:click', ['$event'])
  closeLanguages(event: MouseEvent): void {
    if (this.languageOpen() && !(event.target as Element | null)?.closest?.('#language, .dropdown-menu')) this.languageOpen.set(false);
  }

  constructor() {
    void this.users.load(); // the user who played here last is read, so the menu can show the name
    inject(WelcomeTime); // the minute of the welcome begins when the app is opened, on whatever page
  }

  /** A click anywhere closes the details again, also on the empty parts of them; the title, the buttons and the settings in them are used, so they stay open, as does the button that opened them. */
  @HostListener('document:click', ['$event'])
  closeDetails(event: MouseEvent): void {
    if (!this.tools.sidebarOpen()) return;
    const target = event.target as Element | null;
    if (target?.closest('.sidebar-open, #jigsaw-sidebar input, #jigsaw-sidebar button, #jigsaw-sidebar label, #jigsaw-sidebar a, #jigsaw-sidebar select')) return;
    this.tools.sidebarOpen.set(false);
  }
}
