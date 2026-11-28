import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../app/core/language.service';
import { isBoolean, preferenceSignal } from '../../../app/core/preferences';
import { FeedAdminKind, FeedAdminService } from '../../../app/jigsaw/feed-admin.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { FeedItemData, FeedItems, FeedStatus, PackageItem } from '../../../app/models/shared/feed-item';
import { FEED_ICONS, FEED_PATHS, priceText } from './feed-kind';

/** The status filter: all, or one of the three. */
const STATUSES = ['', 'upcoming', 'active', 'expired'] as const;

/**
 * The page of the routes `/play/mine/info` and `/play/mine/offers` (the route data `kind` says which): **the tiles of the home page that the account has written**, for a publisher or an admin (an admin sees every tile).
 * A search box, a filter on the status (upcoming, active, expired), a row for each tile with its title in the language that is chosen, its dates and its status, and Edit and Delete; the button Add makes a new one.
 * The words are written in one language and the AI makes the other languages when a tile is saved, so a tile is found by the words of any of them.
 */
@Component({
  selector: 'play-feed-list',
  imports: [TranslocoDirective, RouterLink],
  providers: [provideTranslocoScope('play', 'jigsawUser', 'jigsawNew')],
  host: { class: 'd-block' },
  templateUrl: './feed-list.html',
})
export class PlayFeedList {
  protected readonly kind: FeedAdminKind = inject(ActivatedRoute).snapshot.data['kind'];
  /** where the pages of this kind are */
  protected readonly path = FEED_PATHS[this.kind];
  protected readonly icon = FEED_ICONS[this.kind];
  private readonly service = inject(FeedAdminService);
  private readonly users = inject(JigsawUserService);
  private readonly jigsaws = inject(JigsawService);
  protected readonly language = inject(LanguageService).lang;
  protected readonly statuses = STATUSES;

  /** what was typed and the status that was chosen, kept on the device for each kind (rule 12 of `CLAUDE.md`) */
  protected readonly search = preferenceSignal(`play.feedText.${this.kind}`, '', (v): v is string => typeof v === 'string');
  protected readonly status = preferenceSignal<string>(`play.feedStatus.${this.kind}`, '', (v): v is string => STATUSES.some((s) => s === v));
  /** the list of the packages says how packages work, until the person closes it; kept on the device, and brought back by its heading */
  protected readonly help = preferenceSignal('play.packagesHelp', true, isBoolean);
  protected readonly items = signal<FeedItemData[] | null>(null);
  private readonly now = signal(Date.now());
  protected readonly failed = signal(false);
  /** the tile that Delete was pressed on, waiting for "Yes" */
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal(false);

  /** the rows: each tile as its object, so it says its title in the language, and its status */
  protected readonly rows = computed(() => (this.items() ?? []).map((data) => ({ data, item: FeedItems.of(data), status: FeedItems.of(data).status(this.now()) as FeedStatus })));

  /** what a package costs, written (nothing for a free one, and for the others) */
  protected price(item: unknown): string {
    return item instanceof PackageItem && !item.isFree ? priceText(item.price, item.currency, this.language()) : '';
  }

  /** the tile that is being deleted has pictures (a package): how many, so the question says that they go too */
  protected readonly pictureCount = signal(0);

  constructor() {
    // a new search or filter asks again (a pause after typing)
    effect((onCleanup) => {
      const search = this.search();
      const status = this.status();
      const timer = setTimeout(() => untracked(() => void this.load(search, status)), 250);
      onCleanup(() => clearTimeout(timer));
    });
  }

  private async load(search: string, status: string): Promise<void> {
    try {
      const found = await this.service.list(this.kind, search, status);
      this.items.set(found.items);
      this.now.set(found.now);
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    }
  }

  protected date(ms: number): string {
    return new Date(ms).toLocaleDateString(this.language());
  }

  /** Delete was pressed: for a package it is first told how many pictures go with it. */
  protected async askDelete(id: string): Promise<void> {
    this.pictureCount.set(0);
    this.deleting.set(id);
    if (this.kind === 'package') {
      try {
        this.pictureCount.set((await this.service.pictures(id)).length);
      } catch {
        /* the question is asked without the number */
      }
    }
  }

  /** Delete was answered with yes: a package takes its pictures with it (each is deleted first, so none is left without its package). */
  protected async remove(id: string): Promise<void> {
    this.deleting.set(null);
    this.error.set(false);
    try {
      if (this.kind === 'package') {
        const me = this.users.acting();
        for (const picture of await this.service.pictures(id)) if (me) await this.jigsaws.removeAs(picture.id, me.id);
      }
      await this.service.remove(this.kind, id);
      await this.load(this.search(), this.status());
    } catch {
      this.error.set(true);
    }
  }
}
