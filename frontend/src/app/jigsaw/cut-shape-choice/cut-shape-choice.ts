import { Component, input, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CUT_SHAPES, CutShape, DEFAULT_CUT_SHAPE } from '../../models/shared/cut-shape';
import { JigsawCut } from '../../models/shared/jigsaw';

/** the side of the sample piece, in the pixels of its drawing */
const SIDE = 24;

/** **The choice of the shape of the pieces** (`CutShapes`): each with a sample piece drawn as the pieces are, and its name, joined in one row. At the start of a round of a picture and in the form of a ready jigsaw. */
@Component({
  selector: 'app-cut-shape-choice',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawLevels')],
  host: { class: 'd-block' },
  template: `<fieldset class="mb-0" [disabled]="disabled()" *transloco="let t">
    <legend class="form-label mb-1">{{ t('jigsawLevels.cut') || 'Shape of the pieces' }}</legend>
    <div class="choice-joined">
      @for (sample of samples; track sample.shape) {
        <input [id]="name() + '-' + sample.shape" class="btn-check" type="radio" [name]="name()" autocomplete="off" [checked]="value() === sample.shape" (change)="value.set(sample.shape)">
        <label class="btn btn-sm btn-outline-primary" [for]="name() + '-' + sample.shape">
          <svg class="cut-sample" viewBox="-7 -7 38 38" aria-hidden="true"><path [attr.d]="sample.path" /></svg>
          <span class="d-block tiny">{{ t('jigsawLevels.cuts.' + sample.shape) || sample.shape }}</span>
        </label>
      }
    </div>
  </fieldset>`,
})
export class CutShapeChoice {
  readonly value = model<CutShape>(DEFAULT_CUT_SHAPE);
  /** what the radio buttons are called (the choice can be on more than one page) */
  readonly name = input('cut-shape');
  readonly disabled = input(false);
  protected readonly samples = CUT_SHAPES.map((shape) => ({ shape, path: JigsawCut.path(SIDE, { top: 1, right: -1, bottom: 1, left: -1, shape }) }));
}
