import { createHmac, timingSafeEqual } from "node:crypto";
import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { JigsawSpec, JigsawVisibilities } from "../models";
import { isPictureId } from "./jigsaw-image";
import { SecretSource } from "./view-key";
import { apiRouter, askerOf, bad } from "../common/http";

// **A link to one picture that opens it for whoever gets it**: the owner of a private picture sends it, and the person who has it may see that picture and play it, and nothing else. The link carries a key, worked out
// from the id of the picture and a number (how many times the owner has made a new link) with a secret only the server has: **the key itself is never kept**, only the number. Making a new link raises the number,
// which stops every link sent before (a round that somebody has already started stays theirs). The page sends the key with what it asks about that picture (the header `X-Jigsaw-Share`), never in the address of a call.
// It opens nothing of a package (those are got or bought) and nothing hidden.

/** The header a call carries the key of a link in. */
export const SHARE_HEADER = "X-Jigsaw-Share";

/** Where the number of each picture's link is kept (`jigsaw-shares/<id>`: `{version}`). */
export interface ShareStore {
  version(jigsawId: string): Promise<number>;
  renew(jigsawId: string): Promise<void>;
}

export function firestoreShareStore(): ShareStore {
  const ref = (jigsawId: string) => getFirestore().collection("jigsaw-shares").doc(jigsawId);
  return {
    async version(jigsawId) {
      const kept = (await ref(jigsawId).get()).data()?.version;
      return typeof kept === "number" ? kept : 0;
    },
    async renew(jigsawId) {
      await getFirestore().runTransaction(async (tx) => {
        const kept = (await tx.get(ref(jigsawId))).data()?.version;
        tx.set(ref(jigsawId), { version: (typeof kept === "number" ? kept : 0) + 1 });
      });
    },
  };
}

/** The keys of the links: made for a picture, checked, and replaced. */
export class ShareKeys {
  constructor(
    private readonly secret: SecretSource,
    private readonly store: ShareStore,
  ) {}

  async keyFor(jigsawId: string): Promise<string> {
    // (its own text in front: never the same as a key that reads pictures, `view-key.ts`, though the secret is the same)
    return createHmac("sha256", await this.secret()).update(`share.${jigsawId}.${await this.store.version(jigsawId)}`).digest("base64url").slice(0, 32);
  }

  /** Stops the links sent before, and gives the key of the new one. */
  async renew(jigsawId: string): Promise<string> {
    await this.store.renew(jigsawId);
    return this.keyFor(jigsawId);
  }

  /** Whether a link with this key opens this picture now: the right key, and a picture a link can open (not hidden, not of a package). */
  async opens(jigsaw: { id: string; visibility?: string; packageId?: string }, key: unknown): Promise<boolean> {
    if (typeof key !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(key) || !ShareKeys.shareable(jigsaw)) return false;
    return timingSafeEqual(Buffer.from(await this.keyFor(jigsaw.id)), Buffer.from(key));
  }

  /** A link can be made for a picture that is private or public: not a hidden one, and not one of a package. */
  static shareable(jigsaw: { visibility?: string; packageId?: string }): boolean {
    return !jigsaw.packageId && (!JigsawVisibilities.restricted(jigsaw.visibility) || jigsaw.visibility === "owner");
  }
}

/** `/jigsaw/:id/share`: GET gives the key of the picture's link, POST makes a new one (the old stops working). Its owner only (the header `X-Jigsaw-User`); for anyone else the picture's link is not there. */
export function shareLinkRouter(keys: ShareKeys, jigsawById: (id: string) => Promise<JigsawSpec | null>): express.Router {
  const router = apiRouter({ mergeParams: true });
  const answer = (make: (jigsawId: string) => Promise<string>): express.RequestHandler => async (req, res) => {
    try {
      const id = String((req.params as { id?: string }).id);
      const me = askerOf(req);
      const jigsaw = isPictureId(id) ? await jigsawById(id) : null;
      if (!jigsaw || !me || jigsaw.ownerUid !== me) return bad(res, "No such jigsaw.", 404);
      if (!ShareKeys.shareable(jigsaw)) return bad(res, "A hidden picture and a picture of a package have no link to send.", 409);
      res.json({ key: await make(id) });
    } catch (err) {
      console.error("Could not make a link to a picture", err);
      bad(res, "Try again.", 503);
    }
  };
  router.get("/", answer((id) => keys.keyFor(id)));
  router.post("/", answer((id) => keys.renew(id)));
  return router;
}
