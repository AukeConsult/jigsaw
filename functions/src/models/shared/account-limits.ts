// What an account is limited to. A **user** (verified, but no publisher) has at most a number of pictures that are not public: private and hidden together, since it can make no other kind. First, an account that is NOT verified: Verified means it has a verified login. An account that is not verified plays the pictures that are publicly available like anybody; it cannot
// add packages (get or buy them), and it has at most a few uploaded pictures at a time. What it already has stays: only new ones are stopped. An admin is not stopped (the API asks that first).

import { JigsawVisibilities } from './jigsaw-settings';
import { UserLevel, UserLevels } from './user-level';

/** how many uploaded pictures an account that is not verified can have (pictures and ready jigsaws; deleting one makes room) */
export const UNVERIFIED_PICTURES_MAX = 5;

/** how many pictures that are not public (private or hidden) a verified account that is not a publisher can have; deleting one makes room */
export const PRIVATE_PICTURES_MAX = 20;
/** the most pictures of one owner that are in the category Recommended at a time */
export const RECOMMENDED_PICTURES_MAX = 5;
/** what the server says when there is no room (the page says it in the person's language) */
export const RECOMMENDED_FULL = `You can have ${RECOMMENDED_PICTURES_MAX} recommended pictures: take the mark off one first.`;

/** The part of an account that says whether it is verified: the verified logins on the server (`firebaseUids`), `protected` as the page gets it. */
export interface Verifiable {
  firebaseUids?: unknown;
  protected?: boolean;
}

export class AccountLimits {
  /** Why one more picture of an owner who has `has` recommended ones may not be recommended, or ''. It is for everybody, publishers and admins too. */
  static recommendedError(has: number): string {
    return has < RECOMMENDED_PICTURES_MAX ? '' : RECOMMENDED_FULL;
  }

  /** The reason a verified account of this level may not have one more picture that is not public when it has `has` of them, or ''. A publisher and an admin have no limit. */
  static privateError(level: UserLevel, visibility: string | undefined, has: number): string {
    if (UserLevels.mayPublish(level) || !JigsawVisibilities.restricted(visibility) || has < PRIVATE_PICTURES_MAX) return '';
    return `You can have ${PRIVATE_PICTURES_MAX} pictures that are not public: delete one to add another.`;
  }

  /** The account has a verified login. */
  static verified(account: Verifiable | null | undefined): boolean {
    return !!account && (account.protected === true || (Array.isArray(account.firebaseUids) && account.firebaseUids.length > 0));
  }

  /** The reason this account may not add a package, or ''. */
  static packageError(account: Verifiable | null | undefined): string {
    return AccountLimits.verified(account) ? '' : 'Only a verified account can add packages: verify the account with a login first.';
  }

  /** The reason this account may not have one more uploaded picture when it has `has` of them, or ''. */
  static pictureError(account: Verifiable | null | undefined, has: number): string {
    return AccountLimits.verified(account) || has < UNVERIFIED_PICTURES_MAX ? '' : `An account that is not verified can have ${UNVERIFIED_PICTURES_MAX} uploaded pictures: verify the account with a login, or delete one.`;
  }
}
