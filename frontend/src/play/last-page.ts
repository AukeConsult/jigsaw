import { readPreference, writePreference } from '../app/core/preferences';
import { readSession, writeSession } from '../app/core/session-storage';

/**
 * **A section of the app is opened where the person was last in it** (rule 12 of `CLAUDE.md`). A section is entered by one entry of a menu (Help, My stuff, Publish) and has pages of its own in the menu there: which of them was open last is
 * kept on the device, and the address of the section (`/play/info`, `/play/mine`, `/play/mine/publish`) goes there. Adding a picture is something one does, not a place one was, so it is not remembered.
 */
const SECTIONS = {
  info: { under: '/play/info', pages: ['help', 'welcome', 'about', 'install'] },
  mine: { under: '/play/mine', pages: ['pictures', 'rounds'] },
  publish: { under: '/play/mine', pages: ['many', 'info', 'offers', 'packages'] },
} as const;

export type Section = keyof typeof SECTIONS;

const keyOf = (section: Section): string => `play.last.${section}`;

/** The address the section opens: the page that was open in it last, or its first page. */
export function lastPage(section: Section): string {
  const { under, pages } = SECTIONS[section];
  const page = readPreference<string>(keyOf(section), pages[0], (value): value is string => (pages as readonly unknown[]).includes(value));
  return `${under}/${page}`;
}

/** The page of the app the person was on before the info pages. Kept for the session (the tab), not on the device: it is about this visit, and must outlive a reload (the app loads itself again when there is a new version). */
const BEFORE_INFO_KEY = 'play.beforeInfo';
const isAppPage = (value: unknown): value is string => typeof value === 'string' && value.startsWith('/play/');

/** Where Back on the info pages leads, however many of them were opened: the home page when the visit began in them. */
export const pageBeforeInfo = (): string => readSession(BEFORE_INFO_KEY, '/play/list', isAppPage);

/** The page that is open is kept for its section (a page under it, such as one offer, keeps the page it is under). */
export function rememberPage(url: string): void {
  const path = url.split(/[?#]/)[0];
  if (isAppPage(path) && !/^\/play\/info(\/|$)/.test(path)) writeSession(BEFORE_INFO_KEY, url);
  for (const section of Object.keys(SECTIONS) as Section[]) {
    const { under, pages } = SECTIONS[section];
    const page = pages.find((p) => path === `${under}/${p}` || path.startsWith(`${under}/${p}/`));
    if (page) writePreference(keyOf(section), page);
  }
}
