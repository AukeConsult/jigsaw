import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { PlayLook } from '../../../app/jigsaw/play-look';
import { PlayLookChoice } from '../../../app/jigsaw/play-look-choice/play-look-choice';
import { LanguageService } from '../../../app/core/language.service';
import { LanguageField } from '../../../app/jigsaw/language-field/language-field';
import { TextLook } from '../../../app/jigsaw/text-look';
import { PictureEffects } from '../../../app/jigsaw/picture-effects';
import { FONTS, TEXT_SIZES } from '../../../app/models/shared/text-look';
import { goBack } from '../../go-back';
import { PlayHomeChoices } from '../../components/home-choices/home-choices';
import { MenuSpot } from '../../helper/menu-spot';
import { MENU_PLACES } from '../../../app/models/shared/menu-place';

/**
 * The page of the route `/play/account/preferences`: **the preferences** (not the filter of the picture list, which is `/play/prefs`), **in two cards**: Appearance (the theme of the app, `app-play-look-choice`, how big its
 * text is and in which letters, `TextLook`, whether pictures have their effects, `PictureEffects`; and under headings of their own the home page (`play-home-choices`, also in the panel of the home page);
 * the menu: where it is, `MenuSpot`; and the language, in a list) and Pieces and effects (how the pieces are drawn, the effects and the sound). Choices of which one is
 * taken are joined in one row (`choice-joined`). Everything is shown: nothing on the page opens or closes. The choices are kept with the account that plays; for nobody, on the device.
 */
@Component({
  selector: 'play-account-prefs',
  imports: [TranslocoDirective, RouterLink, PlayLookChoice, PlayHomeChoices, LanguageField],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <!-- two cards, beside each other on a wide screen: how the app looks (with the home page, the menu and the language as parts of it), and the pieces with their effects and sound -->
    <div class="row row-cols-1 row-cols-lg-2 g-2 g-lg-3 align-items-start">
      <div class="col">
        <section class="card card-body">
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
          <h3 class="form-section border-0 pb-0"><i class="bi bi-house" aria-hidden="true"></i>{{ t('play.homePage') || 'Home page' }}</h3>
          <play-home-choices />
          <h3 class="form-section border-0 pb-0"><i class="bi bi-list" aria-hidden="true"></i>{{ t('play.menuTitle') || 'Menu' }}</h3>
          <fieldset class="mb-0">
            <legend class="form-label mb-1">{{ t('play.menuPlace') || 'Menu position' }}</legend>
            <div class="choice-joined">
              @for (place of menuPlaces; track place) {
                <input [id]="'menu-place-' + place" class="btn-check" type="radio" name="menu-place" autocomplete="off" [checked]="menu.place() === place" (change)="menu.choose(place)">
                <label class="btn btn-sm btn-outline-primary text-nowrap" [for]="'menu-place-' + place">{{ t('play.menuPlaces.' + place) || place }}</label>
              }
            </div>
          </fieldset>
          <h3 class="form-section border-0 pb-0"><i class="bi bi-globe2" aria-hidden="true"></i>{{ t('play.languageTitle') || 'Language' }}</h3>
          <div class="mb-0">
            <!-- (the heading says it to the eye) -->
            <label class="visually-hidden" for="pref-language">{{ t('play.languageTitle') || 'Language' }}</label>
            <!-- the languages in a list, with the flag of the one in use beside it -->
            <app-language-field fieldId="pref-language" [value]="language.lang()" [compact]="true" (chosen)="users.changeLanguage($event)" />
          </div>
        </section>
      </div>
      <div class="col">
        <section class="card card-body">
          <h2 class="subsection-title mt-0"><i class="bi bi-puzzle me-2" aria-hidden="true"></i>{{ t('play.piecesAndEffects') || 'Pieces and effects' }}</h2>
          <app-play-look-choice idPrefix="account" [showTable]="false" [foldEffects]="false" [value]="look.value()" (changed)="look.set($event)" />
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
  protected readonly pictureEffects = inject(PictureEffects);
  protected readonly menu = inject(MenuSpot);
  protected readonly menuPlaces = MENU_PLACES;
  protected readonly language = inject(LanguageService);

  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected close(): void {
    goBack(this.location, this.router);
  }

  constructor() {
    void this.users.load(); // the account that plays brings its own choice
  }
}
