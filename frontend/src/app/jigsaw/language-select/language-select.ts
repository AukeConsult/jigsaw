import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawUserService } from '../jigsaw-user.service';

/**
 * The choice of the language of the app: **one row that shows the flag and the name of the language in use, and opens the list of languages one step down**
 * (each with its flag; the one in use is marked). The app is shown in the language at once, and it is kept on the device and as the language of the account that plays (`JigsawUserService.changeLanguage`).
 * The app has it as the last row of the home page menu for nobody (the helper; a user has the language in the preferences and in the account), and the frames of the admin and of signing in have it in their bar. The host is a row of the list it is in
 * (`list-group-item`), so it can be put in a menu that is a `list-group`. **In a bar** (`inBar` says at which edge of the window the bar is) it is one button of the bar, and its list opens over the page, away from that edge; a press elsewhere closes it.
 */
@Component({
  selector: 'app-language-select',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawShell')],
  host: { class: 'd-block', '[class.list-group-item]': '!inBar()', '[class.p-0]': '!inBar()', '[class.position-relative]': 'inBar()', '(document:pointerdown)': 'pressedElsewhere($event)' },
  template: `
    <ng-container *transloco="let t">
      @if (inBar()) {
        <button type="button" class="nav-link d-flex align-items-center gap-1" aria-haspopup="menu" [attr.aria-expanded]="open()" [title]="current().name" [attr.aria-label]="(t('jigsawShell.language') || 'Language') + ': ' + current().name" (click)="open.set(!open())">
          <img class="flag" [src]="'flags/' + current().code + '.svg'" alt="" width="24" height="16"><span class="fit-label">{{ current().name }}</span><i class="bi" [class.bi-chevron-down]="!open()" [class.bi-chevron-up]="open()" aria-hidden="true"></i>
        </button>
        @if (open()) {
          <div class="dropdown-menu show" [class]="listPlace[inBar()!]" role="menu">
            @for (l of languages; track l.code) {
              <button type="button" class="dropdown-item d-flex align-items-center gap-2" role="menuitemradio" [attr.aria-checked]="l.code === language.lang()" [class.active]="l.code === language.lang()" (click)="choose(l.code)">
                <img class="flag" [src]="'flags/' + l.code + '.svg'" alt="" width="24" height="16">{{ l.name }}
              </button>
            }
          </div>
        }
      } @else {
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
      }
    </ng-container>
  `,
})
export class LanguageSelect {
  protected readonly language = inject(LanguageService);
  private readonly users = inject(JigsawUserService);
  protected readonly languages = LANGUAGES;
  /** it is one button of a bar, not a row of a list: the edge of the window the bar is at */
  readonly inBar = input<'top' | 'bottom' | 'left' | 'right' | null>(null);
  /** where the list opens from the button of a bar: away from the edge of the bar */
  protected readonly listPlace = { top: 'top-100 end-0', bottom: 'bottom-100 end-0', left: 'bottom-0 start-100', right: 'bottom-0 end-100' } as const;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** the list of languages is open (one step down) */
  protected readonly open = signal(false);
  protected readonly current = computed(() => LANGUAGES.find((l) => l.code === this.language.lang()) ?? LANGUAGES[0]);

  /** in a bar the list lies over the page: a press outside closes it */
  protected pressedElsewhere(event: Event): void {
    if (this.inBar() && this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  protected choose(code: string): void {
    void this.users.changeLanguage(code);
    this.open.set(false);
  }
}
