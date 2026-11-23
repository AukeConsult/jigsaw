import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSummary } from '../../models/shared/jigsaw-search';
import { pieceGrid } from '../../models/shared/jigsaw';
import { CategoryTags } from '../category-tags/category-tags';
import { FavoritesService } from '../favorites.service';
import { SolvedService } from '../solved.service';
import { CardDetails } from '../card-details';
import { JigsawImageService } from '../jigsaw-image.service';
import { snapLevelOfJigsaw } from '../snap-level';

/** One jigsaw as a card: its picture with a play button, the name, the author, the pieces, the difficulty and the date. Press it to open the jigsaw. */
@Component({
  selector: 'app-jigsaw-card',
  imports: [CategoryTags, RouterLink, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-card.html',
  host: { class: 'd-block h-100' },
})
export class JigsawCard {
  private readonly images = inject(JigsawImageService);
  protected readonly favorites = inject(FavoritesService);
  private readonly solved = inject(SolvedService);
  protected readonly details = inject(CardDetails);

  readonly jigsaw = input.required<JigsawSummary>();
  /** only the picture (with the name as a tooltip), for a band where the cards are small */
  readonly pictureOnly = input(false);
  /** where pressing the card goes (the page of the jigsaw when not given): a round goes straight on with the round */
  readonly route = input<unknown[] | null>(null);
  /** the picture could not be read (a jigsaw can be made without one): the box is empty */
  protected readonly noPicture = signal(false);

  protected readonly link =computed(() => this.route() ?? ['/jigsaw', this.jigsaw().id]);
  protected readonly pictureUrl = computed(() => this.images.url(this.jigsaw(), 1));
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  /** the user has solved this jigsaw: a small mark in the corner of the picture says so */
  protected readonly isSolved = computed(() => this.solved.isSolved(this.jigsaw().id));
  protected readonly favorite = computed(() => this.favorites.isFavorite(this.jigsaw().id));

  /** The heart is pressed: the jigsaw is a favorite, or not any more. It does not open the jigsaw. */
  protected toggleFavorite(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    void this.favorites.toggle(this.jigsaw().id);
  }
  protected readonly level = computed(() => snapLevelOfJigsaw(this.jigsaw()));
}
