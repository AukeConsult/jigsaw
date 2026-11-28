import { Component, ElementRef, effect, input, output, signal, untracked, viewChild } from '@angular/core';

/**
 * Words that are changed where they are read: pressed, they become a field with the words **as written** (`value`; what is shown, `shown`, may be a translation). Leaving the field says the new words (`changed`),
 * and so does Enter in a one-line field (Ctrl+Enter in a longer one); Escape leaves it as it was. A name (`required`) is not changed to nothing. It only says what was typed: the page that frames it saves.
 */
@Component({
  selector: 'app-edit-in-place',
  host: { class: 'd-block position-relative z-2' }, // over a link that covers what is round it
  template: `
    @if (!editing()) {
      <div class="edit-in-place" [class]="textClass()" [class.is-empty]="!(typed() ?? shown())" role="button" tabindex="0" [title]="label()" [attr.aria-label]="label() + ': ' + (typed() ?? shown())"
           (click)="start()" (keydown.enter)="start(); $event.preventDefault()" (keydown.space)="start(); $event.preventDefault()">{{ (typed() ?? shown()) || placeholder() }}</div>
    } @else if (multiline()) {
      <textarea #field class="form-control form-control-sm" rows="4" [attr.maxlength]="maxlength()" [attr.aria-label]="label()" [value]="typed() ?? value()"
                (blur)="done($any($event.target).value)" (keydown.escape)="editing.set(false)" (keydown.control.enter)="done($any($event.target).value)"></textarea>
    } @else {
      <input #field class="form-control form-control-sm" type="text" [attr.maxlength]="maxlength()" [attr.aria-label]="label()" [value]="typed() ?? value()"
             (blur)="done($any($event.target).value)" (keydown.escape)="editing.set(false)" (keydown.enter)="done($any($event.target).value)">
    }
  `,
})
export class EditInPlace {
  /** the words as written: what is changed */
  readonly value = input.required<string>();
  /** the words as they are shown to the reader */
  readonly shown = input.required<string>();
  /** what is said when there are none */
  readonly placeholder = input('');
  /** what pressing it does, in words */
  readonly label = input.required<string>();
  readonly textClass = input('');
  readonly multiline = input(false);
  readonly required = input(false);
  readonly maxlength = input.required<number>();
  readonly changed = output<string>();

  protected readonly editing = signal(false);
  /** what was typed and is on its way to be saved: it is shown until the saved words come back */
  protected readonly typed = signal<string | null>(null);
  private readonly field = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('field');

  constructor() {
    effect(() => this.field()?.nativeElement.focus());
    // the saved words are here: they are what is shown again
    effect(() => {
      this.value();
      untracked(() => this.typed.set(null));
    });
  }

  protected start(): void {
    this.editing.set(true);
  }

  protected done(text: string): void {
    if (!this.editing()) return; // left with Escape (the field loses the focus as it goes)
    this.editing.set(false);
    const next = text.trim();
    if (next === (this.typed() ?? this.value()).trim() || (this.required() && !next)) return;
    this.typed.set(next);
    this.changed.emit(next);
  }
}
