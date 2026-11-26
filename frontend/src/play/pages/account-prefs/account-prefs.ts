import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { PlayLook } from '../../../app/jigsaw/play-look';
import { PlayLookChoice } from '../../../app/jigsaw/play-look-choice/play-look-choice';
import { LanguageSelect } from '../../../app/jigsaw/language-select/language-select';
import { TextLook } from '../../../app/jigsaw/text-look';
import { TileDetails } from '../../../app/jigsaw/tile-details';
import { PartSizeChoice } from '../../../app/jigsaw/part-sizes';
import { FONTS, TEXT_SIZES } from '../../../app/models/shared/text-look';
import { PART_SIZES, SIZED_PARTS } from '../../../app/models/shared/part-size';
import { ListView } from '../../list-view';

/**
 * The page of the route `/play/account/preferences`: **the preferences** (not the filter of the picture list, which is `/play/prefs`): the language, what the home page shows (`ListView`), the theme of the app and the sound of the puzzle (`app-play-look-choice`), how big its text is and in which letters (`TextLook`), how big the picture tiles and the small labels are (`PartSizeChoice`), and whether the tiles tell their details (`TileDetails`). They
 * are kept with the account that plays; for nobody, on the device.
 */
@Component({
  selector: 'play-account-prefs',
  imports: [TranslocoDirective, RouterLink, PlayLookChoice, LanguageSelect],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <section class="card card-body mb-3">
      <h2 class="subsection-title mt-0"><i class="bi bi-house me-2" aria-hidden="true"></i>{{ t('play.languageAndHome') || 'Language and home page' }}</h2>
      <div class="form-label mb-1">{{ t('play.languageTitle') || 'Language' }}</div>
      <div class="list-group mb-3 align-self-start"><app-language-select /></div>
      <div class="form-check form-switch mb-0">
        <input id="show-ongoing" class="form-check-input" type="checkbox" role="switch" [checked]="list.ongoing()" (change)="list.ongoing.set($any($event.target).checked)">
        <label class="form-check-label" for="show-ongoing">{{ t('play.showOngoing') || 'Show ongoing rounds on the home page' }}</label>
      </div>
    </section>
    <section class="card card-body">
      <h2 class="subsection-title mt-0"><i class="bi bi-palette me-2" aria-hidden="true"></i>{{ t('play.lookAndSound') || 'Look and sound' }}</h2>
      <app-play-look-choice idPrefix="account" [label]="t('play.theme') || 'Theme'" [value]="look.value()" (changed)="look.set($event)" />
      <p class="form-text mt-0 mb-3">{{ t('play.themeApplies') || 'The theme is used on every page of the app and on the puzzle. A round can have its own.' }}</p>
      <fieldset class="mb-3">
        <legend class="form-label mb-1">{{ t('play.textSize') || 'Text size' }}</legend>
        <div class="d-flex flex-wrap gap-2">
          @for (size of sizes; track size) {
            <input [id]="'text-size-' + size" class="btn-check" type="radio" name="textSize" autocomplete="off" [checked]="text.value().size === size" (change)="text.set({ size })">
            <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [for]="'text-size-' + size">{{ t('play.textSizes.' + size) || size }}</label>
          }
        </div>
      </fieldset>
      <fieldset class="mb-3">
        <legend class="form-label mb-1">{{ t('play.font') || 'Font' }}</legend>
        <div class="d-flex flex-wrap gap-2">
          @for (font of fonts; track font) {
            <input [id]="'font-' + font" class="btn-check" type="radio" name="font" autocomplete="off" [checked]="text.value().font === font" (change)="text.set({ font })">
            <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [attr.data-font-sample]="font" [for]="'font-' + font">{{ t('play.fonts.' + font) || font }}</label>
          }
        </div>
      </fieldset>
      @for (part of parts; track part) {
        <fieldset class="mb-3">
          <legend class="form-label mb-1">{{ t('play.' + part) || part }}</legend>
          <div class="d-flex flex-wrap gap-2">
            @for (size of partSizes; track size) {
              <input [id]="part + '-' + size" class="btn-check" type="radio" [name]="part" autocomplete="off" [checked]="chosen[part].value() === size" (change)="chosen[part].set(size)">
              <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [for]="part + '-' + size">{{ t('play.sizes.' + size) || size }}</label>
            }
          </div>
        </fieldset>
      }
      <div class="form-check form-switch mb-3">
        <input id="tile-details" class="form-check-input" type="checkbox" role="switch" [checked]="details.shown()" (change)="details.set($any($event.target).checked)">
        <label class="form-check-label" for="tile-details">{{ t('play.tileDetails') || 'Show details on the picture tiles' }}</label>
      </div>
      <p class="form-text mb-0">
        @if (users.acting()) {
          {{ t('play.keptWithAccount') || 'Kept with your account, so it is the same on all your devices.' }}
        } @else {
          {{ t('play.keptOnDevice') || 'Kept on this device.' }} <a class="link-inline" routerLink="/play/account">{{ t('play.logon') || 'Logon' }}</a>
        }
      </p>
    </section>
  </main>`,
})
export class PlayAccountPrefs {
  protected readonly users = inject(JigsawUserService);
  protected readonly look = inject(PlayLook);
  protected readonly text = inject(TextLook);
  protected readonly sizes = TEXT_SIZES;
  protected readonly fonts = FONTS;
  protected readonly chosen = inject(PartSizeChoice);
  protected readonly details = inject(TileDetails);
  protected readonly list = inject(ListView);
  protected readonly parts = SIZED_PARTS;
  protected readonly partSizes = PART_SIZES;

  constructor() {
    void this.users.load(); // the account that plays brings its own choice
  }
}
