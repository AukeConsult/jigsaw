/**
 * What the person chose is kept for the session: it stays when the page is reloaded or left and come back to, in the same browser tab, and is gone when the tab
 * is closed (`sessionStorage`). Storage can be missing or refuse (a private window, blocked site data): then the choice is only kept while the page is open.
 */

/** Whether a value read back is a boolean (what `readSession` is asked for a switch). */
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/** The value kept under this key, or `fallback` when there is none, it is not what it should be (`valid`), or the storage cannot be read. */
export function readSession<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Keeps the value under this key for the session. */
export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the storage cannot be written: the choice is kept while the page is open */
  }
}
