import { Component, computed, effect, input, model, untracked } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawCategories, JigsawCategory } from '../../models/shared/category';
import { JIGSAW_KINDS } from '../../models/shared/jigsaw-kind';
import { JIGSAW_FILTER_FIELDS, JigsawFilter, JigsawFilterField, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JIGSAW_LANGUAGES } from '../../models/shared/language';
import { MOTIVES } from '../../models/shared/motive';
import { DIFFICULTIES, FILTER_VISIBILITIES, JigsawFacets, NO_OWNER, SEARCH_MAX_OWNERS, SIZE_CLASSES } from '../../models/shared/jigsaw-search';

/** The lists a filter has to tick from. */
type TickedField = Exclude<JigsawFilterField, 'text' | 'favorites' | 'solved'>;
const TICKED_FIELDS: readonly TickedField[] = ['kinds', 'categories', 'sizes', 'difficulties', 'motives', 'languages', 'owners', 'visibilities'];

/**
 * The choices offered unless a page asks for others: the category and the language, which every entry has. Not the type (what it is: not needed), not the size and the difficulty (only ready jigsaws have them: a picture is cut, and its difficulty chosen, in each round), and not the motive
 * difficulty or who made it (not every entry has them said: many have no motive difficulty set, and the ones from before owners have no owner).
 */
const COMMON_FIELDS: readonly JigsawFilterField[] = JIGSAW_FILTER_FIELDS.filter((field) => !['kinds', 'sizes', 'difficulties', 'motives', 'owners'].includes(field));

/**
 * The choices of what jigsaws to look for, all shown, to tick: words in the name or the author, the categories (and, under each ticked one, its sub-categories, which can be left
 * blank), the sizes, the difficulties, the languages and who made them. One or more can be ticked in each list: any of them is looked for, and what is ticked in the different lists together. Use it
 * wherever jigsaws are looked for: the page binds the filter (`[(filter)]`) and gives the owners to choose from; Only the choices that have pictures are shown, the count of what matches, centered, at the bottom, and the calm message when nothing matches are in the component, and the title and the button that goes on are the page's; a page that leaves a choice out names the ones it wants in
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
  /** which choices are shown (the ones that apply to every entry, when not said: the category and the language) */
  readonly fields = input<readonly JigsawFilterField[]>(COMMON_FIELDS);
  /** how many jigsaws there are for each choice, with the rest of the filter kept (null until they are counted): shown beside each tick, and what the owners and the languages to tick from are */
  readonly facets = input<JigsawFacets | null>(null);
  /** a prefix that makes the ids of the fields different when there are two filters on a page */
  readonly idPrefix = input('filter');

  protected readonly kinds = JIGSAW_KINDS;
  /** public and private: always offered (they do not depend on what pictures there are) */
  protected readonly visibilities = FILTER_VISIBILITIES;
  protected readonly categories = JigsawCategories.all();
  protected readonly sizes = SIZE_CLASSES;
  protected readonly difficulties = DIFFICULTIES;
  protected readonly motives = MOTIVES;
  protected readonly owners = computed(() => this.facets()?.owners ?? []);
  /** the languages there are (the ones shown are `shownLanguages`: only those that have pictures; the page below it does not jump */
  protected readonly languages = computed(() => JIGSAW_LANGUAGES);
  protected readonly maxOwners = SEARCH_MAX_OWNERS;
  protected readonly noOwner = NO_OWNER;
  /** how many pictures match what is chosen (nothing when they are not counted, or none match: then the message for none is shown) */
  protected readonly matches = computed(() => this.facets()?.total || null);

  /** no picture matches what is chosen (counted: the facets are there and say none) */
  protected readonly noneMatch = computed(() => this.facets()?.total === 0);

  constructor() {
    // a choice that is not shown is not applied: what was ticked in it before (a choice kept from the time it was shown) is taken away, so nothing filters unseen
    effect(() => {
      const filter = this.filter();
      const unseen = TICKED_FIELDS.filter((field) => !this.fields().includes(field) && (filter[field]?.length ?? 0) > 0);
      if (unseen.length) untracked(() => this.filter.set({ ...filter, ...Object.fromEntries(unseen.map((field) => [field, []])) }));
    });
  }

  /**
   * Whether a choice is shown: **only what there are pictures of** (counted, with the rest of what is chosen kept), or what is ticked (so it can be taken away). All of them until they are counted. The same for every list: the types, the
   * categories and their sub-categories, the languages, the sizes, the difficulties, the motive difficulties and who made them.
   */
  private available(field: Exclude<TickedField, 'owners' | 'visibilities'>, value: string): boolean {
    const facets = this.facets();
    return !facets || (facets[field]?.[value] ?? 0) > 0 || JigsawFilters.isChosen(this.filter(), field, value);
  }

  protected readonly shownKinds = computed(() => this.kinds.filter((k) => this.available('kinds', k)));
  /** the categories to tick from: only the ones that have pictures */
  protected readonly shownCategories = computed(() => this.categories.filter((c) => this.available('categories', c.key)));
  protected readonly shownLanguages = computed(() => this.languages().filter((l) => this.available('languages', l.code)));
  protected readonly shownSizes = computed(() => this.sizes.filter((s) => this.available('sizes', s.key)));
  protected readonly shownDifficulties = computed(() => this.difficulties.filter((d) => this.available('difficulties', d.key)));
  protected readonly shownMotives = computed(() => this.motives.filter((m) => this.available('motives', m.key)));
  protected readonly shownOwners = computed(() => this.owners().filter((u) => u.count > 0 || JigsawFilters.isChosen(this.filter(), 'owners', u.id)));

  /** the sub-categories of a ticked category to tick from: only the ones that have pictures */
  protected shownSubs(category: JigsawCategory): JigsawCategory['subs'] {
    return category.subs.filter((s) => this.available('categories', s.key));
  }

  /** the ticked categories that have sub-categories to tick from, in the order they are shown */
  protected readonly withSubs = computed(() => this.categories.filter((c) => c.subs.length && JigsawFilters.isChosen(this.filter(), 'categories', c.key)));

  /** Ready jigsaws can be among what is found: no kind is ticked, or the ready jigsaw is. Only a ready jigsaw has a size and a difficulty of its own (a picture is cut, and its difficulty chosen, in each round). */
  private readonly jigsawsSelectable = computed(() => {
    const kinds = this.filter().kinds ?? [];
    return !kinds.length || kinds.includes('jigsaw');
  });

  /** Whether a choice is shown: it is one of the `fields` (public and private are always there when it is one of them), owners only when there are some to tick from, languages only when there are some, and the size and the difficulty only while ready jigsaws can be found. */
  protected shows(field: JigsawFilterField): boolean {
    return this.fields().includes(field) && (field !== 'owners' || this.owners().length > 0) && (field !== 'languages' || this.languages().length > 0) && ((field !== 'sizes' && field !== 'difficulties') || this.jigsawsSelectable());
  }

  /** how many jigsaws a choice gives, as it is shown beside it (nothing until they are counted) */
  protected count(field: Exclude<TickedField, 'owners' | 'visibilities'>, value: string): string {
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
    const next = JigsawFilters.toggled(this.filter(), field, value);
    // the size and the difficulty are for ready jigsaws: when only pictures are asked for they are not shown, so what was ticked in them is taken away (it would filter, unseen)
    const onlyPictures = field === 'kinds' && next.kinds.length > 0 && !next.kinds.includes('jigsaw');
    this.filter.set(onlyPictures ? { ...next, sizes: [], difficulties: [] } : next);
  }
}
