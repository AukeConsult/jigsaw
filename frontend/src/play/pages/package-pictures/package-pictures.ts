import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../app/core/language.service';
import { FeedAdminService } from '../../../app/jigsaw/feed-admin.service';
import { JigsawBatch } from '../../../app/jigsaw/jigsaw-batch/jigsaw-batch';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { FeedItems, PackageItem } from '../../../app/models/shared/feed-item';
import { JigsawSummary } from '../../../app/models/shared/jigsaw-search';
import { TileShapes } from '../../../app/models/shared/tile-shape';
import { PlayCard } from '../../components/play-card/play-card';
import { priceText } from '../feed/feed-kind';

/**
 * The page of the route `/play/mine/packages/:id/pictures`, **the detail of a package**, for the one who wrote it (or an admin): the pictures that are in it and the upload of more. The pictures are ordinary
 * pictures (the same collection as every other) that are linked to the package (`packageId`); here they are looked at as cards in their own shapes, a press on one opens the page of the picture to change it, and each can be deleted. **Many files are chosen at once** (the component
 * `app-jigsaw-batch`, in its mode for a package: only pictures, each linked to the package; the AI sets its name and categories), and the list is read again as each one is made.
 */
@Component({
  selector: 'play-package-pictures',
  imports: [TranslocoDirective, RouterLink, PlayCard, JigsawBatch],
  providers: [provideTranslocoScope('play', 'jigsawUser')],
  host: { class: 'd-block' },
  templateUrl: './package-pictures.html',
})
export class PlayPackagePictures {
  protected readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly admin = inject(FeedAdminService);
  private readonly jigsaws = inject(JigsawService);
  private readonly users = inject(JigsawUserService);
  protected readonly language = inject(LanguageService).lang;

  protected readonly item = signal<PackageItem | null>(null);
  protected readonly missing = signal(false);
  protected readonly pictures = signal<JigsawSummary[] | null>(null);
  /** the width of a picture's tile for each unit of its height */
  protected shapeOf(picture: JigsawSummary): number {
    return TileShapes.of(picture.width, picture.height);
  }
  /** the picture that Delete was pressed on, waiting for "Yes" */
  protected readonly deleting = signal<string | null>(null);
  protected readonly error = signal(false);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const found = await this.admin.get('package', this.id);
      this.item.set(FeedItems.of(found.item) as PackageItem);
      await this.reload();
    } catch {
      this.missing.set(true);
    }
  }

  /** The pictures are read again (after one is made or deleted). */
  protected async reload(): Promise<void> {
    try {
      this.pictures.set(await this.admin.pictures(this.id));
    } catch {
      this.pictures.set(this.pictures() ?? []);
    }
  }

  protected price(item: PackageItem): string {
    return item.isFree ? '' : priceText(item.price, item.currency, this.language());
  }

  protected async remove(picture: JigsawSummary): Promise<void> {
    const me = this.users.acting();
    this.deleting.set(null);
    this.error.set(false);
    if (!me) return;
    try {
      await this.jigsaws.removeAs(picture.id, me.id);
      await this.reload();
    } catch {
      this.error.set(true);
    }
  }
}
