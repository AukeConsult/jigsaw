import { JigsawFilters, JigsawSetup } from './jigsaw-filter';
import { DEFAULT_LANGUAGE, JigsawLanguages } from './language';

// A user of the jigsaws: someone who plays. There is no sign-in yet: a person chooses a user name and a name, and plays as that user (the plays of a jigsaw say which user
// played them). The users are kept in the collection `jigsaw-users`, one document each, with an id the database makes (the UID, which is what a play is kept by). The user
// name is the extra: it is chosen by the person, unique, and used to look a user up.

/** The Firestore collection that holds the users. */
export const JIGSAW_USERS = 'jigsaw-users';

/** The shortest and the longest user name, and the longest name. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USER_NAME_MAX = 60;
/** The longest e-mail address (the most an address can be). */
export const USER_EMAIL_MAX = 254;

/** A user as the app has it. */
export interface JigsawUserSpec {
  /** the UID: made by the database when the user is made; never changes, and is what plays are kept by */
  id: string;
  /** the user name the person chose: small letters, digits, _ and -; unique; for looking a user up */
  username: string;
  /** the name that is shown ("Karin") */
  name: string;
  /**
   * an e-mail address the person may give (optional), kept so the user can later be connected to a registered user (a Firebase account with the same address).
   * It is private: the API gives it back only to the person who made the user, when it is made, and never in a lookup (`JigsawUsers.publicOf`).
   */
  email?: string;
  /** the language the app is shown in for the user (a code of `JIGSAW_LANGUAGES`; English when the user has not chosen) */
  language: string;
  /** how the user looks for jigsaws (the Find page: cards or list, and the filter), kept when Go is pressed, so it is the same on every device; none until Go has been pressed */
  search?: JigsawSetup;
  /** milliseconds since 1970 */
  createdAt: number;
}

export class JigsawUsers {
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

  /** The reason a user name is not allowed, or ''. */
  static usernameError(value: unknown): string {
    if (typeof value !== 'string') return 'Choose a user name.';
    const username = JigsawUsers.normalised(value);
    if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return `The user name must be ${USERNAME_MIN} to ${USERNAME_MAX} characters.`;
    if (!/^[a-z0-9_-]+$/.test(username)) return 'The user name can have letters (a-z, no accents), digits, _ and - only.';
    return '';
  }

  /** The reason a name is not allowed, or ''. */
  static nameError(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) return 'Give your name.';
    if (value.trim().length > USER_NAME_MAX) return `The name can be at most ${USER_NAME_MAX} characters.`;
    return '';
  }

  /** The reason an e-mail address is not allowed, or ''. It is optional: none (or an empty one) is fine. */
  static emailError(value: unknown): string {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string' || value.trim().length > USER_EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'That is not an e-mail address.';
    return '';
  }

  /** The reason a new user is not allowed, or ''. */
  static error(input: { username?: unknown; name?: unknown; email?: unknown; language?: unknown } | null | undefined): string {
    return JigsawUsers.usernameError(input?.username) || JigsawUsers.nameError(input?.name) || JigsawUsers.emailError(input?.email) || JigsawLanguages.error(input?.language);
  }

  /**
   * What a change of a user is, from a request: only the fields that are there are changed; an empty e-mail address (or null) takes the address away. The change as it is
   * to be made, or the reason it is not allowed.
   */
  static change(input: { name?: unknown; username?: unknown; email?: unknown; language?: unknown; search?: unknown } | null | undefined): { change: { name?: string; username?: string; email?: string | null; language?: string; search?: JigsawSetup } } | { error: string } {
    const body = input ?? {};
    const change: { name?: string; username?: string; email?: string | null; language?: string; search?: JigsawSetup } = {};
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
    if (body.email !== undefined) {
      const error = JigsawUsers.emailError(body.email);
      if (error) return { error };
      change.email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;
    }
    if (body.language !== undefined) {
      if (!JigsawLanguages.is(body.language)) return { error: JigsawLanguages.error(body.language) || 'Choose a language.' };
      change.language = body.language;
    }
    if (body.search !== undefined) {
      if (!JigsawFilters.isSetup(body.search)) return { error: 'The search is not one the Find page makes.' };
      change.search = { view: body.search.view, filter: body.search.filter };
    }
    return Object.keys(change).length ? { change } : { error: 'Say what to change: the name, the user name, the e-mail address, the language or the search.' };
  }

  /** The reason a UID (the id of a user in the address) is not allowed, or ''. */
  static idError(value: unknown): string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? '' : 'Not a user id.';
  }

  /** The user as it is stored (the UID is the id of the document), for one that is allowed: only the known fields, the user name in small letters, the name trimmed. */
  static stored(input: { username: string; name: string; email?: string | null; language?: string }, createdAt: number): Omit<JigsawUserSpec, 'id'> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    return { username: JigsawUsers.normalised(input.username), name: input.name.trim(), ...(email ? { email } : {}), language: JigsawLanguages.is(input.language) ? input.language : DEFAULT_LANGUAGE, createdAt };
  }

  /** The user as the API tells it to anyone: without the e-mail address, which is private. */
  static publicOf(user: JigsawUserSpec): Omit<JigsawUserSpec, 'email'> {
    const { email: _private, ...open } = user;
    return open;
  }

  /** A user as it comes out of the database. A user that an earlier version made has its user name as the id of its document and no `username`: the id is read as the user name. */
  static fromStored(id: string, doc: Partial<JigsawUserSpec>): JigsawUserSpec {
    const username = doc.username ?? id;
    return { id, username, name: doc.name ?? username, ...(doc.email ? { email: doc.email } : {}), language: JigsawLanguages.of(doc), ...(JigsawFilters.isSetup(doc.search) ? { search: doc.search } : {}), createdAt: doc.createdAt ?? 0 };
  }
}
