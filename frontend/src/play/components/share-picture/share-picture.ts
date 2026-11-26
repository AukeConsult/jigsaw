import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { ShareButton } from '../../../app/jigsaw/share-button/share-button';
import { ShareKeyService, pictureLink } from '../../../app/jigsaw/share-keys';
import { JigsawSpec } from '../../../app/models/shared/jigsaw-settings';

/**
 * **Sending a picture to somebody** (`app-share-button` with the address of the picture): anybody sends a public one, as it is. A private one is sent by its owner only, with the key in the link: whoever gets it can see
 * and play it, and the owner can make a new link, which stops the ones sent before (`renewable`: the page has that button). A hidden picture and a picture of a package are not sent (nothing is shown).
 */
@Component({
  selector: 'play-share-picture',
  imports: [TranslocoDirective, ShareButton],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block text-center' },
  template: `
    <ng-container *transloco="let t">
      @if (link(); as url) {
        <app-share-button variant="button" [url]="url" />
        @if (isPrivate()) {
          <p class="tiny text-body-secondary mt-1 mb-0">{{ t('play.linkPlays') || 'Anybody who gets this link can see this picture and play it.' }}</p>
          @if (renewable()) {
            <button type="button" class="link-inline tiny" [disabled]="busy()" (click)="renew()">{{ t('play.newLink') || 'Make a new link: the old one stops working' }}</button>
            @if (renewed()) {
              <p class="tiny text-success mb-0" role="status">{{ t('play.newLinkMade') || 'A new link is made. Share it again.' }}</p>
            }
          }
        }
      }
    </ng-container>
  `,
})
export class SharePicture {
  readonly jigsaw = input.required<JigsawSpec>();
  /** the page has the button that makes a new link */
  readonly renewable = input(false);

  private readonly users = inject(JigsawUserService);
  private readonly keys = inject(ShareKeyService);

  protected readonly isPrivate = computed(() => this.jigsaw().visibility === 'owner');
  /** the key of a private picture of one's own (read when the page opens, so pressing Share opens the device's dialog at once) */
  private readonly key = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly renewed = signal(false);

  /** what is sent (null: this person has nothing to send of this picture) */
  protected readonly link = computed(() => {
    const jigsaw = this.jigsaw();
    if (jigsaw.packageId || jigsaw.visibility === 'hidden') return null;
    if (!this.isPrivate()) return pictureLink(jigsaw.id);
    const key = this.key();
    return key ? pictureLink(jigsaw.id, key) : null;
  });

  constructor() {
    effect(() => {
      const jigsaw = this.jigsaw();
      const me = this.users.acting()?.id;
      untracked(() => {
        this.key.set(null);
        if (jigsaw.visibility === 'owner' && !jigsaw.packageId && me && jigsaw.ownerUid === me) void this.keys.key(jigsaw.id).then((key) => this.key.set(key), () => undefined);
      });
    });
  }

  protected async renew(): Promise<void> {
    this.busy.set(true);
    this.renewed.set(false);
    try {
      this.key.set(await this.keys.renew(this.jigsaw().id));
      this.renewed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
