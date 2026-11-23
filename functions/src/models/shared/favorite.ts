// A favorite: a jigsaw a user has ticked with a heart. It is kept in the collection `jigsaw-favorites`, one document for each user and jigsaw, so ticking it twice is the same as ticking it
// once, and taking it away is deleting the document. A user's favorites are asked for by the user (one equality, so no composite index).

/** The Firestore collection that holds the favorites. */
export const JIGSAW_FAVORITES = 'jigsaw-favorites';

/** A favorite as it is kept. */
export interface JigsawFavorite {
  userId: string;
  jigsawId: string;
  /** milliseconds since 1970 */
  createdAt: number;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;

export class JigsawFavorites {
  /** The id of the document: the user and the jigsaw, with a `~` between (not a character an id has, so two pairs never make the same id). */
  static idOf(userId: string, jigsawId: string): string {
    return `${userId}~${jigsawId}`;
  }

  /** The reason this user and jigsaw are not allowed, or ''. */
  static error(userId: unknown, jigsawId: unknown): string {
    if (typeof userId !== 'string' || !ID.test(userId)) return 'Say who you are: a favorite belongs to an account.';
    if (typeof jigsawId !== 'string' || !ID.test(jigsawId)) return 'Not a jigsaw id.';
    return '';
  }

  /** The favorite as it is kept: only the known fields. */
  static stored(userId: string, jigsawId: string, createdAt: number): JigsawFavorite {
    return { userId, jigsawId, createdAt };
  }
}
