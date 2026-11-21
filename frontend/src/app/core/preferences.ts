/**
 * What the person prefers is kept on this device for good: it is there when the page is opened again, also another day and in another tab (`localStorage`; what is only
 * for the session only is in `session-storage.ts`). Storage can be missing or refuse (a private window, blocked site data): then the choice is only kept while the page is open.
 */

export { isBoolean } from './session-storage';

/** The value kept under this key, or `fallback` when there is none, it is not what it should be (`valid`), or the storage cannot be read. */
export function readPreference<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Keeps the value under this key on this device. */
export function writePreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* the storage cannot be written: the choice is kept while the page is open */
  }
}
