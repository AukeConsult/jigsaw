// The languages of Karins jigsaw: the languages the app is shown in, and the language of a jigsaw (what its name and description are written in) and of a user (the
// language the app is shown in for them). One list, so the app, the forms, the search and the API agree.

/** One language: its code (as the texts are kept: `i18n/<code>`) and its name as it is written in that language. */
export interface JigsawLanguage {
  readonly code: string;
  readonly name: string;
}

/** The language a user, or a jigsaw that says nothing, has: English (it is also the source of every text). */
export const DEFAULT_LANGUAGE = 'en';

/** The languages, in the order they are shown. */
export const JIGSAW_LANGUAGES: readonly JigsawLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'nb', name: 'Norsk' },
  { code: 'sv', name: 'Svenska' },
  { code: 'da', name: 'Dansk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'nl', name: 'Nederlands' },
];

/** What is a language, and what is allowed of it. */
export class JigsawLanguages {
  /** Whether this is the code of a language of the app. */
  static is(code: unknown): code is string {
    return typeof code === 'string' && JIGSAW_LANGUAGES.some((l) => l.code === code);
  }

  /** The reason this is not allowed as a language (none, `undefined`, is fine: it means English), or ''. */
  static error(code: unknown): string {
    return code === undefined || JigsawLanguages.is(code) ? '' : `The language must be one of ${JIGSAW_LANGUAGES.map((l) => l.code).join(', ')}.`;
  }

  /** The language of something that may say nothing: its own, or English. */
  static of(thing: { language?: string } | null | undefined): string {
    return JigsawLanguages.is(thing?.language) ? thing.language : DEFAULT_LANGUAGE;
  }

  /** The name of the language, as it is written in that language (the code itself when there is no such language). */
  static nameOf(code: string): string {
    return JIGSAW_LANGUAGES.find((l) => l.code === code)?.name ?? code;
  }
}
