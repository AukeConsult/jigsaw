import { Component, computed, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawCategories } from '../../models/shared/category';

/** The categories of a jigsaw as small badges, each with its icon (nothing when it is in none). */
@Component({
  selector: 'app-category-tags',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawCategories')],
  templateUrl: './category-tags.html',
})
export class CategoryTags {
  /** the keys of the categories */
  readonly keys = input<readonly string[] | undefined>(undefined);

  protected readonly categories = computed(() => JigsawCategories.stored(this.keys()).map((key) => JigsawCategories.of(key)!));
}
