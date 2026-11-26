// What an account that is NOT verified is limited to. Verified means it has a verified login. An account that is not verified plays the pictures that are publicly available like anybody; it cannot
// add packages (get or buy them), and it has at most a few uploaded pictures at a time. What it already has stays: only new ones are stopped. An admin is not stopped (the API asks that first).

/** how many uploaded pictures an account that is not verified can have (pictures and ready jigsaws; deleting one makes room) */
export const UNVERIFIED_PICTURES_MAX = 5;

/** The part of an account that says whether it is verified: the verified logins on the server (`firebaseUids`), `protected` as the page gets it. */
export interface Verifiable {
  firebaseUids?: unknown;
  protected?: boolean;
}

export class AccountLimits {
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
