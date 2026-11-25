import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { JIGSAW_LANGUAGES, JigsawLanguages } from '../models/shared/language';
import { registerTranslator } from './i18n';

/** The languages of the app, each with its own name (as it is written in that language): the list of the model, which jigsaws and users use too. English is the source of every text. */
export const LANGUAGES = JIGSAW_LANGUAGES;

const STORAGE_KEY = 'jigsaw.language';

const isLanguage = (code: string) => JigsawLanguages.is(code);

/**
 * The language of the browser, when the app has it: the first of its languages (`navigator.languages`) that the app is written in (Norwegian is written `nb`, `nn` or `no`), else nothing. Used only
 * when nobody has chosen a language, and never kept: it is a guess, and the browser may change.
 */
export function browserLanguage(): string | null {
  try {
    for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
      const primary = (tag ?? '').toLowerCase().split('-')[0];
      const code = primary === 'no' || primary === 'nn' ? 'nb' : primary;
      if (isLanguage(code)) return code;
    }
  } catch {
    /* no language to read: English */
  }
  return null;
}

/** The language to start in: the one chosen on this device (kept in this browser's `localStorage`, like which user plays), else the language of the browser if the app has it, else English. */
export function startLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLanguage(saved)) return saved;
  } catch {
    /* storage not available: the browser's language, else English */
  }
  return browserLanguage() ?? 'en';
}

/**
 * The language of the texts of the app: the language of the user who plays (set when the user is chosen, kept with the user), else the choice made on this device (the menu), else the language of the browser if the app has it, else English. The page's `lang` follows it, so a screen reader and the browser's own parts (the colour picker, the file chooser) use it too.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  /** the language shown now (for `Intl` and date formats) */
  readonly lang = signal(startLanguage());

  constructor() {
    registerTranslator(this.transloco);
    this.apply(this.lang());
  }

  /** Shows the app in this language and remembers it on this device. */
  use(code: string): void {
    if (!isLanguage(code)) return;
    this.apply(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* not remembered: it is English again next time */
    }
  }

  private apply(chosen: string): void {
    this.lang.set(chosen);
    this.transloco.setActiveLang(chosen);
    document.documentElement.lang = chosen;
  }
}
