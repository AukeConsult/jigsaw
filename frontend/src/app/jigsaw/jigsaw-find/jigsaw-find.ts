import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { FRONT_FINDER_KEY, readFinderPreferences, writeFinderPreferences } from '../jigsaw-finder/finder-preferences';
import { JigsawFilterBar } from '../jigsaw-filter/jigsaw-filter';
import { JigsawFacets } from '../../models/shared/jigsaw-search';
import { JigsawSearchRequest, JigsawService } from '../jigsaw.service';
import { ViewSwitch } from '../view-switch/view-switch';

/**
 * The page to find a jigsaw (`/jigsaw/find`, in the menu): the choices of how to show the jigsaws (cards or list) and what to look for, how many jigsaws match what is chosen and how many there are for each choice (counted at
 * each choice), and a Go button. Go keeps what was chosen for the front page and goes there: the front page shows the jigsaws that match, the newest first. When none match it is
 * said, and Go waits. The choices start as they were the last time.
 */
@Component({
  selector: 'app-jigsaw-find',
  imports: [TranslocoDirective, JigsawFilterBar, ViewSwitch],
  providers: [provideTranslocoScope('jigsawList')],
  templateUrl: './jigsaw-find.html',
})
export class JigsawFind {
  private readonly service = inject(JigsawService);
  private readonly router = inject(Router);

  private readonly saved = readFinderPreferences(FRONT_FINDER_KEY);
  /** how the jigsaws are shown on the front page, chosen here with what is looked for */
  readonly view = signal<'list' | 'cards'>(this.saved.view);
  readonly filter = signal<JigsawFilter>(this.saved.filter);
  /** how many jigsaws there are for each choice, with the rest of what is chosen kept (null until they are counted, or when they could not be) */
  readonly facets = signal<JigsawFacets | null>(null);
  /** how many jigsaws match what is chosen */
  readonly count = computed(() => this.facets()?.total ?? null);
  /** only the answer to the last count is used */
  private asked = 0;

  constructor() {
    // each choice is counted: one question gives how many match, and how many there are for each choice of the filter
    effect(() => {
      const filter = this.filter();
      void this.recount(filter);
    });
  }

  private async recount(filter: JigsawFilter): Promise<void> {
    const ticket = ++this.asked;
    try {
      const found = await this.service.facets(JigsawFilters.query(filter) as JigsawSearchRequest);
      if (ticket === this.asked) this.facets.set(found);
    } catch {
      /* the counts stay as they were: Go still works, and the front page says if it cannot load */
    }
  }

  /** Go: what is chosen (cards or list, and what to look for) is kept, and the front page shows the jigsaws that match. */
  protected go(): void {
    writeFinderPreferences(FRONT_FINDER_KEY, { view: this.view(), filter: this.filter() });
    void this.router.navigate(['/']);
  }
}
