import { Component, computed, input, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { pieceGrid } from '../../models/shared/jigsaw';
import { snapLevelOfJigsaw } from '../snap-level';
import { JigsawKinds } from '../../models/shared/jigsaw-kind';

/**
 * The top of the form of a picture (`play-picture-form`): the picture as it will look, and under and beside it the places where the form puts its own parts (`draft-*` and `draft` content): what is made, the name, the
 * description, the size, the choices and the buttons. It shows the author and the facts the form says so far.
 */
@Component({
  selector: 'app-jigsaw-header',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawNew')],
  templateUrl: './jigsaw-header.html',
})
export class JigsawHeader {
  /** the picture or jigsaw as the form has it now */
  readonly jigsaw = input.required<JigsawSpec>();
  /** the picture is shown cut into pieces (an example, passed in with `draft-picture`) instead of plain */
  readonly showExample = input(false);
  /** the words of the button in the empty place of the picture (it opens the choice of a picture: `choose`) */
  readonly chooseLabel = input('');
  /** the words of the button over the lower right corner of the picture that chooses another (empty: no button; it presses `choose` too) */
  readonly changeLabel = input('');
  /** the words of the button that takes a photo (empty: no button; it presses `shoot`) */
  readonly cameraLabel = input('');
  /** what the small icon in the upper right corner of the picture does, adjusting its cut (empty: no icon; it presses `adjust`) */
  readonly adjustLabel = input('');
  /** the address of the picture (null: none chosen yet) */
  readonly pictureSrc = input<string | null>(null);

  /** a button that chooses a picture was pressed */
  readonly choose = output<void>();
  /** the button that takes a photo was pressed */
  readonly shoot = output<void>();
  /** the icon that adjusts the cut was pressed */
  readonly adjust = output<void>();

  /** the picture could not be read: the empty place is shown */
  protected readonly hasPicture = signal(true);
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));
  /** the entry is only a picture: it is cut in each round */
  protected readonly isPicture = computed(() => JigsawKinds.isPicture(this.jigsaw()));
}
