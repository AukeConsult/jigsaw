// A package a person has got (a free one) or bought. It is kept under the user, in the subcollection `bought-packages`, one document for each package (its id), so getting a package twice is getting it once.
// What it gives: the pictures of the package are in the person's search, and the person may open and play them (`BoughtPackages.mayUse`). **Looking at one the package page shows is open to anybody; a round of such a picture is started only for a player
// who has it, owns the picture or owns the package** (an admin who is none of these may look at the picture, but starts no round of it). **No money is taken yet** (payment is not built): a priced
// package that is bought is kept with the price it had and `paid: false`, to be paid for later.

/** The subcollection of a user (`jigsaw-users/<id>/bought-packages`). */
export const JIGSAW_BOUGHT = 'bought-packages';

export interface BoughtPackage {
  packageId: string;
  /** milliseconds since 1970 */
  boughtAt: number;
  /** what it cost when it was got, in cents (0: it was free) */
  price: number;
  currency?: string;
  /** nothing is owed: it was free, or it has been paid for (false for a priced one until payment is built) */
  paid: boolean;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export class BoughtPackages {
  /** The record of a package that is got now: its price as it is now. */
  static of(pack: { id: string; price: number; currency: string }, now: number): BoughtPackage {
    return { packageId: pack.id, boughtAt: now, price: pack.price, ...(pack.price > 0 ? { currency: pack.currency } : {}), paid: pack.price === 0 };
  }

  /** The record as it is kept and read: only the known fields. A document that names no package is nothing. */
  static stored(raw: Record<string, unknown>): BoughtPackage | null {
    const packageId = raw['packageId'];
    if (typeof packageId !== 'string' || !ID.test(packageId)) return null;
    const price = typeof raw['price'] === 'number' && raw['price'] > 0 ? Math.trunc(raw['price']) : 0;
    return {
      packageId,
      boughtAt: typeof raw['boughtAt'] === 'number' ? raw['boughtAt'] : 0,
      price,
      ...(price > 0 && typeof raw['currency'] === 'string' ? { currency: raw['currency'] } : {}),
      paid: price === 0 || raw['paid'] === true,
    };
  }

  /**
   * Whether this account (nobody: no account) may have this picture as far as packages go: a picture that is in no package is anybody's business of its visibility; a picture of a package is its owner's,
   * the owner's of the package (`packageOwner`, to try it out), and the account's that has got the package.
   */
  static mayUse(picture: { packageId?: string; ownerUid?: string }, me: string | undefined, bought: ReadonlySet<string>, packageOwner?: string): boolean {
    return !picture.packageId || (!!me && (picture.ownerUid === me || packageOwner === me || bought.has(picture.packageId)));
  }
}
