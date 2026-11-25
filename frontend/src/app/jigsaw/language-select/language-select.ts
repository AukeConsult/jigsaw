import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawUserService } from '../jigsaw-user.service';

/**
 * The choice of the language of the app, in the form of the website's menu on a phone: **one row that shows the flag and the name of the language in use, and opens the list of languages one step down**
 * (each with its flag; the one in use is marked). The app is shown in the language at once, and it is kept on the device and as the language of the account that plays (`JigsawUserService.changeLanguage`,
 * the same as the website's menu). The app has it as the last row of its menu (the helper); the account page has the language among the account's own settings. The host is a row of the list it is in
 * (`list-group-item`), so it can be put in a menu that is a `list-group`.
 */
@Component({
  selector: 'app-language-select',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawShell')],
  host: { class: 'list-group-item d-block p-0' },
  template: `
    <ng-container *transloco="let t">
      <button type="button" class="list-group-item list-group-item-action border-0 rounded-0 d-flex align-items-center gap-2" aria-haspopup="menu" [attr.aria-expanded]="open()" [attr.aria-label]="(t('jigsawShell.language') || 'Language') + ': ' + current().name" (click)="open.set(!open())">
        <img class="flag" [src]="'flags/' + current().code + '.svg'" alt="" width="24" height="16">{{ current().name }}<i class="bi ms-auto" [class.bi-chevron-down]="!open()" [class.bi-chevron-up]="open()" aria-hidden="true"></i>
      </button>
      @if (open()) {
        @for (l of languages; track l.code) {
          <button type="button" class="list-group-item list-group-item-action border-0 rounded-0 d-flex align-items-center gap-2 ps-4" role="menuitemradio" [attr.aria-checked]="l.code === language.lang()" [class.active]="l.code === language.lang()" [attr.aria-label]="(t('jigsawShell.language') || 'Language') + ': ' + l.name" (click)="choose(l.code)">
            <img class="flag" [src]="'flags/' + l.code + '.svg'" alt="" width="24" height="16">{{ l.name }}
          </button>
        }
      }
    </ng-container>
  `,
})
export class LanguageSelect {
  protected readonly language = inject(LanguageService);
  private readonly users = inject(JigsawUserService);
  protected readonly languages = LANGUAGES;
  /** the list of languages is open (one step down) */
  protected readonly open = signal(false);
  protected readonly current = computed(() => LANGUAGES.find((l) => l.code === this.language.lang()) ?? LANGUAGES[0]);

  protected choose(code: string): void {
    void this.users.changeLanguage(code);
    this.open.set(false);
  }
}
