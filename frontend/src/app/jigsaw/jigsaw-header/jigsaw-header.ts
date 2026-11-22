import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { pieceGrid } from '../../models/shared/jigsaw';
import { JigsawImageService } from '../jigsaw-image.service';
import { snapLevelOfJigsaw } from '../snap-level';

/** The top of the page of a jigsaw: its picture, name, description, author and details, Edit and Delete for the owner, and the button that starts a round. */
@Component({
  selector: 'app-jigsaw-header',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-header.html',
})
export class JigsawHeader {
  private readonly images = inject(JigsawImageService);

  readonly jigsaw = input.required<JigsawSpec>();
  /** the person may edit and delete the jigsaw */
  readonly mayChange = input(false);
  /** the edit panel is open */
  readonly editing = input(false);
  /** something is being done: the main button waits */
  readonly busy = input(false);
  /** Delete was pressed and waits for "Yes" (the page keeps it, since it closes it when the delete fails) */
  readonly confirmingDelete = model(false);

  readonly edit = output<void>();
  readonly remove = output<void>();
  readonly play = output<void>();
  readonly addDescription = output<void>();

  /** the picture could not be read (a jigsaw can be made without one): nothing is shown */
  protected readonly hasPicture = signal(true);
  protected readonly pictureUrl = computed(() => this.images.url(this.jigsaw().id, 1));
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));
}
