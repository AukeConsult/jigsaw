import { JigsawCategories } from './category';
import type { JigsawFilter } from './jigsaw-filter';
import { JigsawKinds } from './jigsaw-kind';
import { JIGSAW_VISIBILITIES, JigsawVisibility } from './jigsaw-settings';
import { DEFAULT_LANGUAGE, JIGSAW_LANGUAGES, JigsawLanguages } from './language';
import { JigsawIndex, JigsawSummary } from './jigsaw-search';

// A tile of the home page. The home page is a list of tiles, and a tile is a picture, a piece of information, an offer or a package. `FeedItem` is the parent: what every tile has is here, and each kind
// overrides small hooks (what is wrong with it, where a press leads, where it goes among the pictures) instead of a branch on the kind anywhere. A picture is made from what a search found
// (`PictureItem.from`) and is not kept as a tile. The others are `KeptItem`s: each kind has its own collection (`jigsaw-info`, `jigsaw-offers`, ...) and its own pages, and what is shown on the home page
// is decided when they are read (`FeedItems.shown`). Like every model object, a tile never changes.
//
// **The words of a kept tile are in every language.** A tile has a master language (the language its author writes in) and an entry for each language in `texts`: the author's own for the master
// language, and the AI's for the others, made when the tile is saved (`FeedItems.toTranslate`, `FeedItems.withTranslations`). What is shown is the entry of the language that is chosen, else the master's.

/** The collections of the kinds that are kept (a picture is a jigsaw, in `jigsaw`). */
export const JIGSAW_INFO = 'jigsaw-info';
export const JIGSAW_OFFERS = 'jigsaw-offers';
export const JIGSAW_PACKAGES = 'jigsaw-packages';

export const FEED_KINDS = ['picture', 'offer', 'info', 'package'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];
/** The kinds that are kept as documents. */
export const STORED_FEED_KINDS = ['info', 'offer', 'package'] as const;
export type StoredFeedKind = (typeof STORED_FEED_KINDS)[number];

export const FEED_TITLE_MAX = 80;
export const FEED_TEXT_MAX = 600;
export const FEED_LABEL_MAX = 24;
/** The most a package can cost, in the smallest unit of its currency (cents). */
export const FEED_PRICE_MAX = 100_000_000;
/** The currency of a price when nothing else is said. */
export const DEFAULT_CURRENCY = 'EUR';

/** What a press on a tile does. The page turns it into where to go (the model knows nothing of the pages). */
export type FeedAction =
  | { type: 'jigsaw'; jigsawId: string; asPicture: boolean }
  | { type: 'package'; packageId: string }
  | { type: 'route'; to: string }
  | { type: 'link'; url: string }
  | { type: 'none' };

/** The words of a tile in one language. `by`: written by the author, or made by the AI from the master language. */
export interface FeedText {
  language: string;
  title: string;
  text?: string;
  /** a short mark on an offer ("-20 %") */
  label?: string;
  by: 'author' | 'ai';
}

/** The words that are translated. */
export interface FeedWords {
  title: string;
  text?: string;
  label?: string;
}

/** A kept tile, as it is stored and sent (only these fields are known). */
export interface FeedItemData {
  id: string;
  kind: StoredFeedKind;
  /** the language the author writes in: its entry in `texts` is the author's */
  masterLanguage: string;
  texts: FeedText[];
  /** what the master words were when the AI entries were made: when they are not that any more, the AI entries are out of date */
  sourceHash?: string;
  /** where an information or an offer leads: a page of the site (a route) or, for an offer, another site (https) */
  route?: string;
  link?: string;
  /** a package: what it costs, in the smallest unit of its currency (cents); none, or 0, is free */
  price?: number;
  /** a package: the currency of the price, as three capital letters (EUR when it says nothing) */
  currency?: string;
  /** a package: the categories it is in, the same as a picture's (`JigsawCategories`), by which the person's search finds it */
  categories?: string[];
  /** **sent, never kept**: a package says how many pictures it holds and the ids of a few of them (chosen at random each time it is asked), so a tile can show one */
  pictureCount?: number;
  coverIds?: string[];
  /** a package the account that reads has got (said by `GET /jigsaw-feed`, never saved): the home page does not list it */
  had?: boolean;
  /** after how many pictures it comes (nothing: its kind says) */
  slot?: number;
  /** the higher one comes first when two have the same place */
  priority?: number;
  /** milliseconds since 1970: it is shown from and to this time (the day it is shown from, and the day it expires) */
  from?: number;
  to?: number;
  /** who sees it on the home page: public (what none says), `owner` (private: only the one who made it, with a banner that says so, to check how it looks) or `hidden` (nobody: it is only in the list of its owner) */
  visibility?: 'owner' | 'hidden';
  /** the UID of the account that made it: who may change or delete it (and an admin) */
  ownerUid?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** What is saved of a tile when it is added or replaced (the store gives the id and the time it was made). */
export type FeedItemInput = Omit<FeedItemData, 'id' | 'createdAt'>;

export type FeedStatus = 'upcoming' | 'active' | 'expired';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const whole = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** The words of a tile in the languages: what is shown, what is made by the AI and when it is out of date. */
export class FeedTexts {
  /** A short fingerprint of the master words (FNV-1a), to tell that the AI entries were made from them. */
  static hashOf(words: FeedWords): string {
    let h = 0x811c9dc5;
    for (const ch of JSON.stringify([words.title, words.text ?? '', words.label ?? ''])) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  /** The entries as they are kept: only the known ones, one for each language, the words trimmed and cut. */
  static read(raw: unknown): FeedText[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: FeedText[] = [];
    for (const r of raw as Record<string, unknown>[]) {
      const language = r?.['language'];
      if (!JigsawLanguages.is(language) || seen.has(language)) continue;
      seen.add(language);
      out.push(clean({ language, title: text(r['title'], FEED_TITLE_MAX) ?? '', text: text(r['text'], FEED_TEXT_MAX), label: text(r['label'], FEED_LABEL_MAX), by: r['by'] === 'ai' ? ('ai' as const) : ('author' as const) }));
    }
    return out;
  }

  static entryOf(texts: readonly FeedText[], language: string): FeedText | undefined {
    return texts.find((t) => t.language === language);
  }

  /** One field of the words, in the language, else in the master's (per field: a half translated tile shows what it can). */
  static pick(texts: readonly FeedText[], language: string, master: string, field: 'title' | 'text' | 'label'): string | undefined {
    return FeedTexts.entryOf(texts, language)?.[field] || FeedTexts.entryOf(texts, master)?.[field] || undefined;
  }
}

/** The parent of the tiles. */
export abstract class FeedItem {
  abstract readonly kind: FeedKind;
  readonly id: string;
  readonly slot?: number;
  readonly priority: number;
  readonly from?: number;
  readonly to?: number;

  constructor(common: { id: string; slot?: number; priority?: number; from?: number; to?: number }) {
    this.id = common.id;
    this.slot = common.slot;
    this.priority = common.priority ?? 0;
    this.from = common.from;
    this.to = common.to;
  }

  /** The words in this language (the master's where there are none). */
  abstract titleFor(language: string): string;
  abstract textFor(language: string): string | undefined;
  abstract labelFor(language: string): string | undefined;
  /** What a press on the tile does. */
  abstract action(): FeedAction;

  /** Whether the home page lists the tile: a package the person has got is not offered again (its pictures are in their list). */
  get onHome(): boolean {
    return true;
  }

  /**
   * Whether the tile is shown with what the person looks for (the filter of the home page). What is not content (an information, an offer) is always shown, and the pictures are filtered by the search
   * before they are tiles; a package overrides this.
   */
  matchesFilter(_filter: Pick<JigsawFilter, 'categories' | 'text'>): boolean {
    return true;
  }

  /** After how many pictures a tile of this kind comes when it has no place of its own; `order` is its number among the tiles of its kind (0 is the first). */
  defaultSlot(order: number): number {
    return 8 + order * 16;
  }

  /** What is wrong with the kind's own part, or ''. */
  protected extraError(): string {
    return '';
  }

  /** The reason this tile is not allowed, or ''. One rule for the form, the page and the API. */
  error(): string {
    if (!ID.test(this.id)) return 'Not a tile id.';
    if (this.slot !== undefined && (!Number.isInteger(this.slot) || this.slot < 0)) return 'A place is a whole number of pictures, 0 or more.';
    if (this.from !== undefined && this.to !== undefined && this.to < this.from) return 'It expires before it is shown from.';
    return this.extraError();
  }

  /** Whether it is time to show it: not before the day it is shown from, and not after the day it expires. */
  isShown(now: number): boolean {
    return this.status(now) === 'active';
  }

  /** Upcoming (not yet), active, or expired. */
  status(now: number): FeedStatus {
    if (this.from !== undefined && now < this.from) return 'upcoming';
    if (this.to !== undefined && now > this.to) return 'expired';
    return 'active';
  }
}

/** A jigsaw or a picture found by a search, as a tile. It is not kept as a tile. */
export class PictureItem extends FeedItem {
  readonly kind = 'picture';

  constructor(readonly summary: JigsawSummary) {
    super({ id: summary.id });
  }

  static from(summary: JigsawSummary): PictureItem {
    return new PictureItem(summary);
  }

  titleFor(): string {
    return this.summary.name;
  }

  textFor(): string | undefined {
    return undefined;
  }

  labelFor(): string | undefined {
    return undefined;
  }

  action(): FeedAction {
    return { type: 'jigsaw', jigsawId: this.summary.id, asPicture: JigsawKinds.isPicture(this.summary) };
  }
}

/** A tile that is kept (a document of its kind's own collection): it has its words in the languages, an owner and the dates it is shown. */
export abstract class KeptItem extends FeedItem {
  abstract override readonly kind: StoredFeedKind;

  constructor(readonly data: FeedItemData) {
    super(data);
  }

  get masterLanguage(): string {
    return this.data.masterLanguage;
  }

  get ownerUid(): string | undefined {
    return this.data.ownerUid;
  }

  /** Private: only its owner sees it, to check how it looks (it has a banner that says so, so it is not forgotten). */
  get isPrivate(): boolean {
    return this.data.visibility === 'owner';
  }

  /** Whether this account (nobody: no account) may see the tile on the home page: a public one everybody, a private one only its owner, a hidden one nobody. */
  isVisibleTo(me: string | undefined): boolean {
    if (this.data.visibility === 'hidden') return false;
    return this.data.visibility !== 'owner' || (!!me && me === this.data.ownerUid);
  }

  /** The words the author wrote. */
  get master(): FeedText | undefined {
    return FeedTexts.entryOf(this.data.texts, this.data.masterLanguage);
  }

  /** The title of the master language: for lists and messages. */
  get title(): string {
    return this.master?.title ?? '';
  }

  titleFor(language: string): string {
    return FeedTexts.pick(this.data.texts, language, this.data.masterLanguage, 'title') ?? '';
  }

  textFor(language: string): string | undefined {
    return FeedTexts.pick(this.data.texts, language, this.data.masterLanguage, 'text');
  }

  labelFor(language: string): string | undefined {
    return FeedTexts.pick(this.data.texts, language, this.data.masterLanguage, 'label');
  }

  protected override extraError(): string {
    const d = this.data;
    if (!JigsawLanguages.is(d.masterLanguage)) return `The language you write in must be one of ${JIGSAW_LANGUAGES.map((l) => l.code).join(', ')}.`;
    if (!this.master || !this.master.title.trim()) return `A title of 1 to ${FEED_TITLE_MAX} letters.`;
    if (d.texts.length !== new Set(d.texts.map((t) => t.language)).size) return 'One entry for each language.';
    return this.kindError();
  }

  /** What is wrong with the part that belongs to the kind, or ''. */
  protected kindError(): string {
    return '';
  }
}

/** Words to read: a welcome, a tip, news. It may lead to a page of the site. */
export class InfoItem extends KeptItem {
  readonly kind = 'info';

  action(): FeedAction {
    return this.data.route ? { type: 'route', to: this.data.route } : { type: 'none' };
  }

  protected override kindError(): string {
    if (!this.master?.text) return `The words of an information: 1 to ${FEED_TEXT_MAX} letters.`;
    return FeedItems.routeError(this.data.route);
  }

  /** An information comes first: the first at the top, then one after every sixth picture. */
  override defaultSlot(order: number): number {
    return order * 6;
  }
}

/** Something to be offered, with a short mark ("-20 %") and a place to go. */
export class OfferItem extends KeptItem {
  readonly kind = 'offer';

  action(): FeedAction {
    if (this.data.link) return { type: 'link', url: this.data.link };
    return this.data.route ? { type: 'route', to: this.data.route } : { type: 'none' };
  }

  protected override kindError(): string {
    if (!this.master?.label) return `The mark of an offer: 1 to ${FEED_LABEL_MAX} letters.`;
    if (!this.data.route && !this.data.link) return 'An offer leads somewhere: a page of the site or a link.';
    if (this.data.link && !/^https:\/\/[^\s]+$/.test(this.data.link)) return 'A link starts with https://.';
    return FeedItems.routeError(this.data.route);
  }

  /** An offer comes after the seventh picture, and then after every twelfth. */
  override defaultSlot(order: number): number {
    return 7 + order * 12;
  }
}

/** A collection of pictures that can be played together, free or with a price. The pictures are ordinary pictures (the collection `jigsaw`) that are linked to the package by `packageId`; the package does not list them. */
export class PackageItem extends KeptItem {
  readonly kind = 'package';

  /** What it costs in the smallest unit of its currency (0: free). */
  get price(): number {
    return this.data.price ?? 0;
  }

  get isFree(): boolean {
    return this.price === 0;
  }

  get categories(): readonly string[] {
    return this.data.categories ?? [];
  }

  override get onHome(): boolean {
    return !this.data.had;
  }

  /** A package is looked for as a picture is: in one of the chosen categories (a category chosen finds its sub-categories too), with every word of the search text in its words, in any language. */
  override matchesFilter(filter: Pick<JigsawFilter, 'categories' | 'text'>): boolean {
    const tags = JigsawIndex.tagsOf(this.data.categories);
    return (!filter.categories.length || filter.categories.some((key) => tags.includes(key))) && FeedItems.matches(this.data, filter.text);
  }

  get currency(): string {
    return this.data.currency ?? DEFAULT_CURRENCY;
  }

  action(): FeedAction {
    return { type: 'package', packageId: this.id };
  }

  protected override kindError(): string {
    const d = this.data;
    if (d.price !== undefined && (!Number.isInteger(d.price) || d.price < 0 || d.price > FEED_PRICE_MAX)) return 'A price is a whole number of cents, 0 or more.';
    if (d.currency !== undefined && !/^[A-Z]{3}$/.test(d.currency)) return 'A currency is three capital letters, for example EUR.';
    if (d.categories !== undefined && JigsawCategories.error(d.categories)) return JigsawCategories.error(d.categories);
    return '';
  }

  /** A package comes after the third picture, and then after every twelfth. */
  override defaultSlot(order: number): number {
    return 3 + order * 12;
  }
}

/** The tiles that are kept: made from what is stored or what an author sent, checked, searched and shown. */
export class FeedItems {
  /** The reason a route is not allowed (a page of the site: it starts with one `/`), or ''. */
  static routeError(route: string | undefined): string {
    return route === undefined || /^\/(?!\/)[^\s]*$/.test(route) ? '' : 'A route is a page of the site: it starts with one /.';
  }

  /**
   * A tile as it is kept: only the known fields. A document from before the words were in every language (a title, words and a mark at the top) is read as the English words of its author. A
   * document that is no tile of a kept kind gives null.
   */
  static stored(raw: Record<string, unknown>): FeedItemData | null {
    const kind = raw['kind'];
    if (!STORED_FEED_KINDS.some((k) => k === kind)) return null;
    const masterLanguage = JigsawLanguages.is(raw['masterLanguage']) ? raw['masterLanguage'] : DEFAULT_LANGUAGE;
    let texts = FeedTexts.read(raw['texts']);
    if (!texts.length && text(raw['title'], FEED_TITLE_MAX)) {
      texts = FeedTexts.read([{ language: masterLanguage, title: raw['title'], text: raw['text'], label: raw['label'], by: 'author' }]); // from before the languages
    }
    const price = kind === 'package' ? whole(raw['price']) : undefined;
    return clean({
      id: typeof raw['id'] === 'string' ? raw['id'] : '',
      kind: kind as StoredFeedKind,
      masterLanguage,
      texts,
      sourceHash: text(raw['sourceHash'], 16),
      route: text(raw['route'], 200),
      link: text(raw['link'], 300),
      price: price !== undefined && price !== 0 ? price : undefined, // free is what none says (a price below 0 is kept, so `error()` can say it is wrong)
      currency: price !== undefined && price > 0 ? (text(raw['currency'], 3)?.toUpperCase() ?? DEFAULT_CURRENCY) : undefined,
      slot: whole(raw['slot']),
      priority: whole(raw['priority']),
      from: whole(raw['from']),
      to: whole(raw['to']),
      categories: kind === 'package' && JigsawCategories.stored(raw['categories']).length ? JigsawCategories.stored(raw['categories']) : undefined, // only the known ones
      visibility: raw['visibility'] === 'owner' ? ('owner' as const) : raw['visibility'] === 'hidden' ? ('hidden' as const) : undefined, // public is what none says
      ownerUid: text(raw['ownerUid'], 128),
      createdAt: whole(raw['createdAt']),
      updatedAt: whole(raw['updatedAt']),
    });
  }

  /** The object of a kept tile. The kind decides which class it is; this is the one place that knows the kinds. */
  static of(data: FeedItemData): KeptItem {
    switch (data.kind) {
      case 'info':
        return new InfoItem(data);
      case 'offer':
        return new OfferItem(data);
      case 'package':
        return new PackageItem(data);
    }
  }

  /** The reason this is not a tile that may be kept, or ''. */
  static error(raw: Record<string, unknown>): string {
    const data = FeedItems.stored(raw);
    return data ? FeedItems.of(data).error() : 'Not a kind of tile: info, offer or package.';
  }

  /** The tiles to show at this time to this account (nobody: a visitor), as the objects: the ones that are right, whose time it is and that the account may see (a private one only to its owner, a hidden one to nobody). */
  static shown(documents: readonly Record<string, unknown>[], now: number, viewer?: string): KeptItem[] {
    return documents
      .map((d) => FeedItems.stored(d))
      .filter((d): d is FeedItemData => d !== null)
      .map((d) => FeedItems.of(d))
      .filter((item) => item.error() === '' && item.isShown(now) && item.isVisibleTo(viewer));
  }

  /**
   * What an author sent (the words in the master language, where it leads, the dates) put into the tile: a new tile, or the one that is changed. The master entry is the author's; **every other entry
   * is kept** (the AI's, which `toTranslate` says are out of date when the master words changed, and an author's own correction, which is never overwritten). The owner stays the one who made it.
   */
  static edited(before: FeedItemData | null, kind: StoredFeedKind, body: Record<string, unknown>, me: string | undefined, now: number): FeedItemData {
    const masterLanguage = JigsawLanguages.is(body['masterLanguage']) ? body['masterLanguage'] : (before?.masterLanguage ?? DEFAULT_LANGUAGE);
    const master: FeedText = clean({ language: masterLanguage, title: text(body['title'], FEED_TITLE_MAX) ?? '', text: text(body['text'], FEED_TEXT_MAX), label: kind === 'offer' ? text(body['label'], FEED_LABEL_MAX) : undefined, by: 'author' as const });
    const others = (before?.texts ?? []).filter((t) => t.language !== masterLanguage);
    const own: Record<StoredFeedKind, readonly string[]> = { info: ['route'], offer: ['route', 'link'], package: ['price', 'currency', 'categories'] };
    const fields = [...own[kind], 'slot', 'priority', 'from', 'to'];
    const sent = Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
    return FeedItems.stored({
      ...sent,
      id: before?.id ?? '',
      kind,
      masterLanguage,
      texts: [master, ...others],
      sourceHash: before?.sourceHash,
      visibility: FeedItems.visibilityOf(body['visibility'], before),
      ownerUid: before?.ownerUid ?? me,
      createdAt: before?.createdAt ?? now,
      updatedAt: now,
    }) as FeedItemData;
  }

  /** The reason the categories an author sent are not allowed (nothing sent is fine), or ''. Asked of what was sent, before it is cut to what is kept. */
  static categoriesError(value: unknown): string {
    return value === undefined ? '' : JigsawCategories.error(value);
  }

  /** The reason a visibility sent is not allowed (nothing sent is fine), or ''. */
  static visibilityError(value: unknown): string {
    return value === undefined || (JIGSAW_VISIBILITIES as readonly unknown[]).includes(value) ? '' : 'A tile is public, private or hidden.';
  }

  /** What an author chose (`everyone`, `owner` or `hidden`) as it is kept; nothing chosen is what the tile has, and **a new tile is private to begin with**, so its owner looks at it and makes it public when it is good. */
  private static visibilityOf(chosen: unknown, before: FeedItemData | null): 'owner' | 'hidden' | undefined {
    const v = chosen as JigsawVisibility | undefined;
    if (v === undefined) return before ? before.visibility : 'owner';
    return v === 'owner' || v === 'hidden' ? v : undefined;
  }

  /** The languages the AI has to make words for: those with no entry, and those whose AI entry was made from other master words. An entry the author wrote is never in the list. */
  static toTranslate(data: FeedItemData): string[] {
    const master = FeedTexts.entryOf(data.texts, data.masterLanguage);
    if (!master) return [];
    const current = FeedTexts.hashOf(master) === data.sourceHash;
    return JIGSAW_LANGUAGES.map((l) => l.code).filter((code) => {
      if (code === data.masterLanguage) return false;
      const entry = FeedTexts.entryOf(data.texts, code);
      return !entry || (entry.by === 'ai' && !current);
    });
  }

  /** The tile with the words the AI made put in (`by: 'ai'`), and the fingerprint of the master words they were made from. */
  static withTranslations(data: FeedItemData, made: Record<string, FeedWords>): FeedItemData {
    const master = FeedTexts.entryOf(data.texts, data.masterLanguage);
    if (!master) return data;
    const language = new Set(Object.keys(made).filter((l) => JigsawLanguages.is(l) && l !== data.masterLanguage));
    const kept = data.texts.filter((t) => !language.has(t.language));
    const added = [...language].map((l) => ({ language: l, title: made[l].title, text: made[l].text, label: made[l].label, by: 'ai' as const }));
    return { ...data, texts: FeedTexts.read([...kept, ...added]), sourceHash: FeedTexts.hashOf(master) };
  }

  /** Whether the tile matches the words that were searched for: any of them, in any language of the tile (not the case of the letters). Nothing searched matches every tile. */
  static matches(data: FeedItemData, search: string): boolean {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = data.texts.map((t) => [t.title, t.text, t.label].filter(Boolean).join(' ')).join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  }

  /** Whether this account may change the tile: the one who made it, and an admin. A tile from before owners has none, and is anybody's who may publish. */
  static mayChange(data: FeedItemData, me: string | undefined, admin: boolean): boolean {
    return admin || !data.ownerUid || data.ownerUid === me;
  }
}
