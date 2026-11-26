import { PlayLookSetup, PlayLooks } from './play-look';
import { TextLookSetup, TextLooks } from './text-look';
import { PartSize, PartSizes, SIZED_PARTS } from './part-size';
import { JigsawFilter, JigsawFilters, JigsawSetup } from './jigsaw-filter';
import { DEFAULT_LANGUAGE, JigsawLanguages } from './language';
import { UserLevel, UserLevels } from './user-level';

// A user of the jigsaws: someone who plays. There is no sign-in yet: a person chooses a user name and a name, and plays as that user (the plays of a jigsaw say which user
// played them). The users are kept in the collection `jigsaw-users`, one document each, with an id the database makes (the UID, which is what a play is kept by). The user
// name is the extra: it is chosen by the person, unique, and used to look a user up.

/** The Firestore collection that holds the users. */
export const JIGSAW_USERS = 'jigsaw-users';

/** The shortest and the longest user name, and the longest name. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USER_NAME_MAX = 60;

/** A user as the app has it. */
export interface JigsawUserSpec {
  /** the UID: made by the database when the user is made; never changes, and is what plays are kept by */
  id: string;
  /** the user name the person chose: small letters, digits, _ and -; unique; for looking a user up */
  username: string;
  /** the name that is shown ("Karin") */
  name: string;
  /** the language the app is shown in for the user (a code of `JIGSAW_LANGUAGES`; English when the user has not chosen) */
  language: string;
  /** how the user looks for jigsaws (the Find page: cards or list, and the filter), kept when Go is pressed, so it is the same on every device; none until Go has been pressed */
  search?: JigsawSetup;
  /** what the app's picture list is filtered by (the preferences of the app), kept with the user so it is the same on every device; none until the user has chosen something */
  listFilter?: JigsawFilter;
  /** how the user likes the play area: the table and the sound of a click (`PlayLooks`); none until the user has chosen */
  playLook?: PlayLookSetup;
  /** how big the user likes the text and in which letters (`TextLooks`); none until the user has chosen */
  textLook?: TextLookSetup;
  /** how big the user likes the picture tiles and the small labels (`PartSizes`); none until the user has chosen */
  tileSize?: PartSize;
  labelSize?: PartSize;
  /** whether the picture tiles tell their details (description, categories, motive, author, date, the marks after the name); none until the user has chosen, and then they do */
  tileDetails?: boolean;
  /** milliseconds since 1970 */
  createdAt: number;
  /** when somebody last chose to play as this account (milliseconds since 1970): the accounts are listed with the one used last first; an account never chosen since this was kept has none */
  lastUsedAt?: number;
  /**
   * when the picture of the account was set (milliseconds since 1970); the picture itself is a file in Storage (`jigsaw/accounts/<id>/picture`), read at `/jigsaw-users/:id/picture`. The page asks for it with
   * this time, so a new picture is seen at once and an old one is kept by the browser.
   */
  pictureAt?: number;
  /**
   * SERVER ONLY, never in what the API tells the page: the UIDs of the Firebase accounts that are verified for this user, at most `LOGONS_MAX`. Any one of them is enough to act as the user (the
   * person is signed in with one account at a time); a user with none needs no login, as before. They are changed only by the routes of the logons (`functions/src/logons/`), never by a body from the page.
   */
  firebaseUids?: string[];
  /** what the account may do beyond playing (`user` when nothing is kept); set only by an admin, never by a body that makes or changes a user; it counts only for an account that needs a login (`UserLevels.of`) */
  level?: UserLevel;
  /** OUTPUT ONLY, never stored: the user has verified accounts, so it needs a login to be used (the page is told this instead of the accounts) */
  protected?: boolean;
}

/** What a person chooses about their account (besides its picture): the fields of a change that are kept just as they are. A new setting is added here, and the compiler says where else. */
export type UserSettings = Partial<Pick<JigsawUserSpec, 'name' | 'username' | 'language' | 'search' | 'listFilter' | 'playLook' | 'textLook' | 'tileSize' | 'labelSize' | 'tileDetails'>>;

/** A change of an account as the page asks for it: the settings, and the picture (a data address; null takes it away). */
export type UserEdit = UserSettings & { picture?: string | null };

/** The most Firebase accounts that can be verified for one jigsaw user. */
export const LOGONS_MAX = 7;

export class JigsawUsers {
  /** The verified accounts as a document has them: a list of different texts, at most `LOGONS_MAX` (anything else is left out). */
  static logonsOf(doc: { firebaseUids?: unknown } | null | undefined): string[] {
    const list = Array.isArray(doc?.firebaseUids) ? (doc.firebaseUids as unknown[]) : [];
    return [...new Set(list.filter((u): u is string => typeof u === 'string' && u.length > 0 && u.length <= 128))].slice(0, LOGONS_MAX);
  }

  /** The user needs a login: it has at least one verified account. */
  static requiresLogon(user: { firebaseUids?: unknown } | null | undefined): boolean {
    return JigsawUsers.logonsOf(user).length > 0;
  }

  /** Whether the Firebase account `uid` (from a token that was checked) may act as the user: any user with no verified account is open to anybody, one with some only to those. */
  static mayAct(user: { firebaseUids?: unknown } | null | undefined, uid: string | undefined): boolean {
    const list = JigsawUsers.logonsOf(user);
    return list.length === 0 || (!!uid && list.includes(uid));
  }

  /** The list with this account added (as it is when it is there already), or the reason it cannot be: there are `LOGONS_MAX` already. */
  static withLogon(list: readonly string[], uid: string): { list: string[] } | { error: string } {
    if (list.includes(uid)) return { list: [...list] };
    if (list.length >= LOGONS_MAX) return { error: `A user can have at most ${LOGONS_MAX} logins: take one away first.` };
    return { list: [...list, uid] };
  }

  /** The list without this account. */
  static withoutLogon(list: readonly string[], uid: string): string[] {
    return list.filter((u) => u !== uid);
  }

  /** A user name as it is kept: without spaces round it, in small letters (so "Karin" and "karin" are the same user). */
  static normalised(username: string): string {
    return username.trim().toLowerCase();
  }

  /**
   * A user name made from a person's name, for somebody who only said their name: accents taken off, small letters and digits only, words joined with "-", and the `suffix` (digits, to
   * tell two people with the same name apart) put last. Always a name that `usernameError` allows.
   */
  static usernameFrom(name: string, suffix: string): string {
    const plain = name.toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const tail = suffix.toLowerCase().replace(/[^a-z0-9]/g, '');
    const room = USERNAME_MAX - (tail ? tail.length + 1 : 0);
    const base = (plain.slice(0, room).replace(/-+$/, '') || 'player');
    const made = tail ? `${base}-${tail}` : base;
    return made.length >= USERNAME_MIN ? made : `${made}-user`.slice(0, USERNAME_MAX);
  }

  /**
   * Whether what a person typed in "What is your name?" is somebody who is already a user: it is looked for in both the name and the user name, ignoring capitals and accents, and it matches
   * when it is the whole name, the whole user name, or a whole word of either (so "leif" finds "Leif Auke" and `leif-auke-5`, and "ann" does not find "Hanna" or "Anna"). Two letters at least.
   */
  static matches(user: { name: string; username: string }, typed: string): boolean {
    const plain = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const wanted = plain(typed);
    if (wanted.length < 2) return false;
    const words = (t: string) => plain(t).split(/[^a-z0-9]+/).filter(Boolean);
    return plain(user.name) === wanted || plain(user.username) === wanted || words(user.name).includes(wanted) || words(user.username).includes(wanted) || plain(user.name).replace(/\s+/g, ' ') === wanted.replace(/\s+/g, ' ');
  }

  /** The reason a user name is not allowed, or ''. */
  static usernameError(value: unknown): string {
    if (typeof value !== 'string') return 'Choose an alias.';
    const username = JigsawUsers.normalised(value);
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return `The alias must be ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
    return '';
  }

  /** The reason a name is not allowed, or ''. */
  static nameError(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return 'Give your name.';
    if (value.trim().length > USER_NAME_MAX) return `The name can be at most ${USER_NAME_MAX} characters.`;
    return '';
  }

  /** The reason a new user is not allowed, or ''. */
  static error(input: { username?: unknown; name?: unknown; language?: unknown } | null | undefined): string {
    return JigsawUsers.usernameError(input?.username) || JigsawUsers.nameError(input?.name) || JigsawLanguages.error(input?.language);
  }

  /**
   * What a change of a user is, from a request: only the fields that are there are changed; an empty e-mail address (or null) takes the address away. The change as it is
   * to be made, or the reason it is not allowed.
   */
  static change(input: { [field in keyof UserEdit]?: unknown } | null | undefined): { change: UserEdit } | { error: string } {
    const body = input ?? {};
    const change: UserEdit = {};
    if (body.picture !== undefined) {
      const error = JigsawUsers.pictureError(body.picture);
      if (error) return { error };
      change.picture = body.picture as string | null;
    }
    if (body.name !== undefined) {
      const error = JigsawUsers.nameError(body.name);
      if (error) return { error };
      change.name = (body.name as string).trim();
    }
    if (body.username !== undefined) {
      const error = JigsawUsers.usernameError(body.username);
      if (error) return { error };
      change.username = JigsawUsers.normalised(body.username as string);
    }
    if (body.language !== undefined) {
      if (!JigsawLanguages.is(body.language)) return { error: JigsawLanguages.error(body.language) || 'Choose a language.' };
      change.language = body.language;
    }
    if (body.search !== undefined) {
      if (!JigsawFilters.isSetup(body.search)) return { error: 'The search is not one the Find page makes.' };
      change.search = { view: body.search.view, filter: body.search.filter };
    }
    if (body.listFilter !== undefined) {
      if (!JigsawFilters.is(body.listFilter)) return { error: 'The filter of the list is not one the preferences make.' };
      change.listFilter = JigsawFilters.stored(body.listFilter);
    }
    if (body.playLook !== undefined) {
      if (!PlayLooks.is(body.playLook)) return { error: 'Choose a table, and the sound on or off.' };
      change.playLook = PlayLooks.stored(body.playLook);
    }
    if (body.textLook !== undefined) {
      if (!TextLooks.is(body.textLook)) return { error: 'Choose a size of the text and a font.' };
      change.textLook = TextLooks.stored(body.textLook);
    }
    for (const part of SIZED_PARTS) {
      const size = body[part];
      if (size === undefined) continue;
      if (!PartSizes.is(size)) return { error: 'Choose a size: small, medium or large.' };
      change[part] = size;
    }
    if (body.tileDetails !== undefined) {
      if (typeof body.tileDetails !== 'boolean') return { error: 'Say whether the tiles show their details: yes or no.' };
      change.tileDetails = body.tileDetails;
    }
    return Object.keys(change).length ? { change } : { error: 'Say what to change: the account name, the alias, the language, the picture, the search, the filter of the list, the play area, the text or the sizes.' };
  }

  /** The order of the accounts in a list: the one used last first; those never used after those that were, newest made first; then by name. */
  static byLastUsed(a: Pick<JigsawUserSpec, 'name' | 'createdAt' | 'lastUsedAt'>, b: Pick<JigsawUserSpec, 'name' | 'createdAt' | 'lastUsedAt'>): number {
    return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.createdAt - a.createdAt || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  }

  /** How long a choice of the account is not written down again (milliseconds): choosing it twice in a minute is one use. */
  static readonly USED_KEEP_MS = 60_000;

  /** The largest picture: a square of at most 128 px as a JPEG is some thousands of characters; this leaves room and no more. */
  static readonly PICTURE_MAX_CHARS = 30_000;

  /** The reason a picture is not allowed, or '': a JPEG as a data address (the page cuts it square and shrinks it to 128 px first; the server keeps it as a file), not larger than `PICTURE_MAX_CHARS`. null takes the picture away. */
  static pictureError(value: unknown): string {
    if (value === null) return '';
    if (typeof value !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return 'The picture must be a small JPEG.';
    if (value.length > JigsawUsers.PICTURE_MAX_CHARS) return 'The picture is too large: choose a smaller one.';
    return '';
  }

  /** The reason a UID (the id of a user in the address) is not allowed, or ''. */
  static idError(value: unknown): string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? '' : 'Not a user id.';
  }

  /** The user as it is stored (the UID is the id of the document), for one that is allowed: only the known fields, the user name in small letters, the name trimmed. */
  static stored(input: { username: string; name: string; language?: string }, createdAt: number): Omit<JigsawUserSpec, 'id'> {
    return { username: JigsawUsers.normalised(input.username), name: input.name.trim(), language: JigsawLanguages.is(input.language) ? input.language : DEFAULT_LANGUAGE, createdAt };
  }

  /** The user as the API tells it to anyone: without the e-mail address, which is private, and without the verified accounts (`protected` says there are some). */
  static publicOf(user: JigsawUserSpec): Omit<JigsawUserSpec, 'firebaseUids'> {
    const { firebaseUids: _accounts, ...open } = user;
    return { ...open, ...(JigsawUsers.requiresLogon(user) ? { protected: true } : {}) };
  }

  /** The user as the person who made it gets it back: the e-mail address too, but never the verified accounts. */
  static ownerView(user: JigsawUserSpec): Omit<JigsawUserSpec, 'firebaseUids'> {
    const { firebaseUids: _accounts, ...rest } = user;
    return { ...rest, ...(JigsawUsers.requiresLogon(user) ? { protected: true } : {}) };
  }

  /**
   * Why a user may not be deleted, or '': a user is deleted only when nothing is attached to it: no jigsaw it owns, no round it has played (a round nobody moved a piece in does not count), and no
   * login besides the one that asks (`logins` is how many logins are verified for it; the one that asks may be one of them).
   */
  static removeError(use: { jigsaws: number; rounds: number; logins: number }): string {
    if (use.jigsaws) return 'This account owns jigsaws: delete them first.';
    if (use.rounds) return 'This account has played rounds: delete them first.';
    if (use.logins > 1) return 'Other logins are verified for this account: take them away first.';
    return '';
  }

  /** A user as it comes out of the database. A user that an earlier version made has its user name as the id of its document and no `username`: the id is read as the user name. */
  static fromStored(id: string, doc: Partial<JigsawUserSpec>): JigsawUserSpec {
    const username = doc.username ?? id;
    return { id, username, name: doc.name ?? username, language: JigsawLanguages.of(doc), ...(JigsawFilters.isSetup(doc.search) ? { search: doc.search } : {}), ...(JigsawFilters.is(doc.listFilter) ? { listFilter: JigsawFilters.stored(doc.listFilter) } : {}), ...(PlayLooks.is(doc.playLook) ? { playLook: PlayLooks.stored(doc.playLook) } : {}), ...(TextLooks.is(doc.textLook) ? { textLook: TextLooks.stored(doc.textLook) } : {}), ...(PartSizes.is(doc.tileSize) ? { tileSize: doc.tileSize } : {}), ...(PartSizes.is(doc.labelSize) ? { labelSize: doc.labelSize } : {}), ...(typeof doc.tileDetails === 'boolean' ? { tileDetails: doc.tileDetails } : {}), createdAt: doc.createdAt ?? 0, ...(typeof doc.lastUsedAt === 'number' ? { lastUsedAt: doc.lastUsedAt } : {}), ...(typeof doc.pictureAt === 'number' ? { pictureAt: doc.pictureAt } : {}), ...(JigsawUsers.logonsOf(doc).length ? { firebaseUids: JigsawUsers.logonsOf(doc) } : {}), ...(UserLevels.stored(doc) !== 'user' ? { level: UserLevels.stored(doc) } : {}) };
  }
}
