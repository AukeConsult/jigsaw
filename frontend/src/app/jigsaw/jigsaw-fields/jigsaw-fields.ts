import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { LANGUAGES } from '../../core/language.service';
import { JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME } from '../../models/shared/jigsaw-settings';
import { JigsawUserSpec } from '../../models/shared/jigsaw-user';
import { CategoryPicker } from '../category-picker/category-picker';
import { JigsawService } from '../jigsaw.service';
import { LINE_LEVELS, lineLevelOf } from '../line-level';

/**
 * The fields every form of a jigsaw has, in one place (the form of a new jigsaw and of an edit, and the panel of a jigsaw that has been played): the name and the AI that sets it, the
 * description, the language and the categories; the look (the line and the colours); and the owner and who sees it. The form that holds it owns the values (they are `model`s, bound
 * two ways) and decides what is saved and when; this only shows them and changes them. What only some forms have goes in through the slots: the picture and the size (between the
 * basics and the look: the default slot) and the difficulty and the clock (at the top of the look: `play-settings`).
 */
@Component({
  selector: 'app-jigsaw-fields',
  imports: [FormsModule, TranslocoDirective, CategoryPicker],
  providers: [provideTranslocoScope('jigsawNew'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-fields.html',
})
export class JigsawFields {
  private readonly jigsaws = inject(JigsawService);

  readonly name = model.required<string>();
  readonly description = model.required<string>();
  readonly language = model.required<string>();
  readonly categories = model.required<string[]>();
  readonly lineWidth = model.required<number>();
  readonly lineColor = model.required<string>();
  readonly backColor = model.required<string>();
  readonly ownerUid = model.required<string>();
  readonly visibility = model.required<'everyone' | 'owner' | 'hidden'>();

  /** the users the author is chosen from */
  readonly owners = input<readonly JigsawUserSpec[]>([]);
  /** the id of the saved jigsaw whose saved picture the AI can look at (null: there is none yet, or the picture was changed, so there is no button) */
  readonly classifyId = input<string | null>(null);
  /** the form has things to play with (the difficulty, the clock) in the slot at the top of the look: the section is then called "Play and look" */
  readonly hasPlaySettings = input(false);
  /** the author must be chosen (a new jigsaw needs its owner) */
  readonly authorRequired = input(false);
  /** the forms are waiting for the jigsaw to be read */
  readonly busy = input(false);

  protected readonly languages = LANGUAGES;
  protected readonly lineLevels = LINE_LEVELS;
  protected readonly lineLevel = computed(() => lineLevelOf(this.lineWidth()));
  protected readonly maxName = JIGSAW_MAX_NAME;
  protected readonly maxDescription = JIGSAW_MAX_DESCRIPTION;
  /** the name is missing: not said while the jigsaw is still being read (the form is empty then, and that is not a mistake) */
  protected readonly nameMissing = computed(() => !this.busy() && !this.name().trim());

  /** The language is changed: the texts are written again in it by the AI (when there is a saved picture to look at), so the name and the description are in the language they are said to be in. */
  protected changeLanguage(code: string): void {
    this.language.set(code);
    if (this.classifyId()) void this.classify(code);
  }

  /** the AI is looking at the picture */
  protected readonly classifying = signal(false);
  /** why the AI could not do it (empty: nothing is wrong) */
  protected readonly classifyError = signal('');

  /**
   * The AI looks at the saved picture and sets the categories, the name and the description (in the language of the jigsaw): the server puts them on the jigsaw, and they are put in
   * the form too, so what the form saves next is the same. Only the owner can.
   */
  protected async classify(language?: string): Promise<void> {
    const id = this.classifyId();
    if (!id || this.classifying()) return;
    this.classifying.set(true);
    this.classifyError.set('');
    try {
      const found = await this.jigsaws.classify(id, true, language);
      if (found.name) this.name.set(found.name);
      if (found.description) this.description.set(found.description);
      if (found.categories.length) this.categories.set(found.categories);
    } catch (err) {
      const why = err instanceof HttpErrorResponse ? ((err.error as { error?: string } | null)?.error ?? '') : '';
      this.classifyError.set(why || tr('jigsawNew.classifyFailed', 'The AI could not do it: try again.'));
    } finally {
      this.classifying.set(false);
    }
  }
}
