import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CategoryTags } from '../../../app/jigsaw/category-tags/category-tags';
import { FavoritesService } from '../../../app/jigsaw/favorites.service';
import { JigsawImageService } from '../../../app/jigsaw/jigsaw-image.service';
import { snapLevelOfJigsaw } from '../../../app/jigsaw/snap-level';
import { SolvedService } from '../../../app/jigsaw/solved.service';
import { pieceGrid } from '../../../app/models/shared/jigsaw';
import { JigsawKinds } from '../../../app/models/shared/jigsaw-kind';
import { JigsawSummary } from '../../../app/models/shared/jigsaw-search';

/** One jigsaw as a card (a fresh copy of the website's card for the app): its picture with a play button, the name, the pieces and the difficulty, and the details a player can leave out (`TileDetails`). Press it to open its puzzle, or, for a picture, the start of a round. */
@Component({
  selector: 'play-card',
  imports: [TranslocoDirective, RouterLink, DatePipe, CategoryTags],
  providers: [provideTranslocoScope('play'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawList')],
  templateUrl: './play-card.html',
  host: { class: 'd-block h-100' },
})
export class PlayCard {
  private readonly images = inject(JigsawImageService);
  private readonly router = inject(Router);
  protected readonly favorites = inject(FavoritesService);
  private readonly solved = inject(SolvedService);

  readonly jigsaw = input.required<JigsawSummary>();
  /** the card is in the detail of this package: a press opens the page of the picture ready to be changed, not the start of a round */
  readonly editIn = input<string | null>(null);
  /** the picture belongs to a package the person has not got: it has a lock; a press opens it to be looked at (no round is started there) */
  readonly locked = input(false);
  /** the picture is among others and comes from a package: the name on its tag, which leads to the package ('' when the name is not known; null: no tag) */
  readonly packageName = input<string | null>(null);
  /** the picture could not be read (a jigsaw can be made without one): the box is empty */
  protected readonly noPicture = signal(false);

  /** The card was pressed: it opens the page before the puzzle (`/play/round/:id`): a ready jigsaw is looked at there, and a picture, which is cut in each round, has its round chosen. */
  protected show(): void {
    const pack = this.editIn();
    if (pack) return void this.router.navigate(['/play/mine/picture', this.jigsaw().id], { queryParams: { package: pack } });
    void this.router.navigate(['/play/round', this.jigsaw().id]);
  }
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
