import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFilterBar } from '../../../app/jigsaw/jigsaw-filter/jigsaw-filter';
import { JigsawSearchRequest, JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawFilter, JigsawFilters } from '../../../app/models/shared/jigsaw-filter';
import { JigsawFacets } from '../../../app/models/shared/jigsaw-search';
import { PlayListFilter } from '../../play-list-filter';

/**
 * The page of the route `/play/prefs`, the preferences: **a page made of the shared component `app-jigsaw-filter`, the "Filter pictures" choices**. What is ticked is kept at once on the device and with the user, and is what the picture list is filtered by (`PlayListFilter`), so the list shows only the pictures that match; how many match, and how many there are for each choice, is counted
 * by the server (`/jigsaw-search/facets`). The title is only for a screen reader; **Show** is under the choices: it goes back to the home page (the list), where the choices are already used. Its texts are the scope `jigsawList`, in every language.
 */
@Component({
  selector: 'play-prefs',
  imports: [TranslocoDirective, RouterLink, JigsawFilterBar],
  providers: [provideTranslocoScope('jigsawList')],
  host: { class: 'd-block' },
  templateUrl: './prefs.html',
})
export class PlayPrefs implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly users = inject(JigsawUserService);
  private readonly list = inject(PlayListFilter);

  /** what the list is filtered by */
  protected readonly filter = signal<JigsawFilter>(this.list.filter());
  /** how many pictures there are for each choice, with the rest of what is chosen kept (null until they are counted, or when they could not be) */
  protected readonly facets = signal<JigsawFacets | null>(null);
  /** only the answer to the last count is used */
  private asked = 0;

  constructor() {
    // the filter that the user's own replaces (the user is read after the page is open) is shown
    effect(() => {
      const filter = this.list.filter();
      untracked(() => this.filter.set(filter));
    });
    // every choice is kept as it is made, and counted: one question gives how many match, and how many there are for each choice
    effect(() => {
      const filter = this.filter();
      untracked(() => this.list.set(filter));
      void this.recount(filter);
    });
  }

  async ngOnInit(): Promise<void> {
    await this.users.load(); // the user is read first: what a person may see depends on it
    void this.recount(this.filter());
  }

  private async recount(filter: JigsawFilter): Promise<void> {
    const ticket = ++this.asked;
    try {
      const found = await this.service.facets(JigsawFilters.query(filter) as JigsawSearchRequest);
      if (ticket === this.asked) this.facets.set(found);
    } catch {
      /* the counts stay as they were: the list says if it cannot load */
    }
  }
}
