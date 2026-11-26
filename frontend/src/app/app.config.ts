import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { shareKeyInterceptor } from './jigsaw/share-keys';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TRANSLOCO_MISSING_HANDLER, provideTransloco } from '@jsverse/transloco';
import { routes } from './app.routes';
import { userHeaderInterceptor } from './core/user-header.interceptor';
import { authTokenInterceptor } from './logons/auth-token.interceptor';
import { TranslocoHttpLoader } from './core/transloco-loader';
import { EmptyMissingHandler } from './core/transloco-missing.handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([userHeaderInterceptor, authTokenInterceptor, shareKeyInterceptor])), // who plays, the token of the account that is signed in, and the key of a link to a picture; the texts of the app are files (public/i18n)
    provideTransloco({
      config: { availableLangs: ['en', 'nb', 'sv', 'da', 'fi', 'de', 'fr', 'es', 'nl'], defaultLang: 'en', fallbackLang: 'en', reRenderOnLangChange: true, prodMode: !isDevMode() },
      loader: TranslocoHttpLoader,
    }),
    { provide: TRANSLOCO_MISSING_HANDLER, useClass: EmptyMissingHandler }, // a missing text is '' so the English text next to the key is shown
  ],
};
