import { FeedAdminKind } from '../../../app/jigsaw/feed-admin.service';

/** Where the pages of each kind are, and the icon it has. */
export const FEED_PATHS: Record<FeedAdminKind, string> = { info: '/play/mine/info', offer: '/play/mine/offers', package: '/play/mine/packages' };
export const FEED_ICONS: Record<FeedAdminKind, string> = { info: 'bi-card-text', offer: 'bi-tag', package: 'bi-box-seam' };

/** The currencies the form offers (the model takes any three capital letters). */
export const CURRENCIES = ['EUR', 'NOK', 'SEK', 'DKK', 'USD', 'GBP'] as const;

/** What a price in cents is, written for the language and the currency (`4900` and `NOK` in Norwegian: kr 49,00). */
export function priceText(cents: number, currency: string, language: string): string {
  try {
    return new Intl.NumberFormat(language, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
