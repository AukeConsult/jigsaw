import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../../app/core/i18n';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PictureForm } from '../../components/picture-form/picture-form';
import { PictureRounds } from '../../components/picture-rounds/picture-rounds';
import { PictureView } from '../../picture-view';

/**
 * The page of the route `/play/mine/picture/:id`, where a picture in the list of the user's pictures leads: **a picture that is there**. It frames the form of a picture (`play-picture-form`, the same form as Add picture, here only looked at) and
 * the rounds that have been played of the picture (`play-picture-rounds`), and has the buttons **outside the form**: Edit (the form can be changed, with Save and Cancel in it) and Delete (asked first: the picture and all its rounds go), for its
 * owner only. Only its owner changes a picture, and not its picture, size or cut once rounds have been played of it: the form knows. There is no menu of its own on the page: the menu of the helper (`pictureMenu`) has the switches for the form
 * and for the rounds (`PictureView`). When the changes are saved the form is only looked at again.
 */
@Component({
  selector: 'play-picture',
  imports: [TranslocoDirective, RouterLink, PictureForm, PictureRounds],
  providers: [provideTranslocoScope('jigsawUser', 'play')],
  host: { class: 'd-block' },
  templateUrl: './picture.html',
})
export class PlayPicture {
  protected readonly view = inject(PictureView);
  private readonly router = inject(Router);
  private readonly jigsaws = inject(JigsawService);
  private readonly users = inject(JigsawUserService);
  private readonly address = inject(ActivatedRoute).snapshot;
  protected readonly id = this.address.paramMap.get('id') ?? '';
  /** opened from the detail of a package (`?package=`): the link on top and Delete go back there, since that is where the person was */
  protected readonly fromPackage = this.address.queryParamMap.get('package');
  protected readonly packagePage = `/play/mine/packages/${encodeURIComponent(this.fromPackage ?? '')}/pictures`;

  /** the form can be changed (Edit was pressed, or the page was opened with `?edit`), or it is only looked at */
  protected readonly editing = signal(this.address.queryParamMap.has('edit'));
  /** the person may change the picture (its owner, or an admin): what the form found out */
  protected readonly mayChange = signal(false);
  /** Delete was pressed and waits for "Yes" */
  protected readonly confirmingDelete = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  /** The picture is deleted for good, with its picture and all its rounds (only its owner can), and the person goes back to the list of their pictures. */
  protected async remove(): Promise<void> {
    const me = this.users.acting();
    this.confirmingDelete.set(false);
    if (!me || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.jigsaws.removeAs(this.id, me.id);
      await this.router.navigateByUrl(this.fromPackage ? this.packagePage : '/play/mine/pictures');
    } catch {
      this.error.set(tr('play.picture.couldNotDelete', 'Could not delete the picture: only its owner can.'));
      this.busy.set(false);
    }
  }
}
