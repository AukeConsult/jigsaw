import { Component, input, output } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { playSnap } from '../../board/snap-sound';
import { isBoolean, preferenceSignal } from '../../core/preferences';
import { PIECE_EFFECT_GROUPS, PIECE_STYLES, PieceEffect, PieceEffectGroup, PlayLookSetup, PlayLooks, SOUND_STYLES, SoundStyle, TABLES } from '../../models/shared/play-look';

/**
 * The choices of how the play area looks and sounds (`PlayLooks`): the table, as pills with a spot of each; how the pieces look, and the effects (a switch each, under a line that opens them); the sound of a click into place, what it
 * sounds like, and a tap as a piece is picked up or put down. Each part can be left out, where a page has them apart. It shows what it is given and tells what is chosen: the account's preference, or a round's own.
 */
@Component({
  selector: 'app-play-look-choice',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay')],
  host: { class: 'd-block' },
  template: `
    <ng-container *transloco="let t">
      @if (showTable()) {
        <fieldset class="mb-3">
          <legend class="form-label mb-1">{{ label() || t('jigsawPlay.table') || 'Table' }}</legend>
          <div class="d-flex flex-wrap gap-2">
            @for (name of tables; track name) {
              <input [id]="idPrefix() + '-table-' + name" [name]="idPrefix() + 'Table'" class="btn-check" type="radio" autocomplete="off" [checked]="value().table === name" (change)="changed.emit({ table: name })">
              <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [for]="idPrefix() + '-table-' + name"><span class="table-swatch me-1" [attr.data-table]="name" aria-hidden="true"></span>{{ t('jigsawPlay.tables.' + name) || name }}</label>
            }
          </div>
        </fieldset>
      }
      @if (showPieces()) {
        <fieldset class="mb-3">
          <legend class="form-label mb-1">{{ t('jigsawPlay.pieces') || 'Pieces' }}</legend>
          <div class="d-flex flex-wrap gap-2">
            @for (name of pieceStyles; track name) {
              <input [id]="idPrefix() + '-pieces-' + name" [name]="idPrefix() + 'Pieces'" class="btn-check" type="radio" autocomplete="off" [checked]="value().pieces === name" (change)="changed.emit({ pieces: name })">
              <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [for]="idPrefix() + '-pieces-' + name">{{ t('jigsawPlay.pieceStyles.' + name) || name }}</label>
            }
          </div>
        </fieldset>
        <details class="more-options mb-3" [open]="open()" (toggle)="open.set($any($event.target).open)">
          <summary><i class="bi bi-stars me-1" aria-hidden="true"></i>{{ t('jigsawPlay.effects') || 'Effects' }}</summary>
          @for (group of groups; track group) {
            <fieldset class="mt-2">
              <legend class="form-label mb-1">{{ t('jigsawPlay.effectGroups.' + group) || group }}</legend>
              <div class="d-flex flex-wrap column-gap-3 row-gap-1">
                @for (effect of effectsOf[group]; track effect) {
                  <div class="form-check form-switch mb-0">
                    <input [id]="idPrefix() + '-effect-' + effect" class="form-check-input" type="checkbox" role="switch" [checked]="value().effects.includes(effect)" (change)="switchEffect(effect, $any($event.target).checked)">
                    <label class="form-check-label" [for]="idPrefix() + '-effect-' + effect">{{ t('jigsawPlay.effectNames.' + effect) || effect }}</label>
                  </div>
                }
              </div>
            </fieldset>
          }
          <p class="form-text mb-0">{{ t('jigsawPlay.lessMotion') || 'A device that is set to less motion shows no moving effects.' }}</p>
        </details>
      }
      @if (showSound()) {
        <div class="form-check form-switch mb-2">
          <input [id]="idPrefix() + '-sound'" class="form-check-input" type="checkbox" role="switch" [checked]="value().sound" (change)="changed.emit({ sound: $any($event.target).checked })">
          <label class="form-check-label" [for]="idPrefix() + '-sound'"><i class="bi me-1" [class.bi-volume-up]="value().sound" [class.bi-volume-mute]="!value().sound" aria-hidden="true"></i>{{ t('jigsawPlay.sound') || 'Sound when a piece clicks' }}</label>
        </div>
        @if (value().sound) {
          <fieldset class="mb-2">
            <legend class="form-label mb-1">{{ t('jigsawPlay.soundStyle') || 'Kind of sound' }}</legend>
            <div class="d-flex flex-wrap gap-2">
              @for (name of soundStyles; track name) {
                <input [id]="idPrefix() + '-soundstyle-' + name" [name]="idPrefix() + 'SoundStyle'" class="btn-check" type="radio" autocomplete="off" [checked]="value().soundStyle === name" (change)="chooseSound(name)">
                <label class="btn btn-sm btn-outline-primary rounded-pill text-nowrap" [for]="idPrefix() + '-soundstyle-' + name">{{ t('jigsawPlay.soundStyles.' + name) || name }}</label>
              }
            </div>
          </fieldset>
          <div class="form-check form-switch mb-3">
            <input [id]="idPrefix() + '-effect-taps'" class="form-check-input" type="checkbox" role="switch" [checked]="value().effects.includes('taps')" (change)="switchEffect('taps', $any($event.target).checked)">
            <label class="form-check-label" [for]="idPrefix() + '-effect-taps'">{{ t('jigsawPlay.effectNames.taps') || 'Tap when a piece is picked up or put down' }}</label>
          </div>
        }
      }
    </ng-container>
  `,
})
export class PlayLookChoice {
  readonly value = input.required<PlayLookSetup>();
  readonly showTable = input(true);
  readonly showPieces = input(true);
  readonly showSound = input(true);
  /** what the ids of the fields begin with (the choices can be on a page more than once) */
  readonly idPrefix = input('look');
  /** what the choice of table is called (empty: Table; on the account preferences it is the theme of the app) */
  readonly label = input('');
  readonly changed = output<Partial<PlayLookSetup>>();
  protected readonly tables = TABLES;
  protected readonly pieceStyles = PIECE_STYLES;
  protected readonly soundStyles = SOUND_STYLES;
  /** the effects that are seen, by when (the taps are a sound: they are with the sound) */
  protected readonly groups: readonly PieceEffectGroup[] = ['moving', 'clicking', 'milestones'];
  protected readonly effectsOf: Record<PieceEffectGroup, readonly PieceEffect[]> = PIECE_EFFECT_GROUPS;
  /** whether the effects are open, as the person left them */
  protected readonly open = preferenceSignal('jigsaw.effectsOpen', false, isBoolean);

  protected switchEffect(effect: PieceEffect, on: boolean): void {
    this.changed.emit({ effects: PlayLooks.withEffect(this.value().effects, effect, on) });
  }

  /** A kind of sound is chosen: it is heard at once. */
  protected chooseSound(soundStyle: SoundStyle): void {
    playSnap(1, soundStyle);
    this.changed.emit({ soundStyle });
  }
}
