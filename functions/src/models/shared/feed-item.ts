import { JigsawKinds } from './jigsaw-kind';
import type { JigsawSummary } from './jigsaw-search';

// A tile of the home page. The home page is a list of tiles, and a tile is a picture, an offer, a piece of information or a package. `FeedItem` is the parent: what every tile has is here, and each kind
// (`PictureItem`, `InfoItem`, `OfferItem`, `PackageItem`) overrides small hooks (what is wrong with it, where a press leads, where it goes among the pictures) instead of a branch on the kind anywhere.
// A picture is made from what a search found (`PictureItem.from`) and is not kept as a tile; the other kinds are kept as documents in `jigsaw-feed` (`FeedItemData`). Like every model object, a tile never changes.

/** The Firestore collection that holds the tiles that are not pictures. */
export const JIGSAW_FEED = 'jigsaw-feed';

export const FEED_KINDS = ['picture', 'offer', 'info', 'package'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];
/** The kinds that are kept as documents (a picture is a jigsaw, kept in `jigsaw`). */
export const STORED_FEED_KINDS = ['offer', 'info', 'package'] as const;
export type StoredFeedKind = (typeof STORED_FEED_KINDS)[number];

export const FEED_TITLE_MAX = 80;
export const FEED_TEXT_MAX = 600;
export const FEED_LABEL_MAX = 24;
export const FEED_PACKAGE_MAX = 200;

/** What a press on a tile does. The page turns it into where to go (the model knows nothing of the pages). */
export type FeedAction =
  | { type: 'jigsaw'; jigsawId: string; asPicture: boolean }
  | { type: 'package'; packageId: string }
  | { type: 'route'; to: string }
  | { type: 'link'; url: string }
  | { type: 'none' };

/** A tile that is kept, as it is stored and sent (only these fields are known). */
export interface FeedItemData {
  id: string;
  kind: StoredFeedKind;
  title: string;
  /** the words of an information, an offer or a package */
  text?: string;
  /** a short mark on an offer ("-20 %") */
  label?: string;
  /** where an offer leads: a page of the site (a route) or another site (https) */
  route?: string;
  link?: string;
  /** the jigsaws of a package */
  jigsawIds?: string[];
  /** after how many pictures it comes (nothing: its kind says) */
  slot?: number;
  /** the higher one comes first when two have the same place */
  priority?: number;
  /** milliseconds since 1970: it is shown from and to this time */
  from?: number;
  to?: number;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** The part every tile has. */
export interface FeedCommon {
  id: string;
  title: string;
  slot?: number;
  priority?: number;
  from?: number;
  to?: number;
}

/** A tile of the home page: the parent of the kinds. */
export abstract class FeedItem {
  abstract readonly kind: FeedKind;
  readonly id: string;
  readonly title: string;
  readonly slot?: number;
  readonly priority: number;
  readonly from?: number;
  readonly to?: number;

  constructor(common: FeedCommon) {
    this.id = common.id;
    this.title = common.title;
    this.slot = common.slot;
    this.priority = common.priority ?? 0;
    this.from = common.from;
    this.to = common.to;
  }

  /** What a press on the tile does. */
  abstract action(): FeedAction;

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
    if (!this.title.trim() || this.title.length > FEED_TITLE_MAX) return `A title of 1 to ${FEED_TITLE_MAX} letters.`;
    if (this.slot !== undefined && (!Number.isInteger(this.slot) || this.slot < 0)) return 'A place is a whole number of pictures, 0 or more.';
    if (this.from !== undefined && this.to !== undefined && this.to < this.from) return 'It ends before it begins.';
    return this.extraError();
  }

  /** Whether it is time to show it. */
  isShown(now: number): boolean {
    return (this.from === undefined || now >= this.from) && (this.to === undefined || now <= this.to);
  }
}

/** A jigsaw or a picture found by a search, as a tile. It is not kept as a tile. */
export class PictureItem extends FeedItem {
  readonly kind = 'picture';

  constructor(readonly summary: JigsawSummary) {
    super({ id: summary.id, title: summary.name });
  }

  static from(summary: JigsawSummary): PictureItem {
    return new PictureItem(summary);
  }

  action(): FeedAction {
    return { type: 'jigsaw', jigsawId: this.summary.id, asPicture: JigsawKinds.isPicture(this.summary) };
  }
}

/** Words to read: a welcome, a tip, news. It may lead to a page of the site. */
export class InfoItem extends FeedItem {
  readonly kind = 'info';

  constructor(common: FeedCommon, readonly text: string, readonly route?: string) {
    super(common);
  }

  action(): FeedAction {
    return this.route ? { type: 'route', to: this.route } : { type: 'none' };
  }

  protected override extraError(): string {
    if (!this.text.trim() || this.text.length > FEED_TEXT_MAX) return `The words of an information: 1 to ${FEED_TEXT_MAX} letters.`;
    return FeedItems.routeError(this.route);
  }

  /** An information comes first: the first at the top, then one after every sixth picture. */
  override defaultSlot(order: number): number {
    return order * 6;
  }
}

/** Something to be offered, with a short mark ("-20 %") and a place to go. */
export class OfferItem extends FeedItem {
  readonly kind = 'offer';

  constructor(common: FeedCommon, readonly label: string, readonly text: string | undefined, readonly route?: string, readonly link?: string) {
    super(common);
  }

  action(): FeedAction {
    if (this.link) return { type: 'link', url: this.link };
    return this.route ? { type: 'route', to: this.route } : { type: 'none' };
  }

  protected override extraError(): string {
    if (!this.label.trim() || this.label.length > FEED_LABEL_MAX) return `The mark of an offer: 1 to ${FEED_LABEL_MAX} letters.`;
    if (this.text !== undefined && this.text.length > FEED_TEXT_MAX) return `The words of an offer: at most ${FEED_TEXT_MAX} letters.`;
    if (!this.route && !this.link) return 'An offer leads somewhere: a page of the site or a link.';
    if (this.link && !/^https:\/\/[^\s]+$/.test(this.link)) return 'A link starts with https://.';
    return FeedItems.routeError(this.route);
  }

  /** An offer comes after the seventh picture, and then after every twelfth. */
  override defaultSlot(order: number): number {
    return 7 + order * 12;
  }
}

/** A collection of pictures that can be played together. */
export class PackageItem extends FeedItem {
  readonly kind = 'package';

  constructor(common: FeedCommon, readonly text: string | undefined, readonly jigsawIds: readonly string[]) {
    super(common);
  }

  action(): FeedAction {
    return { type: 'package', packageId: this.id };
  }

  protected override extraError(): string {
    if (this.text !== undefined && this.text.length > FEED_TEXT_MAX) return `The words of a package: at most ${FEED_TEXT_MAX} letters.`;
    if (this.jigsawIds.length > FEED_PACKAGE_MAX || this.jigsawIds.some((id) => !ID.test(id))) return `A package holds at most ${FEED_PACKAGE_MAX} pictures, each by its id.`;
    return '';
  }

  /** A package comes after the third picture, and then after every twelfth. */
  override defaultSlot(order: number): number {
    return 3 + order * 12;
  }
}

const text = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const whole = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined);

/** The tiles that are kept: made from what is stored, checked, and which are shown. */
export class FeedItems {
  /** The reason a route is not allowed (a page of the site: it starts with one `/`), or ''. */
  static routeError(route: string | undefined): string {
    return route === undefined || /^\/(?!\/)[^\s]*$/.test(route) ? '' : 'A route is a page of the site: it starts with one /.';
  }

  /** A tile as it is kept: only the known fields, the words trimmed and cut. A document that is no tile gives null. */
  static stored(raw: Record<string, unknown>): FeedItemData | null {
    const kind = raw['kind'];
    if (!STORED_FEED_KINDS.some((k) => k === kind)) return null;
    const jigsawIds = Array.isArray(raw['jigsawIds']) ? (raw['jigsawIds'] as unknown[]).filter((v): v is string => typeof v === 'string') : undefined;
    const data: Record<string, unknown> = {
      id: typeof raw['id'] === 'string' ? raw['id'] : '',
      kind,
      title: text(raw['title'], FEED_TITLE_MAX) ?? '',
      text: text(raw['text'], FEED_TEXT_MAX),
      label: text(raw['label'], FEED_LABEL_MAX),
      route: text(raw['route'], 200),
      link: text(raw['link'], 300),
      jigsawIds: kind === 'package' ? (jigsawIds ?? []) : undefined,
      slot: whole(raw['slot']),
      priority: whole(raw['priority']),
      from: whole(raw['from']),
      to: whole(raw['to']),
    };
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as unknown as FeedItemData;
  }

  /** The object of a kept tile. The kind decides which class it is; this is the one place that knows the kinds. */
  static of(data: FeedItemData): FeedItem {
    const common: FeedCommon = { id: data.id, title: data.title, slot: data.slot, priority: data.priority, from: data.from, to: data.to };
    switch (data.kind) {
      case 'info':
        return new InfoItem(common, data.text ?? '', data.route);
      case 'offer':
        return new OfferItem(common, data.label ?? '', data.text, data.route, data.link);
      case 'package':
        return new PackageItem(common, data.text, data.jigsawIds ?? []);
    }
  }

  /** The reason this is not a tile that may be kept, or ''. */
  static error(raw: Record<string, unknown>): string {
    const data = FeedItems.stored(raw);
    return data ? FeedItems.of(data).error() : 'Not a kind of tile: offer, info or package.';
  }

  /** The tiles to show at this time, as the objects: the ones that are right and whose time it is. */
  static shown(documents: readonly Record<string, unknown>[], now: number): FeedItem[] {
    return documents
      .map((d) => FeedItems.stored(d))
      .filter((d): d is FeedItemData => d !== null)
      .map((d) => FeedItems.of(d))
      .filter((item) => item.error() === '' && item.isShown(now));
  }

  /** What is sent of a tile: the plain data again (for the API). */
  static dataOf(item: FeedItem): FeedItemData {
    return FeedItems.stored({ ...(item as unknown as Record<string, unknown>), kind: item.kind }) as FeedItemData;
  }
}
