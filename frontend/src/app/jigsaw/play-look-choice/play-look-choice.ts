import { Component, input, output } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PlayLookSetup, TABLES } from '../../models/shared/play-look';

/** The choices of how the play area looks and sounds (`PlayLooks`): the table, as pills with a spot of each, and the sound of a click into place. It shows what it is given and tells what is chosen: the account's preference, or a round's own. */
@Component({
  selector: 'app-play-look-choice',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay')],
  host: { class: 'd-block' },
  template: `
    <ng-container *transloco="let t">
      <fieldset class="mb-3">
        <legend class="form-label mb-1">{{ label() || t('jigsawPlay.table') || 'Table' }}</legend>
        <div class="d-flex flex-wrap gap-2">
          @for (name of tables; track name) {
            <input [id]="idPrefix() + '-table-' + name" [name]="idPrefix() + 'Table'" class="btn-check" type="radio" autocomplete="off" [checked]="value().table === name" (change)="changed.emit({ table: name })">
            <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [for]="idPrefix() + '-table-' + name"><span class="table-swatch me-1" [attr.data-table]="name" aria-hidden="true"></span>{{ t('jigsawPlay.tables.' + name) || name }}</label>
          }
        </div>
      </fieldset>
      <div class="form-check form-switch mb-3">
        <input [id]="idPrefix() + '-sound'" class="form-check-input" type="checkbox" role="switch" [checked]="value().sound" (change)="changed.emit({ sound: $any($event.target).checked })">
        <label class="form-check-label" [for]="idPrefix() + '-sound'"><i class="bi me-1" [class.bi-volume-up]="value().sound" [class.bi-volume-mute]="!value().sound" aria-hidden="true"></i>{{ t('jigsawPlay.sound') || 'Sound when a piece clicks' }}</label>
      </div>
    </ng-container>
  `,
})
export class PlayLookChoice {
  readonly value = input.required<PlayLookSetup>();
  /** what the ids of the fields begin with (the choices can be on a page more than once) */
  readonly idPrefix = input('look');
  /** what the choice of table is called (empty: Table; on the account preferences it is the theme of the app) */
  readonly label = input('');
  readonly changed = output<Partial<PlayLookSetup>>();
  protected readonly tables = TABLES;
}
