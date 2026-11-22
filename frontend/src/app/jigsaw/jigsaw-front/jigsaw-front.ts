import { Component, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JigsawFinder } from '../jigsaw-finder/jigsaw-finder';
import { MyRounds } from '../my-rounds/my-rounds';
import { QuickFilters } from '../quick-filters/quick-filters';
import { StartWelcome } from '../start-welcome/start-welcome';

/** The new front page, at `/`: a welcome that fades away (`app-start-welcome`), the user's open rounds, and the finder, where the jigsaws are looked for and picked. The older front page stays at `/jigsaw`. */
@Component({
  selector: 'app-jigsaw-front',
  imports: [TranslocoDirective, JigsawFinder, MyRounds, StartWelcome, QuickFilters],
  host: { class: 'd-block' },
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './jigsaw-front.html',
})
export class JigsawFront {
  /** what is looked for on this page: the finder reads what the Find page chose and says it here; the quick filters change it */
  protected readonly filter = signal<JigsawFilter>(JigsawFilters.empty());
}
