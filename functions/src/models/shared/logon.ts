import { UserLevel } from './user-level';

// A person who signs in with Firebase (Google, e-mail, phone). Karins jigsaw and Seven Friends are in the same Firebase project, so a login is one login for both, and the
// account of a person is ONE document in the collection `user-account` (the id is the Firebase UID). This is the same document that Seven Friends keeps, written with the same
// fields and the same rules (`LogonAccounts.stored` is what Seven Friends' `POST /users/sync` does), so the two apps never disagree about who somebody is. The jigsaw writes only
// what a login proves; what Seven Friends keeps in the document besides (profile, circles, medals) is left as it is.

/** The Firestore collection of the accounts. It is Seven Friends' own collection too: the jigsaw writes to it the way Seven Friends does, and nothing else. */
export const USER_ACCOUNTS = 'user-account';

/** The most characters of a name or a text kept from a login. */
const MAX_TEXT = 200;

/** What the jigsaw reads from a verified Firebase ID token (a part of what the token has). */
export interface LogonToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  name?: string;
  picture?: string;
  firebase?: { sign_in_provider?: string };
}

/** The fields of an account that a login decides (the times and the count of logins are added when it is saved). */
export interface LogonAccount {
  uid: string;
  email: string | null;
  /** the address in small letters, for finding a person by it: kept for an unverified address too, friends are told when it is not verified */
  emailLower: string | null;
  emailVerified: boolean;
  /** the phone number, only when it was confirmed with an SMS code */
  verifiedPhone: string | null;
  /** the last 8 digits of a confirmed number (so "+47 926 55 195" and "92655195" are the same); left out when there is none */
  phoneKey?: string;
  /** a confirmed number is the contact number; left out when there is none (a number typed on a profile stays) */
  phone?: string;
  displayName: string | null;
  photoURL: string | null;
  provider: string | null;
  /** the stamp of the account: made with it and never changed (Seven Friends asks for it to know an account is the same one) */
  accountId: string;
}

/** What the page gets about the person who signed in. */
export interface LogonUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  name: string | null;
  photoURL: string | null;
  provider: string | null;
}

/** A jigsaw user that the signed-in account is verified for (enough to choose it from a list). */
export interface LinkedUser {
  id: string;
  name: string;
  username: string;
  pictureAt?: number;
  /** the level kept on the account (nothing: user): an account the login is verified for, so it counts (`UserLevels.of`); the page uses it to know that the login is an admin's */
  level?: UserLevel;
}

/** The answer of `POST /jigsaw/api/session`. */
export interface LogonSession {
  ok: true;
  accountId: string;
  /** true when this login made the account (it did not exist in either app) */
  created: boolean;
  user: LogonUser;
  /** the jigsaw users this account is verified for (none when it has not been linked to any) */
  users: LinkedUser[];
}

/**
 * One verified login of a jigsaw user as the page is told it: `ref` is what a removal asks for (a short hash, never the account's own id), `you` says it is the one signed in now, and the rest says
 * which login it is: the kind (`provider`: `google.com`, `password`, `phone`), the name, the e-mail address, the phone number (its last four digits only) and the picture of the account. All of it is read
 * from the account when it is shown, never kept with the user.
 */
export interface UserLogon {
  ref: string;
  you: boolean;
  provider: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  photoURL: string | null;
}

/** The link code: what a person types on a second login to have it verified for a user that the first login already is verified for. */
export class LinkCodes {
  /** Letters and digits that are not mistaken for each other. */
  static readonly ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  static readonly LENGTH = 10;
  /** How long a code works, in minutes. */
  static readonly MINUTES = 10;

  /** The code as it is compared: capitals, without spaces and hyphens (it is shown as `ABCDE-FGHJK`). */
  static normalise(text: unknown): string {
    return typeof text === 'string' ? text.toUpperCase().replace(/[\s-]/g, '') : '';
  }

  /** The reason a code is not one, or ''. */
  static error(text: unknown): string {
    const code = LinkCodes.normalise(text);
    return code.length === LinkCodes.LENGTH && [...code].every((c) => LinkCodes.ALPHABET.includes(c)) ? '' : 'That is not a link code.';
  }

  /** The code for showing: two groups of five. */
  static shown(code: string): string {
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  }
}

export class LogonAccounts {
  /** An account a login is verified for, as the page is told of it: only these fields of it. */
  static linkedUser(user: LinkedUser): LinkedUser {
    return { id: user.id, name: user.name, username: user.username, ...(user.pictureAt ? { pictureAt: user.pictureAt } : {}), ...(user.level ? { level: user.level } : {}) };
  }

  /** A trimmed text, or null when it is empty or not a text. */
  static text(value: unknown, max = MAX_TEXT): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : null;
  }

  /** The first of these that is a real text, or null: a missing name is never a name. */
  static firstText(...values: unknown[]): string | null {
    for (const value of values) {
      const found = LogonAccounts.text(value);
      if (found) return found;
    }
    return null;
  }

  /** A phone number reduced to its last 8 digits; null when it has fewer. */
  static phoneKey(phone: string | null | undefined): string | null {
    const digits = (phone ?? '').replace(/\D/g, '');
    return digits.length >= 8 ? digits.slice(-8) : null;
  }

  /** The address that the login proves: only when the token says it is verified (Google, an e-mail link or a confirmed address). */
  static verifiedEmail(token: LogonToken): string | null {
    return token.email && token.email_verified === true ? token.email.toLowerCase() : null;
  }

  /**
   * The fields of the account as a login says them. `existing` is what the account document has already: a name the person chose stays (the name of the login is only the
   * start), and so does the stamp. `newId` makes a stamp for an account that has none.
   */
  static stored(token: LogonToken, existing: { displayName?: unknown; accountId?: unknown } | undefined, newId: () => string): LogonAccount {
    const phoneKey = LogonAccounts.phoneKey(token.phone_number);
    const account: LogonAccount = {
      uid: token.uid,
      email: token.email ?? null,
      emailLower: token.email?.toLowerCase() ?? null,
      emailVerified: LogonAccounts.verifiedEmail(token) !== null,
      verifiedPhone: token.phone_number ?? null,
      displayName: LogonAccounts.firstText(existing?.displayName, token.name),
      photoURL: token.picture ?? null,
      provider: token.firebase?.sign_in_provider ?? null,
      accountId: LogonAccounts.text(existing?.accountId, 128) ?? newId(),
    };
    if (phoneKey) account.phoneKey = phoneKey;
    if (token.phone_number) account.phone = token.phone_number;
    return account;
  }

  /**
   * What says which login an account is, for the list of the logins of a user: the kind, the name, the e-mail address, the phone number with only its last four digits, and the picture (only an https
   * address: nothing else is put in a page as a picture). An account that is not known (its document is gone) says nothing.
   */
  static shown(account: { provider?: string | null; email?: string | null; verifiedPhone?: string | null; displayName?: string | null; photoURL?: string | null } | null | undefined): Omit<UserLogon, 'ref' | 'you'> {
    const digits = (account?.verifiedPhone ?? '').replace(/\D/g, '');
    return {
      provider: account?.provider ?? null,
      name: LogonAccounts.text(account?.displayName),
      email: LogonAccounts.text(account?.email),
      phone: digits.length >= 4 ? `***${digits.slice(-4)}` : null,
      photoURL: typeof account?.photoURL === 'string' && account.photoURL.startsWith('https://') ? account.photoURL : null,
    };
  }

  /** What the page gets: no stamp and no key, only what is about the person. */
  static publicOf(account: LogonAccount): LogonUser {
    return {
      uid: account.uid,
      email: account.email,
      emailVerified: account.emailVerified,
      phone: account.verifiedPhone,
      name: account.displayName,
      photoURL: account.photoURL,
      provider: account.provider,
    };
  }
}
