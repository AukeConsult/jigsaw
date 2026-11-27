import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/**
 * What the heading of a part that opens and closes says at its end: **Show** while it is closed, **Hide** while it is open (words, not an arrow). It goes inside the `summary` of a `details`, and the
 * stylesheet shows the right one (`.open-word`). A screen reader already says whether the part is open, so the word is only for the eye.
 */
@Component({
  selector: 'app-open-word',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay')],
  template: `<span *transloco="let t" class="open-word" aria-hidden="true"><span class="when-closed">{{ t('jigsawPlay.chapterShow') || 'Show' }}</span><span class="when-open">{{ t('jigsawPlay.chapterHide') || 'Hide' }}</span></span>`,
})
export class OpenWord {}
