import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { PlayLook } from '../../../app/jigsaw/play-look';
import { PlayLookChoice } from '../../../app/jigsaw/play-look-choice/play-look-choice';
import { LANGUAGES, LanguageService } from '../../../app/core/language.service';
import { TextLook } from '../../../app/jigsaw/text-look';
import { TileDetails } from '../../../app/jigsaw/tile-details';
import { PictureEffects } from '../../../app/jigsaw/picture-effects';
import { TILE_DETAILS } from '../../../app/models/shared/tile-details';
import { PartSizeChoice } from '../../../app/jigsaw/part-sizes';
import { FONTS, TEXT_SIZES } from '../../../app/models/shared/text-look';
import { PART_SIZES } from '../../../app/models/shared/part-size';
import { goBack } from '../../go-back';
import { ListView } from '../../list-view';
import { MenuSpot } from '../../helper/menu-spot';
import { MENU_PLACES } from '../../../app/models/shared/menu-place';

/**
 * The page of the route `/play/account/preferences`: **the preferences** (not the filter of the picture list, which is `/play/prefs`), **a card for each thing they change**: Pieces and effects (`app-play-look-choice`), Appearance (the theme of the app, the same component, how big its
 * text is and in which letters, `TextLook`, and whether pictures have their effects, `PictureEffects`), Home page (how big the picture tiles are, `PartSizeChoice`, how much they tell, `TileDetails`: none, short, details or full, and the rounds that are going, `ListView`), Menu (where it is, `MenuSpot`) and
 * Language and sound (the language in a list, and the sound of the puzzle). Choices of which one is taken are joined in one row (`choice-joined`). They are kept with the account that plays; for nobody, on the device.
 */
@Component({
  selector: 'play-account-prefs',
  imports: [TranslocoDirective, RouterLink, PlayLookChoice],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <!-- one card for each thing the choices change: the look, the pieces and effects, the home page, the menu, and the language and sound; two beside each other on a wide screen -->
    <div class="row row-cols-1 row-cols-lg-2 g-2 g-lg-3">
      <div class="col">
        <section class="card card-body h-100">
          <h2 class="subsection-title mt-0"><i class="bi bi-palette me-2" aria-hidden="true"></i>{{ t('play.appearance') || 'Appearance' }}</h2>
          <app-play-look-choice idPrefix="account" [label]="t('play.theme') || 'Theme'" [showPieces]="false" [showSound]="false" [value]="look.value()" (changed)="look.set($event)" />
          <fieldset class="mb-3">
            <legend class="form-label mb-1">{{ t('play.textSize') || 'Text size' }}</legend>
            <div class="choice-joined">
              @for (size of sizes; track size) {
                <input [id]="'text-size-' + size" class="btn-check" type="radio" name="text-size" autocomplete="off" [checked]="text.value().size === size" (change)="text.set({ size })">
                <label class="btn btn-sm btn-outline-primary text-nowrap" [for]="'text-size-' + size">{{ t('play.textSizes.' + size) || size }}</label>
              }
            </div>
          </fieldset>
          <fieldset class="mb-3">
            <legend class="form-label mb-1">{{ t('play.font') || 'Font' }}</legend>
            <div class="choice-joined">
              @for (font of fonts; track font) {
                <input [id]="'font-' + font" class="btn-check" type="radio" name="font" autocomplete="off" [checked]="text.value().font === font" (change)="text.set({ font })">
                <label class="btn btn-sm btn-outline-primary text-nowrap" [attr.data-font-sample]="font" [for]="'font-' + font">{{ t('play.fonts.' + font) || font }}</label>
              }
            </div>
          </fieldset>
          <div class="form-check form-switch mb-0">
            <input id="picture-effects" class="form-check-input" type="checkbox" role="switch" [checked]="pictureEffects.on.value()" (change)="pictureEffects.on.set($any($event.target).checked)">
            <label class="form-check-label" for="picture-effects">{{ t('play.pictureEffects') || 'Effects on pictures' }}</label>
          </div>
        </section>
      </div>
      <div class="col">
        <section class="card card-body h-100">
          <h2 class="subsection-title mt-0"><i class="bi bi-puzzle me-2" aria-hidden="true"></i>{{ t('play.piecesAndEffects') || 'Pieces and effects' }}</h2>
          <app-play-look-choice idPrefix="account" [showTable]="false" [showSound]="false" [value]="look.value()" (changed)="look.set($event)" />
        </section>
      </div>
      <div class="col">
        <section class="card card-body h-100">
          <h2 class="subsection-title mt-0"><i class="bi bi-house me-2" aria-hidden="true"></i>{{ t('play.homePage') || 'Home page' }}</h2>
          <fieldset class="mb-3">
            <legend class="form-label mb-1">{{ t('play.tileSize') || 'Tile size' }}</legend>
            <div class="choice-joined">
              @for (size of partSizes; track size) {
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
        </section>
      </div>
      <div class="col">
        <section class="card card-body h-100">
          <h2 class="subsection-title mt-0"><i class="bi bi-list me-2" aria-hidden="true"></i>{{ t('play.menuTitle') || 'Menu' }}</h2>
          <fieldset class="mb-3">
            <legend class="form-label mb-1">{{ t('play.menuPlace') || 'Menu position' }}</legend>
            <div class="choice-joined">
              @for (place of menuPlaces; track place) {
                <input [id]="'menu-place-' + place" class="btn-check" type="radio" name="menu-place" autocomplete="off" [checked]="menu.place() === place" (change)="menu.choose(place)">
                <label class="btn btn-sm btn-outline-primary text-nowrap" [for]="'menu-place-' + place">{{ t('play.menuPlaces.' + place) || place }}</label>
              }
            </div>
          </fieldset>
        </section>
      </div>
      <div class="col">
        <section class="card card-body h-100">
          <h2 class="subsection-title mt-0"><i class="bi bi-globe2 me-2" aria-hidden="true"></i>{{ t('play.languageAndSound') || 'Language and sound' }}</h2>
          <div class="mb-3">
            <label class="form-label mb-1" for="pref-language">{{ t('play.languageTitle') || 'Language' }}</label>
            <!-- the languages in a list, with the flag of the one in use beside it -->
            <div class="input-group input-group-sm">
              <span class="input-group-text"><img class="flag" [src]="'flags/' + language.lang() + '.svg'" alt="" width="24" height="16"></span>
              <select id="pref-language" name="language" class="form-select" (change)="users.changeLanguage($any($event.target).value)">
                @for (l of languages; track l.code) {
                  <option [value]="l.code" [selected]="language.lang() === l.code">{{ l.name }}</option>
                }
              </select>
            </div>
          </div>
          <app-play-look-choice idPrefix="account" [showTable]="false" [showPieces]="false" [value]="look.value()" (changed)="look.set($event)" />
        </section>
      </div>
    </div>
    <p class="form-text text-center mt-3 mb-0">
      {{ t('play.themeApplies') || 'The theme is used on every page of the app and on the puzzle. A round can have its own.' }}
      @if (users.acting()) {
        {{ t('play.keptWithAccount') || 'Kept with your account, so it is the same on all your devices.' }}
      } @else {
        {{ t('play.keptOnDevice') || 'Kept on this device.' }} <a class="link-inline" routerLink="/play/account">{{ t('play.logon') || 'Logon' }}</a>
      }
    </p>
    <!-- every choice is kept as it is made: Close only leaves the page -->
    <div class="d-flex justify-content-center mt-3">
      <button type="button" class="btn btn-primary" (click)="close()"><i class="bi bi-x-lg me-1" aria-hidden="true"></i>{{ t('play.close') || 'Close' }}</button>
    </div>
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
  protected readonly detailLevels = TILE_DETAILS;
  protected readonly pictureEffects = inject(PictureEffects);
  protected readonly list = inject(ListView);
  protected readonly menu = inject(MenuSpot);
  protected readonly menuPlaces = MENU_PLACES;
  protected readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  protected readonly partSizes = PART_SIZES;

  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected close(): void {
    goBack(this.location, this.router);
  }

  constructor() {
    void this.users.load(); // the account that plays brings its own choice
  }
}
