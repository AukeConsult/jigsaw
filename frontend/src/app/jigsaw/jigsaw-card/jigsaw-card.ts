import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { pieceGrid } from '../../models/shared/jigsaw';
import { JigsawImageService } from '../jigsaw-image.service';
import { snapLevelOfJigsaw } from '../snap-level';

/** One jigsaw as a card: its picture with a play button, the name, the author, the pieces, the difficulty and the date. Press it to open the jigsaw. */
@Component({
  selector: 'app-jigsaw-card',
  imports: [RouterLink, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-card.html',
  host: { class: 'd-block h-100' },
})
export class JigsawCard {
  private readonly images = inject(JigsawImageService);

  readonly jigsaw = input.required<JigsawSpec>();
  /** the picture could not be read (a jigsaw can be made without one): the box is empty */
  protected readonly noPicture = signal(false);

  protected readonly pictureUrl = computed(() => this.images.url(this.jigsaw().id, 1));
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));
}
