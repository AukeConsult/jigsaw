import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { registerTranslator } from './i18n';

/** The languages of the app, each with its own name (as it is written in that language). English is the source of every text. */
export const LANGUAGES: readonly { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'nb', name: 'Norsk' },
  { code: 'sv', name: 'Svenska' },
  { code: 'da', name: 'Dansk' },
];

const STORAGE_KEY = 'jigsaw.language';

const isLanguage = (code: string) => LANGUAGES.some((l) => l.code === code);

/** The language to start in: the one chosen on this device (kept in this browser's `localStorage`, like which user plays), else English. The language of the browser is not used. */
export function startLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLanguage(saved)) return saved;
  } catch {
    /* storage not available: English */
  }
  return 'en';
}

/**
 * The language of the texts of the app. For now it is the choice made on this device (the menu), else English; it follows the user when users
 * have a sign-in. The page's `lang` follows it, so a screen reader and the browser's own parts (the colour picker, the file chooser) use it too.
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

  private apply(code: string): void {
    this.lang.set(code);
    this.transloco.setActiveLang(code);
    document.documentElement.lang = code;
  }
}
