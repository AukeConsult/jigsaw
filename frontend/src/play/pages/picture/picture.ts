import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../../app/core/i18n';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PictureForm } from '../../components/picture-form/picture-form';
import { PictureRounds } from '../../components/picture-rounds/picture-rounds';
import { SharePicture } from '../../components/share-picture/share-picture';
import { JigsawSpec } from '../../../app/models/shared/jigsaw-settings';

/**
 * The page of the route `/play/mine/picture/:id`, where a picture in the list of the user's pictures leads: **a picture that is there**. It frames the form of a picture (`play-picture-form`, the same form as Add picture) and
 * the rounds that have been played of the picture (`play-picture-rounds`). **The user's own picture is open for changes at once** (there is no Edit to press first), with Save and Cancel in the form, and a red Delete on top of it
 * (asked first: the picture and all its rounds go). Only its owner changes a picture (an admin too; anybody else only looks), and not its picture, size or cut once rounds have been played of it: the form knows. The menu of the helper
 * (`pictureMenu`) has the way back. Save and Cancel go back to where the picture was opened from.
 */
@Component({
  selector: 'play-picture',
  imports: [TranslocoDirective, RouterLink, PictureForm, PictureRounds, SharePicture],
  providers: [provideTranslocoScope('jigsawUser', 'play')],
  host: { class: 'd-block' },
  templateUrl: './picture.html',
})
export class PlayPicture {
  private readonly router = inject(Router);
  private readonly jigsaws = inject(JigsawService);
  private readonly users = inject(JigsawUserService);
  private readonly address = inject(ActivatedRoute).snapshot;
  protected readonly id = this.address.paramMap.get('id') ?? '';
  /** opened from the detail of a package (`?package=`): the link on top, Save, Cancel and Delete go back there, since that is where the person was */
  protected readonly fromPackage = this.address.queryParamMap.get('package');
  protected readonly packagePage = `/play/mine/packages/${encodeURIComponent(this.fromPackage ?? '')}/pictures`;

  /** opened from the page before the puzzle (`?from=round`, where the owner or an admin has Edit or delete): Save and Cancel go back there; after Delete there is nothing to go back to */
  protected readonly fromRound = this.address.queryParamMap.get('from') === 'round';

  /** the person may change the picture (its owner, or an admin): what the form found out */
  protected readonly mayChange = signal(false);
  /** Delete was pressed and waits for "Yes" */
  protected readonly confirmingDelete = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** the picture as it is saved, for sending it (read when the page opens) */
  protected readonly picture = signal<JigsawSpec | null>(null);

  constructor() {
    void this.jigsaws.get(this.id).then((found) => this.picture.set(found), () => undefined);
  }

  /** back to where the picture was opened from */
  protected leave(): Promise<boolean> {
    if (this.fromRound) return this.router.navigate(['/play/round', this.id], { replaceUrl: true });
    return this.router.navigateByUrl(this.fromPackage ? this.packagePage : '/play/mine/pictures');
  }

  /** The picture is deleted for good, with its picture and all its rounds (only its owner can), and the person goes back to the list of their pictures. */
  protected async remove(): Promise<void> {
    const me = this.users.acting();
    this.confirmingDelete.set(false);
    if (!me || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.jigsaws.removeAs(this.id, me.id);
      await (this.fromRound ? this.router.navigateByUrl('/play/list', { replaceUrl: true }) : this.leave());
    } catch {
      this.error.set(tr('play.picture.couldNotDelete', 'Could not delete the picture: only its owner can.'));
      this.busy.set(false);
    }
  }
}
