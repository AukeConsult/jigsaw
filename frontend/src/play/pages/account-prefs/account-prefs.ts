import { Location } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { OpenWord } from '../../../app/jigsaw/open-word/open-word';
import { PlayLook } from '../../../app/jigsaw/play-look';
import { PlayLookChoice } from '../../../app/jigsaw/play-look-choice/play-look-choice';
import { LANGUAGES, LanguageService } from '../../../app/core/language.service';
import { preferenceSignal } from '../../../app/core/preferences';
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
 * The page of the route `/play/account/preferences`: **the preferences** (not the filter of the picture list, which is `/play/prefs`), **in two cards**: Appearance (the theme of the app, `app-play-look-choice`, how big its
 * text is and in which letters, `TextLook`, whether pictures have their effects, `PictureEffects`; and under headings of their own the home page: how big the picture tiles are, `PartSizeChoice`, how much they tell, `TileDetails`: none,
 * short, details or full, and the rounds that are going, `ListView`; the menu: where it is, `MenuSpot`; and the language, in a list) and Pieces and effects (how the pieces are drawn, the effects and the sound). Choices of which one is
 * taken are joined in one row (`choice-joined`). **Every heading opens and closes its chapter** (all open to begin with; the closed ones are kept on the device). The choices are kept with the account that plays; for nobody, on the device.
 */
@Component({
  selector: 'play-account-prefs',
  imports: [TranslocoDirective, RouterLink, PlayLookChoice, OpenWord],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <!-- two cards, beside each other on a wide screen: how the app looks (with the home page, the menu and the language as parts of it), and the pieces with their effects and sound -->
    <div class="row row-cols-1 row-cols-lg-2 g-2 g-lg-3 align-items-start">
      <div class="col">
        <section class="card card-body">
          <details class="chapter" [open]="!closed().includes('appearance')" (toggle)="keepOpen('appearance', $any($event.target).open)">
          <summary><h2 class="subsection-title mt-0"><i class="bi bi-palette" aria-hidden="true"></i>{{ t('play.appearance') || 'Appearance' }}<app-open-word class="ms-auto" /></h2></summary>
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
          <details class="chapter" [open]="!closed().includes('home')" (toggle)="keepOpen('home', $any($event.target).open)">
          <summary><h3 class="form-section"><i class="bi bi-house" aria-hidden="true"></i>{{ t('play.homePage') || 'Home page' }}<app-open-word class="ms-auto" /></h3></summary>
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
          </details>
          <details class="chapter" [open]="!closed().includes('menu')" (toggle)="keepOpen('menu', $any($event.target).open)">
          <summary><h3 class="form-section"><i class="bi bi-list" aria-hidden="true"></i>{{ t('play.menuTitle') || 'Menu' }}<app-open-word class="ms-auto" /></h3></summary>
          <fieldset class="mb-0">
            <legend class="form-label mb-1">{{ t('play.menuPlace') || 'Menu position' }}</legend>
            <div class="choice-joined">
              @for (place of menuPlaces; track place) {
                <input [id]="'menu-place-' + place" class="btn-check" type="radio" name="menu-place" autocomplete="off" [checked]="menu.place() === place" (change)="menu.choose(place)">
                <label class="btn btn-sm btn-outline-primary text-nowrap" [for]="'menu-place-' + place">{{ t('play.menuPlaces.' + place) || place }}</label>
              }
            </div>
          </fieldset>
          </details>
          <details class="chapter" [open]="!closed().includes('language')" (toggle)="keepOpen('language', $any($event.target).open)">
          <summary><h3 class="form-section"><i class="bi bi-globe2" aria-hidden="true"></i>{{ t('play.languageTitle') || 'Language' }}<app-open-word class="ms-auto" /></h3></summary>
          <div class="mb-0">
            <!-- (the heading says it to the eye) -->
            <label class="visually-hidden" for="pref-language">{{ t('play.languageTitle') || 'Language' }}</label>
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
          </details>
          </details>
        </section>
      </div>
      <div class="col">
        <section class="card card-body">
          <details class="chapter" [open]="!closed().includes('pieces')" (toggle)="keepOpen('pieces', $any($event.target).open)">
          <summary><h2 class="subsection-title mt-0"><i class="bi bi-puzzle" aria-hidden="true"></i>{{ t('play.piecesAndEffects') || 'Pieces and effects' }}<app-open-word class="ms-auto" /></h2></summary>
          <app-play-look-choice idPrefix="account" [showTable]="false" [value]="look.value()" (changed)="look.set($event)" />
          </details>
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

  /** the chapters the person has closed (all are open to begin with), kept on the device */
  protected readonly closed = preferenceSignal<string[]>('play.prefsClosed', [], (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string'));

  /** A heading was pressed: the chapter is open or closed now, and stays so. */
  protected keepOpen(chapter: string, open: boolean): void {
    if (open !== this.closed().includes(chapter)) return; // (the browser also says so when a chapter is first drawn open)
    this.closed.update((now) => (open ? now.filter((c) => c !== chapter) : [...now, chapter]));
  }

  private readonly router = inject(Router);
  private readonly location = inject(Location);

  protected close(): void {
    goBack(this.location, this.router);
  }

  constructor() {
    void this.users.load(); // the account that plays brings its own choice
  }
}
