// Which account is playing is kept in this browser (its id; the account itself is in the database). The service of the account keeps it, and the header every call carries is read from here too.

const STORED_KEY = 'jigsaw.userId';
/** An earlier version kept the user name, which was then the id too. */
const LEGACY_KEY = 'jigsaw.username';

/** The id of the account that plays on this device, or null: none, or no storage. */
export function storedUserId(): string | null {
  try {
    return localStorage.getItem(STORED_KEY) ?? localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

/** Keeps which account plays (null: nobody). */
export function rememberUserId(id: string | null): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
    if (id) localStorage.setItem(STORED_KEY, id);
    else localStorage.removeItem(STORED_KEY);
  } catch {
    /* no storage: the account is asked for again the next time */
  }
}
