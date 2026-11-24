import { Component, computed, input, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawCategories } from '../../models/shared/category';
import { JIGSAW_KINDS } from '../../models/shared/jigsaw-kind';
import { JIGSAW_FILTER_FIELDS, JigsawFilter, JigsawFilterField, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JIGSAW_LANGUAGES } from '../../models/shared/language';
import { MOTIVES } from '../../models/shared/motive';
import { DIFFICULTIES, JigsawFacets, NO_OWNER, SEARCH_MAX_OWNERS, SIZE_CLASSES } from '../../models/shared/jigsaw-search';

/** The lists a filter has to tick from. */
type TickedField = Exclude<JigsawFilterField, 'text' | 'favorites' | 'solved'>;

/**
 * The choices of what jigsaws to look for, all shown, to tick: words in the name or the author, the categories (and, under each ticked one, its sub-categories, which can be left
 * blank), the sizes, the difficulties, the languages and who made them. One or more can be ticked in each list: any of them is looked for, and what is ticked in the different lists together. Use it
 * wherever jigsaws are looked for: the page binds the filter (`[(filter)]`) and gives the owners to choose from; a page that leaves a choice out names the ones it wants in
 * `fields`. The rules are those of `JigsawFilters`; this only turns what the person does into a new filter.
 */
@Component({
  selector: 'app-jigsaw-filter',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawCategories')],
  templateUrl: './jigsaw-filter.html',
})
export class JigsawFilterBar {
  /** what is chosen (a new filter is made at each choice) */
  readonly filter = model<JigsawFilter>(JigsawFilters.empty());
  /** which choices are shown (all of them when not said) */
  readonly fields = input<readonly JigsawFilterField[]>(JIGSAW_FILTER_FIELDS);
  /** how many jigsaws there are for each choice, with the rest of the filter kept (null until they are counted): shown beside each tick, and what the owners and the languages to tick from are */
  readonly facets = input<JigsawFacets | null>(null);
  /** a prefix that makes the ids of the fields different when there are two filters on a page */
  readonly idPrefix = input('filter');

  protected readonly kinds = JIGSAW_KINDS;
  protected readonly categories = JigsawCategories.all();
  protected readonly sizes = SIZE_CLASSES;
  protected readonly difficulties = DIFFICULTIES;
  protected readonly motives = MOTIVES;
  protected readonly owners = computed(() => this.facets()?.owners ?? []);
  /** the languages to tick from: all of them, always (a count of 0 says there is none, as for the categories), so the list does not grow and shrink with what is chosen and the page below it does not jump */
  protected readonly languages = computed(() => JIGSAW_LANGUAGES);
  protected readonly maxOwners = SEARCH_MAX_OWNERS;
  protected readonly noOwner = NO_OWNER;
  /** the ticked categories that have sub-categories to tick from, in the order they are shown */
  protected readonly withSubs = computed(() => this.categories.filter((c) => c.subs.length && JigsawFilters.isChosen(this.filter(), 'categories', c.key)));

  /** Whether a choice is shown: it is one of the `fields`, owners only when there are some to tick from, and languages only when there are some. */
  protected shows(field: JigsawFilterField): boolean {
    return this.fields().includes(field) && (field !== 'owners' || this.owners().length > 0) && (field !== 'languages' || this.languages().length > 0);
  }

  /** how many jigsaws a choice gives, as it is shown beside it (nothing until they are counted) */
  protected count(field: Exclude<TickedField, 'owners'>, value: string): string {
    const facets = this.facets();
    return facets ? `(${facets[field]?.[value] ?? 0})` : ''; // a server older than the kinds sends no counts for them: none, not a crash
  }

  protected chosen(field: TickedField, value: string): boolean {
    return JigsawFilters.isChosen(this.filter(), field, value);
  }

  protected canChoose(field: TickedField, value: string): boolean {
    return JigsawFilters.canChoose(this.filter(), field, value);
  }

  /** Ticks the value, or takes it away when it is ticked. */
  protected toggle(field: TickedField, value: string): void {
    this.filter.set(JigsawFilters.toggled(this.filter(), field, value));
  }
}
