import { Component, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { preferenceSignal } from '../../core/preferences';

/** how a list of the user's own is shown: a row for each, or cards */
export const VIEW_SHAPES = ['list', 'cards'] as const;
export type ViewShape = (typeof VIEW_SHAPES)[number];
/** what a card shows: only the picture, or also what is told about it */
export const CARD_INFOS = ['picture', 'info'] as const;
export type CardInfo = (typeof CARD_INFOS)[number];

/** Rows or cards, as chosen on the page that keeps it under this key (rows to begin with). */
export const viewShapePreference = (key: string) => preferenceSignal<ViewShape>(key, 'list', (v): v is ViewShape => VIEW_SHAPES.some((s) => s === v));
/** What a card shows, as chosen on the page that keeps it under this key (also the info, to begin with). */
export const cardInfoPreference = (key: string) => preferenceSignal<CardInfo>(key, 'info', (v): v is CardInfo => CARD_INFOS.some((i) => i === v));

/**
 * **The switches of a list of the user's own** (My pictures, My rounds): rows or cards, and for cards only the picture or also its info, as icons side by side.
 * The page owns the two choices and keeps them (`[(view)]`, `[(cardInfo)]`).
 */
@Component({
  selector: 'app-view-switch',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawUser')],
  host: { class: 'd-flex gap-4' },
  template: `<ng-container *transloco="let t">
    @if (view() === 'cards') {
      <div class="segmented" role="group" [attr.aria-label]="t('jigsawUser.cardShows') || 'What a card shows'">
        <input id="card-shows-picture" type="radio" class="btn-check" name="card-shows" autocomplete="off" [checked]="cardInfo() === 'picture'" [attr.aria-label]="t('jigsawUser.onlyPicture') || 'Only the picture'" (change)="cardInfo.set('picture')">
        <label class="btn" for="card-shows-picture" [title]="t('jigsawUser.onlyPicture') || 'Only the picture'"><i class="bi bi-image icon-md" aria-hidden="true"></i></label>
        <input id="card-shows-info" type="radio" class="btn-check" name="card-shows" autocomplete="off" [checked]="cardInfo() === 'info'" [attr.aria-label]="t('jigsawUser.withInfo') || 'With info'" (change)="cardInfo.set('info')">
        <label class="btn" for="card-shows-info" [title]="t('jigsawUser.withInfo') || 'With info'"><i class="bi bi-card-text icon-md" aria-hidden="true"></i></label>
      </div>
    }
    <div class="segmented" role="group" [attr.aria-label]="t('jigsawUser.view') || 'View'">
      <input id="view-list" type="radio" class="btn-check" name="view" autocomplete="off" [checked]="view() === 'list'" [attr.aria-label]="t('jigsawUser.viewList') || 'List'" (change)="view.set('list')">
      <label class="btn" for="view-list" [title]="t('jigsawUser.viewList') || 'List'"><i class="bi bi-list-ul icon-md" aria-hidden="true"></i></label>
      <input id="view-cards" type="radio" class="btn-check" name="view" autocomplete="off" [checked]="view() === 'cards'" [attr.aria-label]="t('jigsawUser.viewCards') || 'Cards'" (change)="view.set('cards')">
      <label class="btn" for="view-cards" [title]="t('jigsawUser.viewCards') || 'Cards'"><i class="bi bi-grid-fill icon-md" aria-hidden="true"></i></label>
    </div>
  </ng-container>`,
})
export class ViewSwitch {
  readonly view = model.required<ViewShape>();
  readonly cardInfo = model.required<CardInfo>();
}
