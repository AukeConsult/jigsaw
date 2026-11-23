import { Component, computed, input, model, OnDestroy } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawCategories } from '../../models/shared/category';
import { JIGSAW_FILTER_FIELDS, JigsawFilter, JigsawFilterField, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JIGSAW_LANGUAGES } from '../../models/shared/language';
import { MOTIVES } from '../../models/shared/motive';
import { DIFFICULTIES, JigsawFacets, NO_OWNER, SEARCH_MAX_OWNERS, SEARCH_MAX_TEXT, SIZE_CLASSES } from '../../models/shared/jigsaw-search';

/** How long the typing of the text waits before it is used: so a question is not asked at every letter. */
const TEXT_PAUSE_MS = 300;

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
export class JigsawFilterBar implements OnDestroy {
  /** what is chosen (a new filter is made at each choice) */
  readonly filter = model<JigsawFilter>(JigsawFilters.empty());
  /** which choices are shown (all of them when not said) */
  readonly fields = input<readonly JigsawFilterField[]>(JIGSAW_FILTER_FIELDS);
  /** how many jigsaws there are for each choice, with the rest of the filter kept (null until they are counted): shown beside each tick, and what the owners and the languages to tick from are */
  readonly facets = input<JigsawFacets | null>(null);
  /** a prefix that makes the ids of the fields different when there are two filters on a page */
  readonly idPrefix = input('filter');

  protected readonly categories = JigsawCategories.all();
  protected readonly sizes = SIZE_CLASSES;
  protected readonly difficulties = DIFFICULTIES;
  protected readonly motives = MOTIVES;
  protected readonly owners = computed(() => this.facets()?.owners ?? []);
  /** the languages to tick from: only those that jigsaws have (and one that is ticked), all of them until they are counted */
  protected readonly languages = computed(() => {
    const facets = this.facets();
    return facets ? JIGSAW_LANGUAGES.filter((l) => (facets.languages[l.code] ?? 0) > 0 || this.filter().languages.includes(l.code)) : JIGSAW_LANGUAGES;
  });
  protected readonly maxOwners = SEARCH_MAX_OWNERS;
  protected readonly noOwner = NO_OWNER;
  protected readonly maxText = SEARCH_MAX_TEXT;
  /** the ticked categories that have sub-categories to tick from, in the order they are shown */
  protected readonly withSubs = computed(() => this.categories.filter((c) => c.subs.length && JigsawFilters.isChosen(this.filter(), 'categories', c.key)));
  protected readonly on = computed(() => JigsawFilters.isOn(this.filter()));
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Whether a choice is shown: it is one of the `fields`, owners only when there are some to tick from, and languages only when there are some. */
  protected shows(field: JigsawFilterField): boolean {
    return this.fields().includes(field) && (field !== 'owners' || this.owners().length > 0) && (field !== 'languages' || this.languages().length > 0);
  }

  /** how many jigsaws a choice gives, as it is shown beside it (nothing until they are counted) */
  protected count(field: Exclude<TickedField, 'owners'>, value: string): string {
    const facets = this.facets();
    return facets ? `(${facets[field][value] ?? 0})` : '';
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

  /** The text is typed: it is used when the typing has paused. */
  protected typed(text: string): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.filter.set(JigsawFilters.withText(this.filter(), text)), TEXT_PAUSE_MS);
  }

  protected clear(): void {
    clearTimeout(this.timer);
    this.filter.set(JigsawFilters.empty());
  }

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }
}
