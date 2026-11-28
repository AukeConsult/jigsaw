import { JIGSAW_LANGUAGES, JigsawLanguages } from './language';

// **The words of a picture in the languages.** Its name and description are written in its **base language** (`language`, set when the picture is made, and the same ever after; one that says nothing is
// English), and every change of them is written in that language. The words in the other languages are translations the service makes of them and keeps with the picture (`translations`): the page never
// sends any, and they are thrown away when the words change.

/** The name and the description of a picture in one language. */
export interface PictureWords {
  name: string;
  description?: string;
}

/** by language code: the words in every language but the base one that has been translated into */
export type Translations = Record<string, PictureWords>;

/** What has words: a picture, or a part of one (the summary of a list, the name of the jigsaw of a round). */
export interface Worded {
  name: string;
  description?: string;
  language?: string;
  translations?: Translations;
}

export class JigsawTexts {
  /** Translations as they are kept: only the languages of the app, each with a name; none when there is none. */
  static stored(raw: unknown): Translations | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const out: Translations = {};
    for (const { code } of JIGSAW_LANGUAGES) {
      const entry = (raw as Record<string, { name?: unknown; description?: unknown } | undefined>)[code];
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (!name) continue;
      const description = typeof entry?.description === 'string' ? entry.description.trim() : '';
      out[code] = { name, ...(description ? { description } : {}) };
    }
    return Object.keys(out).length ? out : undefined;
  }

  /** The languages there is no translation into yet: every language but the base one (none for a picture with no name). */
  static lacking(words: Worded): string[] {
    if (!words.name?.trim()) return [];
    const base = JigsawLanguages.of(words);
    return JIGSAW_LANGUAGES.map((l) => l.code).filter((code) => code !== base && !words.translations?.[code]);
  }

  /** The words a reader of this language is shown: the translation, else the words as they were written. */
  static pick(words: Worded, language: string): PictureWords {
    const own = { name: words.name, ...(words.description ? { description: words.description } : {}) };
    const there = language === JigsawLanguages.of(words) ? undefined : words.translations?.[language];
    return there ? { ...own, ...there } : own;
  }

  /** Whether two have the same words as written, so that the translations of the one hold for the other. */
  static same(a: Worded, b: Worded): boolean {
    return (a.name ?? '').trim() === (b.name ?? '').trim() && (a.description ?? '').trim() === (b.description ?? '').trim();
  }

  /**
   * What a change of a picture is saved as: **the base language the picture got when it was made**, and its translations while its words are the same. What the page sends of either is not used.
   */
  static keptOver<T extends Worded>(before: Worded, input: T): T {
    const { translations: _sent, language: _asked, ...rest } = input;
    return { ...rest, ...(before.language ? { language: before.language } : {}), ...(before.translations && JigsawTexts.same(before, input) ? { translations: before.translations } : {}) } as T;
  }

  /** What a new picture is saved as: with no translations (the service makes them). */
  static asNew<T extends Worded>(input: T): T {
    const { translations: _sent, ...rest } = input;
    return rest as T;
  }

  /** Every word of a picture in every language it has them in, for a search. */
  static all(words: Pick<Worded, 'name' | 'description' | 'translations'>): string {
    return [words, ...Object.values(words.translations ?? {})].map((w) => `${w.name} ${w.description ?? ''}`).join(' ');
  }

  /** The same with the names only: for a list that does not show the descriptions. */
  static namesOnly(translations: Translations | undefined): Translations | undefined {
    return translations && Object.fromEntries(Object.entries(translations).map(([code, { name }]) => [code, { name }]));
  }
}
