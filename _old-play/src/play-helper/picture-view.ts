import { Component, OnDestroy, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFields } from '../../app/jigsaw/jigsaw-fields/jigsaw-fields';
import { HelperView } from '../core/helper-view';
import { HelperPanel } from './helper-panel';
import { NewPicture } from './new-picture';

/**
 * The view of the point "Add picture": the form to add a picture, as a play page of its own (`NewPicture` is its logic; **only components are shared with the website, never its pages**: the fields of a jigsaw are the shared
 * component `app-jigsaw-fields`, which also holds the categories and who sees it). The picture, then the name and the description and the rest, then Save (or Save and analyse, to have the AI set them).
 */
@Component({
  selector: 'picture-view',
  imports: [TranslocoDirective, JigsawFields],
  providers: [provideTranslocoScope('play'), NewPicture],
  templateUrl: './picture-view.html',
})
export class PictureView extends HelperView implements OnDestroy {
  override readonly storageKey = 'play.pictureView';
  protected readonly n = inject(NewPicture);
  private readonly panel = inject(HelperPanel);

  override ngOnDestroy(): void {
    this.n.reset();
    super.ngOnDestroy();
  }

  protected cancel(): void {
    this.panel.close();
  }
}
