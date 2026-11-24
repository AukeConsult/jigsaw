import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { pieceGrid } from '../../models/shared/jigsaw';
import { ShareButton } from '../share-button/share-button';
import { JigsawCategories } from '../../models/shared/category';
import { JigsawImageService } from '../jigsaw-image.service';
import { snapLevelOfJigsaw } from '../snap-level';
import { JigsawKinds } from '../../models/shared/jigsaw-kind';

/** The top of the page of a jigsaw: its picture, name, description, author and details, Edit and Delete for the owner, and the button that starts a round. */
@Component({
  selector: 'app-jigsaw-header',
  imports: [TranslocoDirective, ShareButton],
  providers: [provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawCategories'), provideTranslocoScope('jigsawNew')],
  templateUrl: './jigsaw-header.html',
})
export class JigsawHeader {
  private readonly images = inject(JigsawImageService);

  readonly jigsaw = input.required<JigsawSpec>();
  /** the entry is only being made (the form of a new jigsaw shows it as it will look): its picture is the one given as `pictureSrc`, and there is no button to play or share it */
  readonly draft = input(false);
  /** a draft shows the picture cut into pieces (an example, passed in with `draft-picture`) instead of the plain picture */
  readonly showExample = input(false);
  /** the words of the button in the empty place of a draft's picture (it opens the choice of a picture: `choose`) */
  readonly chooseLabel = input('');
  /** the words of the button over the lower right corner of a draft's picture that chooses another (empty: no button; it presses `choose` too) */
  readonly changeLabel = input('');
  /** what the heading says while a draft has no name yet */
  readonly heading = input('');
  /** the address of the picture of a draft (null: none chosen yet) */
  readonly pictureSrc = input<string | null>(null);
  /** the person may edit and delete the jigsaw */
  readonly mayChange = input(false);
  /** something is being done: the main button waits */
  readonly busy = input(false);
  /** the user has solved this jigsaw: there is no button to play it again */
  readonly solved = input(false);
  /** the way to start a round is on the page itself (the choice of a picture), so the button is not shown */
  readonly hidePlay = input(false);
  /** Delete was pressed and waits for "Yes" (the page keeps it, since it closes it when the delete fails) */
  readonly confirmingDelete = model(false);

  readonly edit = output<void>();
  readonly remove = output<void>();
  readonly play = output<void>();
  readonly addDescription = output<void>();
  /** the picture was pressed (a draft: the form shows it big) */
  readonly zoom = output<void>();
  /** the button in the empty place of a draft's picture was pressed */
  readonly choose = output<void>();

  /** the picture could not be read (a jigsaw can be made without one): nothing is shown */
  protected readonly hasPicture = signal(true);
  /** the picture of a saved jigsaw is shown big over the page (pressed to open, pressed again or Escape to close) */
  protected readonly enlarged = signal(false);
  protected readonly pictureUrl = computed(() => (this.draft() ? this.pictureSrc() : this.images.url(this.jigsaw(), 1)));
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));
  /** the categories of the jigsaw, with their icons and names (the ones the form lets a person press) */
  protected readonly categoryItems = computed(() => JigsawCategories.stored(this.jigsaw().categories).map((key) => JigsawCategories.of(key)!));
  /** the entry is only a picture: it is cut in each round */
  protected readonly isPicture = computed(() => JigsawKinds.isPicture(this.jigsaw()));
}
