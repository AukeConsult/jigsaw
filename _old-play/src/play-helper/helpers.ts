import { Helper } from '../core/helper';
import { CheckingHelper } from './checking-helper';
import { LogonHelper } from './logon-helper';
import { UserHelper } from './user-helper';

/**
 * Every helper the app has, in the order they are tried: the first that fits the circumstances is the one active helper, the one that floats over the page (there is always exactly one: while the app is finding out, nobody plays, or an account plays; there is no other case, so there is no fall-back). To help in a situation, make a class that
 * extends `Helper` and put it in this list above the last one.
 */
export const HELPERS: readonly Helper[] = [new CheckingHelper(), new LogonHelper(), new UserHelper()];
