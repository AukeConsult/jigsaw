import { Component, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { FeedTile } from '../../../app/jigsaw/feed-tile/feed-tile';
import { FeedService } from '../../../app/jigsaw/feed.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { MyJigsaws } from '../../../app/jigsaw/my-jigsaws/my-jigsaws';
import { FeedItem } from '../../../app/models/shared/feed-item';

/**
 * The page of the route `/play/mine/pictures`: **the packages the user has added or bought**, as tiles that open them (only while there are any), and the pictures the user has made, in the list of the jigsaw app (the component
 * `app-my-jigsaws`, in its mode `inApp`: no adding here, since the app has its own Add picture, and no links to the pages of the website).
 */
@Component({
  selector: 'play-my-pictures',
  imports: [TranslocoDirective, MyJigsaws, FeedTile],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <h1 class="page-title">{{ t('play.myPictures') || 'My pictures' }}</h1>
    @if (packages().length) {
      <section class="mb-4">
        <h2 class="subsection-title"><i class="bi bi-box-seam me-2" aria-hidden="true"></i>{{ t('play.myPackages') || 'My packages' }}</h2>
        <div class="row row-cols-2 row-cols-sm-3 row-cols-lg-4 g-2 g-sm-3">
          @for (pack of packages(); track pack.id) {
            <div class="col"><app-feed-tile [item]="pack" /></div>
          }
        </div>
      </section>
      <h2 class="subsection-title">{{ t('play.pictures') || 'Pictures' }}</h2>
    }
    <app-my-jigsaws [inApp]="true" />
  </main>`,
})
export class PlayMyPictures {
  private readonly feed = inject(FeedService);
  private readonly users = inject(JigsawUserService);
  /** the packages the account that plays has got */
  protected readonly packages = signal<FeedItem[]>([]);

  constructor() {
    // read when the page is opened, and again when another account plays
    effect(() => {
      const me = this.users.acting()?.id;
      untracked(() => {
        this.packages.set([]);
        if (me) void this.feed.mine().then((found) => this.packages.set(found));
      });
    });
  }
}
