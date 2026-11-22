import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { pieceGrid } from '../../models/shared/jigsaw';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { snapLevelOfJigsaw } from '../snap-level';

/** One jigsaw as a row of a list: the small picture, the name and author, the button to show it, and under them the difficulty, pieces, size and date. */
@Component({
  selector: 'app-jigsaw-row',
  imports: [RouterLink, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-row.html',
})
export class JigsawRow {
  private readonly images = inject(JigsawImageService);
  protected readonly users = inject(JigsawUserService);

  readonly jigsaw = input.required<JigsawSpec>();
  /** the picture could not be read (a jigsaw can be made without one): the box is empty */
  protected readonly noPicture = signal(false);

  protected readonly pictureUrl = computed(() => this.images.url(this.jigsaw().id, 1));
  protected readonly grid = computed(() => {
    const j = this.jigsaw();
    return pieceGrid(j.width, j.height, j.gridSize);
  });
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));
}
