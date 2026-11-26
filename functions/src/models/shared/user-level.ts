// The level of a user: what the account may do beyond playing. `user` plays and makes private or hidden jigsaws; a `publisher` can also make a jigsaw public; an `admin` can do all that, change
// and delete any jigsaw and round, see the private and hidden jigsaws of others, and set the level of every account. The level is kept on the jigsaw user (`JigsawUserSpec.level`, nothing
// stored means `user`) and is set only by an admin (`PUT /jigsaw-levels/:id`), never by a body that makes or changes a user.

/** The levels, the lowest first (a level has all the rights of the ones before it). */
export const USER_LEVELS = ['user', 'publisher', 'admin'] as const;
export type UserLevel = (typeof USER_LEVELS)[number];

/** What an account is when nothing says otherwise. */
export const DEFAULT_LEVEL: UserLevel = 'user';

/** The part of a user that tells its level: what is stored, and whether it needs a login (`firebaseUids` on the server, `protected` as the page gets it). */
export interface Levelled {
  level?: unknown;
  firebaseUids?: unknown;
  protected?: boolean;
}

export class UserLevels {
  static is(value: unknown): value is UserLevel {
    return typeof value === 'string' && (USER_LEVELS as readonly string[]).includes(value);
  }

  /** The reason a level is not allowed, or ''. */
  static error(value: unknown): string {
    return UserLevels.is(value) ? '' : `The level must be one of: ${USER_LEVELS.join(', ')}.`;
  }

  /** The level a user is kept at: `user` when nothing (or something unknown) is stored. */
  static stored(user: Levelled | null | undefined): UserLevel {
    return UserLevels.is(user?.level) ? user.level : DEFAULT_LEVEL;
  }

  /**
   * The level a user really has. A user with no verified login is open to anybody who knows its id (the header `X-Jigsaw-User` is not a lock for it), so its level counts only for one that needs a
   * login: nobody can become an admin by sending the id of one.
   */
  static of(user: Levelled | null | undefined): UserLevel {
    const needsLogon = !!user && (user.protected === true || (Array.isArray(user.firebaseUids) && user.firebaseUids.length > 0));
    return needsLogon ? UserLevels.stored(user) : DEFAULT_LEVEL;
  }

  /** Whether a level has at least the rights of `least`. */
  static atLeast(level: UserLevel, least: UserLevel): boolean {
    return USER_LEVELS.indexOf(level) >= USER_LEVELS.indexOf(least);
  }

  /** May make a jigsaw public. */
  static mayPublish(level: UserLevel): boolean {
    return UserLevels.atLeast(level, 'publisher');
  }

  /** May change and delete what is not their own, see what others keep to themselves and set levels. */
  static isAdmin(level: UserLevel): boolean {
    return level === 'admin';
  }

  /**
   * The reason a jigsaw may not get the visibility asked for, or '': public (`everyone`, which is also what none says) is for publishers; private and hidden are for anybody. A jigsaw that is
   * public already (`was`) may stay public, so its owner can still change its name; `was` is null for a new one.
   */
  static publishError(level: UserLevel, visibility: unknown, was: { visibility?: string } | null): string {
    const isPublic = (v: unknown) => v === undefined || v === null || v === 'everyone';
    if (!isPublic(visibility) || UserLevels.mayPublish(level) || (was && isPublic(was.visibility))) return '';
    return 'Only a publisher can make a jigsaw public: make it private or hidden.';
  }

  /** The reason an account may not be given `level`, or '': an account with no verified login can only be a `user` (what it is for anybody who knows its id). */
  static setError(user: Levelled | null | undefined, level: UserLevel): string {
    const needsLogon = !!user && (user.protected === true || (Array.isArray(user.firebaseUids) && user.firebaseUids.length > 0));
    return level === DEFAULT_LEVEL || needsLogon ? '' : 'An account without a verified login can only be a user: sign in and protect it first.';
  }

  /** Whether there is an admin among these accounts (one that counts: `of`). While there is none, anybody may set levels, so the first admin can be made. */
  static hasAdmin(users: readonly Levelled[]): boolean {
    return users.some((u) => UserLevels.isAdmin(UserLevels.of(u)));
  }

  /** How many admins there are among these accounts besides the one with this id. */
  static otherAdmins(users: readonly (Levelled & { id: string })[], id: string): number {
    return users.filter((u) => u.id !== id && UserLevels.isAdmin(UserLevels.of(u))).length;
  }

  /** The reason an admin may not give `to` to an account that has `from`: the last admin cannot step down (nobody could set levels then). `otherAdmins` is how many other admins there are. */
  static changeError(from: UserLevel, to: UserLevel, otherAdmins: number): string {
    return from === 'admin' && to !== 'admin' && otherAdmins === 0 ? 'This is the last admin: make another account an admin first.' : '';
  }
}
