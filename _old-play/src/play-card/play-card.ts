import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { FavoritesService } from '../../app/jigsaw/favorites.service';
import { JigsawImageService } from '../../app/jigsaw/jigsaw-image.service';
import { snapLevelOfJigsaw } from '../../app/jigsaw/snap-level';
import { SolvedService } from '../../app/jigsaw/solved.service';
import { pieceGrid } from '../../app/models/shared/jigsaw';
import { JigsawKinds } from '../../app/models/shared/jigsaw-kind';
import { JigsawSummary } from '../../app/models/shared/jigsaw-search';

/** One jigsaw as a card (a fresh copy of the website's card for the app): its picture with a play button, the name, the pieces and the difficulty. Press it to open the jigsaw (it says so with `open`). */
@Component({
  selector: 'play-card',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  templateUrl: './play-card.html',
  host: { class: 'd-block h-100' },
})
export class PlayCard {
  private readonly images = inject(JigsawImageService);
  protected readonly favorites = inject(FavoritesService);
  private readonly solved = inject(SolvedService);

  readonly jigsaw = input.required<JigsawSummary>();
  /** the picture could not be read (a jigsaw can be made without one): the box is empty */
  protected readonly noPicture = signal(false);

  /** the card was pressed: the id of its jigsaw. The app never uses routing, so a card links to no page: what opens it is decided by whoever shows the card (nothing does yet). */
  readonly open = output<string>();
  protected readonly pictureUrl = computed(() => this.images.url(this.jigsaw(), 1));
  /** the entry is only a picture: it is cut in each round */
  protected readonly isPicture = computed(() => JigsawKinds.isPicture(this.jigsaw()));
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  /** the user has solved this jigsaw: a small mark in the corner of the picture says so */
  protected readonly isSolved = computed(() => this.solved.isSolved(this.jigsaw().id));
  protected readonly favorite = computed(() => this.favorites.isFavorite(this.jigsaw().id));
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));

  /** The heart is pressed: the jigsaw is a favorite, or not any more. It does not open the jigsaw. */
  protected toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    void this.favorites.toggle(this.jigsaw().id);
  }
}
