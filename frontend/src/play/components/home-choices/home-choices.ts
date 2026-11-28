import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PartSizeChoice } from '../../../app/jigsaw/part-sizes';
import { TileDetails } from '../../../app/jigsaw/tile-details';
import { PART_SIZES } from '../../../app/models/shared/part-size';
import { TILE_DETAILS } from '../../../app/models/shared/tile-details';
import { ListView } from '../../list-view';

/**
 * The choices that are only about the home page: how big the picture tiles are (`PartSizeChoice`), how much they tell (`TileDetails`: none, short, details or full) and whether the rounds that are going are on its top
 * (`ListView`). The preferences have them under Home page, and the panel of the home page (`play-home-panel`) too.
 */
@Component({
  selector: 'play-home-choices',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<ng-container *transloco="let t">
    <fieldset class="mb-3">
      <legend class="form-label mb-1">{{ t('play.tileSize') || 'Tile size' }}</legend>
      <div class="choice-joined">
        @for (size of sizes; track size) {
          <input [id]="'tile-size-' + size" class="btn-check" type="radio" name="tile-size" autocomplete="off" [checked]="chosen.tileSize.value() === size" (change)="chosen.tileSize.set(size)">
          <label class="btn btn-sm btn-outline-primary text-nowrap" [for]="'tile-size-' + size">{{ t('play.sizes.' + size) || size }}</label>
        }
      </div>
    </fieldset>
    <fieldset class="mb-3">
      <legend class="form-label mb-1">{{ t('play.tileDetails') || 'Details on the picture tiles' }}</legend>
      <div class="choice-joined">
        @for (level of detailLevels; track level) {
          <input [id]="'tile-details-' + level" class="btn-check" type="radio" name="tile-details" autocomplete="off" [checked]="details.value() === level" (change)="details.set(level)">
          <label class="btn btn-sm btn-outline-primary text-nowrap" [for]="'tile-details-' + level">{{ t('play.detailLevels.' + level) || level }}</label>
        }
      </div>
    </fieldset>
    <div class="form-check form-switch mb-0">
      <input id="show-ongoing" class="form-check-input" type="checkbox" role="switch" [checked]="list.ongoing.value()" (change)="list.ongoing.set($any($event.target).checked)">
      <label class="form-check-label" for="show-ongoing">{{ t('play.showOngoing') || 'Show ongoing rounds on the home page' }}</label>
    </div>
  </ng-container>`,
})
export class PlayHomeChoices {
  protected readonly chosen = inject(PartSizeChoice);
  protected readonly details = inject(TileDetails);
  protected readonly list = inject(ListView);
  protected readonly sizes = PART_SIZES;
  protected readonly detailLevels = TILE_DETAILS;
}
