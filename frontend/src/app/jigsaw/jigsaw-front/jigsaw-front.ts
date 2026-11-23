import { Component, ElementRef, computed, effect, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isBoolean, readPreference, writePreference } from '../../core/preferences';
import { scrollParent } from '../../core/theme';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JigsawFinder } from '../jigsaw-finder/jigsaw-finder';
import { JigsawUserService } from '../jigsaw-user.service';
import { MyRounds } from '../my-rounds/my-rounds';
import { AllRounds } from '../all-rounds/all-rounds';
import { QuickFilters } from '../quick-filters/quick-filters';
import { SolvedService } from '../solved.service';
import { StartWelcome } from '../start-welcome/start-welcome';

/** The new front page, at `/`: a welcome that fades away (`app-start-welcome`), the user's open rounds, and the finder, where the jigsaws are looked for and picked. The older front page stays at `/jigsaw`. */
@Component({
  selector: 'app-jigsaw-front',
  imports: [TranslocoDirective, JigsawFinder, MyRounds, AllRounds, StartWelcome, QuickFilters],
  host: { class: 'd-block', '(document:click)': 'toTop($event)' },
  providers: [provideTranslocoScope('jigsawHome'), provideTranslocoScope('jigsawList')],
  templateUrl: './jigsaw-front.html',
})
export class JigsawFront {
  /** what is looked for on this page: the finder reads what the Find page chose and says it here; the quick filters change it */
  protected readonly filter = signal<JigsawFilter>(JigsawFilters.empty());
  /** the open rounds are read: the jigsaws are asked for after them, so the band is there before the list and the list does not jump down when it comes */
  protected readonly roundsLoaded = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly solved = inject(SolvedService);
  protected readonly users = inject(JigsawUserService);
  /** the button "Rounds" is on: the rounds of the users are shown in place of the jigsaws (kept on the device, as the other choices of a page) */
  protected readonly roundsOn = signal(readPreference('jigsaw.roundsList', false, isBoolean));
  /** the list of rounds is shown: the button is on, and somebody plays (the API says who asks, so it needs a user) */
  protected readonly roundsShown = computed(() => this.roundsOn() && !!this.users.acting());

  constructor() {
    this.solved.refresh(); // a round may have been solved since the list was last shown
    effect(() => writePreference('jigsaw.roundsList', this.roundsOn()));
  }

  /** A click anywhere on the background of the page (not on a card, a button, a link, a field or the menu) takes the list back to the top. */
  protected toTop(event: MouseEvent): void {
    if ((event.target as Element).closest('a, button, input, select, textarea, label, app-jigsaw-card, app-jigsaw-row, nav, .app-navbar, .dropdown-menu, .modal, details')) return;
    const own = this.host.nativeElement;
    const page = own.scrollHeight > own.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(own).overflowY) ? own : scrollParent(own); // on a phone the page itself scrolls
    if (page) page.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
