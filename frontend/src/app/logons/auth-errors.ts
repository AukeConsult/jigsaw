import { tr } from '../core/i18n';

/** The Firebase login error codes that have a text for the person (`logons.errors.<code>`, in every language). */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase, or (for phone) texts to this country are not allowed there: Authentication → Settings → SMS region policy.',
  'auth/requires-recent-login': 'Please sign in again, then try once more.',
  'auth/invalid-action-code': 'This link is not valid any more. Ask for a new one.',
  'auth/expired-action-code': 'This link has expired. Ask for a new one.',
  'auth/unauthorized-continue-uri': 'This web address is not allowed to send sign-in links (add it under Authorized domains in Firebase).',
};

const code = (err: unknown): string => (err as { code?: string } | null)?.code ?? '';

/** The message for an error, or the fallback when the code is not known. */
export const authMessage = (err: unknown, fallback: string): string => {
  const known = code(err);
  const text = MESSAGES[known];
  return text ? tr(`logons.errors.${known.replace('auth/', '')}`, text) : fallback;
};

/** The person closed the pop-up: not an error to show. */
export const wasCancelled = (err: unknown): boolean => ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code(err));

/** The email or the password did not fit: for somebody new, that usually means "there is no account yet". */
export const wasRejected = (err: unknown): boolean => ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code(err));
