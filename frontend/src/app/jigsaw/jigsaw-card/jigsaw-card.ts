import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSummary } from '../../models/shared/jigsaw-search';
import { JigsawImageService } from '../jigsaw-image.service';
import { ArrivingPicture } from '../../core/arriving-picture';

/** One jigsaw as a small card: its picture, with the name as a tooltip, and under it what the page puts there. Press the picture to go where `route` says. */
@Component({
  selector: 'app-jigsaw-card',
  imports: [RouterLink, TranslocoDirective, ArrivingPicture],
  providers: [provideTranslocoScope('jigsawList')],
  templateUrl: './jigsaw-card.html',
  host: { class: 'd-block h-100' },
})
export class JigsawCard {
  private readonly images = inject(JigsawImageService);

  readonly jigsaw = input.required<JigsawSummary>();
  /** where pressing the card goes */
  readonly route = input.required<unknown[]>();
  /** the picture could not be read (a jigsaw can be made without one): the box is empty */
  protected readonly noPicture = signal(false);

  protected readonly pictureUrl = computed(() => this.images.url(this.jigsaw(), 1));
}
