import { Component, computed, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CATEGORIES_MAX_PER_JIGSAW, JigsawCategories, JigsawCategory } from '../../models/shared/category';

/**
 * Sets the categories of a jigsaw: first the categories are pressed, then the sub-categories of each chosen one are shown to choose from (they can be left blank). The rules,
 * how many and what takes the place of what, are those of `JigsawCategories`.
 */
@Component({
  selector: 'app-category-picker',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawCategories')],
  templateUrl: './category-picker.html',
})
export class CategoryPicker {
  /** the keys of the chosen categories and sub-categories */
  readonly selected = model<string[]>([]);

  protected readonly categories = JigsawCategories.all();
  protected readonly max = CATEGORIES_MAX_PER_JIGSAW;
  /** the chosen categories that have sub-categories to choose from, in the order they are shown */
  protected readonly withSubs = computed(() => this.categories.filter((c) => c.subs.length && this.chosen(c.key)));

  protected chosen(key: string): boolean {
    return JigsawCategories.isChosen(this.selected(), key);
  }

  protected canChoose(c: JigsawCategory): boolean {
    return JigsawCategories.canChoose(this.selected(), c.key);
  }

  /** Chooses the category or sub-category, or takes it away when it is chosen. */
  protected toggle(key: string): void {
    this.selected.set(JigsawCategories.toggled(this.selected(), key));
  }
}
