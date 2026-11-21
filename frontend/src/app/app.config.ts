import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TRANSLOCO_MISSING_HANDLER, provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/transloco-loader';
import { EmptyMissingHandler } from './core/transloco-missing.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()), // the texts of the app are files (public/i18n)
    provideTransloco({
      config: { availableLangs: ['en', 'nb', 'sv', 'da'], defaultLang: 'en', fallbackLang: 'en', reRenderOnLangChange: true, prodMode: !isDevMode() },
      loader: TranslocoHttpLoader,
    }),
    { provide: TRANSLOCO_MISSING_HANDLER, useClass: EmptyMissingHandler }, // a missing text is '' so the English text next to the key is shown
  ],
};
