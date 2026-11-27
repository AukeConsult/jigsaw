import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanguageSelect } from '../jigsaw/language-select/language-select';
import { Home } from '../home/home';

/** The frame of the pages of signing in: the logo, which is the way back to the app, and the language (a person who is new has chosen none yet), over the page that is open. */
@Component({
  selector: 'app-logon-shell',
  imports: [RouterOutlet, LanguageSelect, Home],
  host: { class: 'app-shell' },
  template: `
    <header class="app-header menu-style d-flex align-items-center gap-2 px-3 py-2">
      <app-home />
      <app-language-select class="ms-auto" [inBar]="'top'" />
    </header>
    <router-outlet />
  `,
})
export class LogonShell {}
