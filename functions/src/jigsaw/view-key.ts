import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";

// The key that lets the page read the pictures of a jigsaw that is private or hidden. A picture is read with `<img src>`, which cannot send who asks, so the people who may see such a jigsaw
// are given a key in the answer that tells them about it, and the page puts it on the address (`?k=`). The key is worked out from the id of the jigsaw and the time, with a secret only the
// server has, and it is never kept anywhere: not in a jigsaw, not in a round, not in the browser's storage. What decides who gets it is read again at every answer (`ImageAccess`).

/** A key is made for a stretch of this many milliseconds (6 hours) and works for that one and the next, so it works for 6 to 12 hours. */
export const VIEW_KEY_BUCKET_MS = 6 * 60 * 60 * 1000;

/** Where the secret comes from: it is made once and kept (Firestore in the app, a plain text in the tests). */
export type SecretSource = () => Promise<string>;

/** The secret: a random text in the document `jigsaw-config/view-key`, made the first time it is needed and read once for each instance of the function. Delete the document to change every key. */
export function firestoreSecret(): SecretSource {
  let known: Promise<string> | null = null;
  return () => {
    known ??= (async () => {
      const ref = getFirestore().collection("jigsaw-config").doc("view-key");
      return getFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const kept = snap.data()?.secret;
        if (typeof kept === "string" && kept.length >= 32) return kept;
        const made = randomBytes(32).toString("base64url");
        tx.set(ref, { secret: made, createdAt: Date.now() });
        return made;
      });
    })();
    known.catch(() => (known = null)); // a read that failed is tried again
    return known;
  };
}

/** The keys: made for a jigsaw, and checked. */
export class ViewKeys {
  constructor(
    private readonly secret: SecretSource,
    private readonly now: () => number = Date.now,
  ) {}

  private async mac(jigsawId: string, bucket: number): Promise<string> {
    return createHmac("sha256", await this.secret()).update(`${jigsawId}.${bucket}`).digest("base64url").slice(0, 22);
  }

  /** The key for a jigsaw now: `<bucket>.<mac>`. The same for everybody who is given it, for the whole of the bucket, so the address of a picture stays the same and the browser can keep the picture. */
  async keyFor(jigsawId: string): Promise<string> {
    const bucket = Math.floor(this.now() / VIEW_KEY_BUCKET_MS);
    return `${bucket}.${await this.mac(jigsawId, bucket)}`;
  }

  /** Whether this is a good key for this jigsaw: made for it, for this stretch of time or the one before. */
  async accepts(jigsawId: string, key: unknown): Promise<boolean> {
    if (typeof key !== "string") return false;
    const match = /^(\d{1,10})\.([A-Za-z0-9_-]{22})$/.exec(key);
    if (!match) return false;
    const bucket = Number(match[1]);
    const current = Math.floor(this.now() / VIEW_KEY_BUCKET_MS);
    if (bucket !== current && bucket !== current - 1) return false;
    const wanted = Buffer.from(await this.mac(jigsawId, bucket));
    const given = Buffer.from(match[2]);
    return wanted.length === given.length && timingSafeEqual(wanted, given);
  }
}
