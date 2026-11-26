import { RequestHandler } from "express";
import { JigsawVisibilities } from "../models";
import { isPictureId } from "./jigsaw-image";
import { ViewKeys } from "./view-key";
import { TtlCache } from "../common/ttl-cache";
import { bad } from "../common/http";

// Who may read the pictures of a jigsaw. A jigsaw that everybody sees has pictures that everybody can read, as before. A jigsaw that is private or hidden has pictures that are read only with
// its key (`view-key.ts`); without a good key the answer is 404, the same as for a picture that is not there. The key is given, in the answers that tell about the jigsaw, to those whom the
// rules of the jigsaw let see it (`canSee`), so a person who owns a private jigsaw, with a login or without, reads its pictures just as before.

/** How long what is known about who sees a jigsaw is kept (milliseconds): a picture is asked for many times, and the key in the address makes most of those questions needless. */
const KEEP_MS = 30_000;
const KEEP_MAX = 2000;

export class ImageAccess {
  private readonly kept: TtlCache<string | undefined>;

  constructor(
    readonly keys: ViewKeys,
    /** the visibility of the jigsaw with this id (nothing when it says nothing or there is no such jigsaw) */
    private readonly visibilityOf: (id: string) => Promise<string | undefined>,
    now: () => number = Date.now,
  ) {
    this.kept = new TtlCache(KEEP_MS, KEEP_MAX, now);
  }

  /** What is known about who sees the jigsaws is not used again: a jigsaw was made, changed or deleted. */
  forget(): void {
    this.kept.forget();
  }

  /**
   * The jigsaw as an answer for somebody who may see it: with the key of its pictures when it is private or hidden, as it was when it is not. The caller has already asked who may see it.
   * The key is for this answer only: nothing here or anywhere keeps it.
   */
  keyed = async <T extends { id: string; visibility?: string; imageKey?: string }>(jigsaw: T): Promise<T> => (JigsawVisibilities.restricted(jigsaw.visibility) ? { ...jigsaw, imageKey: await this.keys.keyFor(jigsaw.id) } : jigsaw);

  /** In front of the routes that give a picture or the graphic of a piece (`:id` is the jigsaw): a good key, or a jigsaw that everybody sees, lets the request through; any other gets 404. */
  guard: RequestHandler = async (req, res, next) => {
    const id = req.params.id;
    if (!isPictureId(id)) return next(); // the route says what is wrong with it
    try {
      if (await this.keys.accepts(id, req.query.k)) return next(); // a good key needs no question about the jigsaw
      if (!JigsawVisibilities.restricted(await this.kept.get(id, () => this.visibilityOf(id)))) return next();
      bad(res, "No picture.", 404);
    } catch (err) {
      console.error("Could not tell who may read a picture", err); // not answered: never let a picture through because it could not be asked
      bad(res, "Try again.", 503);
    }
  };
}
