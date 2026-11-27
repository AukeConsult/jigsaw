import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { LanguageSelect } from '../jigsaw/language-select/language-select';

/** The frame of the pages of signing in: the logo, which is the way back to the app, and the language (a person who is new has chosen none yet), over the page that is open. */
@Component({
  selector: 'app-logon-shell',
  imports: [RouterOutlet, RouterLink, LanguageSelect],
  host: { class: 'app-shell' },
  template: `
    <header class="app-header menu-style d-flex align-items-center gap-2 px-3 py-2">
      <a class="brand-lockup d-flex align-items-center gap-2 text-decoration-none" routerLink="/" aria-label="Karins jigsaw">
        <span class="brand-mark"><img class="brand-logo" src="logo.svg" alt="" width="32" height="32"><i class="bi bi-house-fill brand-home" aria-hidden="true"></i></span>
        <span class="brand-text"><span class="brand-name">Karins</span><span class="brand-sub">jigsaw</span></span>
      </a>
      <app-language-select class="ms-auto" [inBar]="'top'" />
    </header>
    <router-outlet />
  `,
})
export class LogonShell {}
