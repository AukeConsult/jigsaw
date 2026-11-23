import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { FRONT_FINDER_KEY, readFinderPreferences, writeFinderPreferences } from '../jigsaw-finder/finder-preferences';
import { JigsawFilterBar } from '../jigsaw-filter/jigsaw-filter';
import { JigsawFacets } from '../../models/shared/jigsaw-search';
import { JigsawSearchRequest, JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { ViewSwitch } from '../view-switch/view-switch';

/**
 * The page to find a jigsaw (`/jigsaw/find`, in the menu): the choices of how to show the jigsaws (cards or list) and what to look for, how many jigsaws match what is chosen and how many there are for each choice (counted at
 * each choice), and a Go button. Go keeps what was chosen for the front page (on this device, and with the user) and goes there: the front page shows the jigsaws that match, the newest first. When none match it is
 * said, and Go waits. The choices start as they were the last time.
 */
/** How long reading the counts has to take before the spinner is shown (milliseconds). */
const SPINNER_AFTER_MS = 3000;

@Component({
  selector: 'app-jigsaw-find',
  imports: [TranslocoDirective, JigsawFilterBar, ViewSwitch],
  providers: [provideTranslocoScope('jigsawList')],
  templateUrl: './jigsaw-find.html',
})
export class JigsawFind implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly router = inject(Router);
  private readonly users = inject(JigsawUserService);

  /** how the jigsaws are shown on the front page, chosen here with what is looked for */
  readonly view = signal<'list' | 'cards'>('cards');
  readonly filter = signal<JigsawFilter>(JigsawFilters.empty());
  /** how many jigsaws there are for each choice, with the rest of what is chosen kept (null until they are counted, or when they could not be) */
  readonly facets = signal<JigsawFacets | null>(null);
  /** how many jigsaws match what is chosen */
  readonly count = computed(() => this.facets()?.total ?? null);
  /** the counts are being read (the bar at the top of the page moves meanwhile) */
  readonly loading = signal(true);
  /** the spinner is shown only when reading has taken more than 3 seconds (a quick answer shows nothing, so nothing flashes) */
  readonly slow = signal(false);
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  /** something is chosen: Reset all can be pressed */
  readonly chosen = computed(() => JigsawFilters.isOn(this.filter()));
  /** only the answer to the last count is used */
  private asked = 0;

  constructor() {
    // each choice is counted: one question gives how many match, and how many there are for each choice of the filter
    effect(() => {
      const filter = this.filter();
      void this.recount(filter);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.users.load(); // the user is read first: a device with no search of its own takes the user's
    const saved = readFinderPreferences(FRONT_FINDER_KEY);
    this.view.set(saved.view);
    this.filter.set(saved.filter);
  }

  private async recount(filter: JigsawFilter): Promise<void> {
    const ticket = ++this.asked;
    this.loading.set(true);
    clearTimeout(this.slowTimer);
    this.slowTimer = setTimeout(() => this.slow.set(this.loading()), SPINNER_AFTER_MS);
    try {
      const found = await this.service.facets(JigsawFilters.query(filter) as JigsawSearchRequest);
      if (ticket === this.asked) this.facets.set(found);
    } catch {
      /* the counts stay as they were: Go still works, and the front page says if it cannot load */
    } finally {
      if (ticket === this.asked) {
        clearTimeout(this.slowTimer);
        this.loading.set(false);
        this.slow.set(false);
      }
    }
  }

  /** Reset all: nothing is chosen (every jigsaw), and the counts are read again. */
  protected resetAll(): void {
    this.filter.set(JigsawFilters.empty());
  }

  /** Go: what is chosen (cards or list, and what to look for) is kept, and the front page shows the jigsaws that match. */
  protected go(): void {
    const setup = { view: this.view(), filter: this.filter() };
    writeFinderPreferences(FRONT_FINDER_KEY, setup); // on this device
    void this.users.saveSearch(setup).catch(() => undefined); // and with the user, so it is the same on every device
    void this.router.navigate(['/']);
  }
}
