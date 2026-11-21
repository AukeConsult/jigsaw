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
  /** milliseconds since 1970 */
  createdAt: number;
}

export class JigsawUsers {
  /** A user name as it is kept: without spaces round it, in small letters (so "Karin" and "karin" are the same user). */
  static normalised(username: string): string {
    return username.trim().toLowerCase();
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
  static error(input: { username?: unknown; name?: unknown; email?: unknown } | null | undefined): string {
    return JigsawUsers.usernameError(input?.username) || JigsawUsers.nameError(input?.name) || JigsawUsers.emailError(input?.email);
  }

  /**
   * What a change of a user is, from a request: only the fields that are there are changed; an empty e-mail address (or null) takes the address away. The change as it is
   * to be made, or the reason it is not allowed.
   */
  static change(input: { name?: unknown; username?: unknown; email?: unknown } | null | undefined): { change: { name?: string; username?: string; email?: string | null } } | { error: string } {
    const body = input ?? {};
    const change: { name?: string; username?: string; email?: string | null } = {};
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
    return Object.keys(change).length ? { change } : { error: 'Say what to change: the name, the user name or the e-mail address.' };
  }

  /** The reason a UID (the id of a user in the address) is not allowed, or ''. */
  static idError(value: unknown): string {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? '' : 'Not a user id.';
  }

  /** The user as it is stored (the UID is the id of the document), for one that is allowed: only the known fields, the user name in small letters, the name trimmed. */
  static stored(input: { username: string; name: string; email?: string | null }, createdAt: number): Omit<JigsawUserSpec, 'id'> {
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    return { username: JigsawUsers.normalised(input.username), name: input.name.trim(), ...(email ? { email } : {}), createdAt };
  }

  /** The user as the API tells it to anyone: without the e-mail address, which is private. */
  static publicOf(user: JigsawUserSpec): Omit<JigsawUserSpec, 'email'> {
    const { email: _private, ...open } = user;
    return open;
  }

  /** A user as it comes out of the database. A user that an earlier version made has its user name as the id of its document and no `username`: the id is read as the user name. */
  static fromStored(id: string, doc: Partial<JigsawUserSpec>): JigsawUserSpec {
    const username = doc.username ?? id;
    return { id, username, name: doc.name ?? username, ...(doc.email ? { email: doc.email } : {}), createdAt: doc.createdAt ?? 0 };
  }
}
