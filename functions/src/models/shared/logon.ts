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

/** The answer of `POST /jigsaw/api/session`. */
export interface LogonSession {
  ok: true;
  accountId: string;
  /** true when this login made the account (it did not exist in either app) */
  created: boolean;
  user: LogonUser;
}

export class LogonAccounts {
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
