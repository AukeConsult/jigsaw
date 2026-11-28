import { Injectable, inject, signal } from '@angular/core';
import { LanguageService } from '../core/language.service';
import { JigsawTexts, PictureWords, Translations, Worded } from '../models/shared/jigsaw-texts';
import { JigsawService } from './jigsaw.service';

/** how many pictures are translated at once: the rest wait */
const AT_ONCE = 3;

/**
 * **The name and the description of a picture, in the reader's language.** Every place that shows them to a reader asks here (the form that changes a picture shows them as written). A picture that lacks the
 * language is asked to be translated by the service, and the words change on the page when that is done; until then, and when it cannot be done, they are shown as written. The page never talks to the AI.
 */
@Injectable({ providedIn: 'root' })
export class JigsawWords {
  private readonly language = inject(LanguageService).lang;
  private readonly jigsaws = inject(JigsawService);
  /** the translations that came since the pictures were read, by the picture and its words as written */
  private readonly made = signal<ReadonlyMap<string, Translations>>(new Map());
  private readonly asked = new Set<string>();
  private readonly waiting: (() => Promise<void>)[] = [];
  private running = 0;

  /** The words of this picture for the reader. */
  of(jigsaw: Worded & { id: string }): PictureWords {
    const language = this.language();
    const key = JSON.stringify([jigsaw.id, jigsaw.name, jigsaw.description ?? '']);
    const words = { ...jigsaw, translations: { ...this.made().get(key), ...jigsaw.translations } };
    if (JigsawTexts.lacking(words).includes(language)) this.ask(jigsaw.id, key);
    return JigsawTexts.pick(words, language);
  }

  /** A picture was saved: its words are translated now (nothing is asked of the AI when they are as before). A failure is silent: the picture is saved, and it is asked again when it is shown. */
  async saved(id: string): Promise<void> {
    await this.jigsaws.translate(id).catch(() => undefined);
  }

  /** Asked once for each picture and words; later, not while the page is being drawn. */
  private ask(id: string, key: string): void {
    if (this.asked.has(key)) return;
    this.asked.add(key);
    this.waiting.push(async () => {
      const translations = await this.jigsaws.translate(id);
      this.made.update((now) => new Map(now).set(key, translations));
    });
    setTimeout(() => this.next());
  }

  private next(): void {
    if (this.running >= AT_ONCE) return;
    const job = this.waiting.shift();
    if (!job) return;
    this.running++;
    void job()
      .catch(() => undefined)
      .finally(() => {
        this.running--;
        this.next();
      });
  }
}
