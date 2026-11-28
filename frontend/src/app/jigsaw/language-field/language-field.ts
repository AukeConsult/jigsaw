import { Component, input, output } from '@angular/core';
import { LANGUAGES } from '../../core/language.service';

/**
 * A field of a form that chooses a language: the languages in the browser's own list, **as wide as their names need**, with the flag of the chosen one beside it. It only says what was chosen; the page that frames
 * it decides what that changes (the account page, the preferences). Its label is the page's, tied to it by `fieldId`.
 */
@Component({
  selector: 'app-language-field',
  host: { class: 'd-block' },
  template: `
    <div class="input-group w-auto d-inline-flex flex-nowrap mw-100" [class.input-group-sm]="compact()">
      <span class="input-group-text"><img class="flag" [src]="'flags/' + value() + '.svg'" alt="" width="24" height="16"></span>
      <select [id]="fieldId()" name="language" class="form-select w-auto flex-grow-0" (change)="chosen.emit($any($event.target).value)">
        @for (l of languages; track l.code) {
          <option [value]="l.code" [selected]="l.code === value()">{{ l.name }}</option>
        }
      </select>
    </div>
  `,
})
export class LanguageField {
  readonly fieldId = input.required<string>();
  /** the code of the language that is chosen */
  readonly value = input.required<string>();
  /** the small size, for a card of small choices */
  readonly compact = input(false);
  readonly chosen = output<string>();
  protected readonly languages = LANGUAGES;
}
