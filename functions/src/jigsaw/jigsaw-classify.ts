import express from "express";
import { AiUsage, JigsawInput, JigsawLanguages, JigsawSettings, JigsawSpec, TokenUsages } from "../models";
import { AiFailed, AiUnavailable } from "../common/openai-chat";
import { Classifier } from "./classifier";
import { Picture } from "./jigsaw-image";
import { apiRouter, askerOf, bad } from "../common/http";

/** What the route needs from the app. */
export interface ClassifyDeps {
  classifier: Classifier;
  jigsawById(id: string): Promise<JigsawSpec | null>;
  /** the stored picture of the jigsaw, null when it has none */
  pictureOf(id: string): Promise<Picture | null>;
  /** replaces the settings of the jigsaw (the store's update) */
  update(id: string, input: JigsawInput): Promise<JigsawSpec | null>;
  /** keeps what a call used for the user who pays for it (the token use, to be paid for later); a failure here never fails the classification */
  keepUsage?(userId: string, usage: ReturnType<typeof TokenUsages.record>): Promise<unknown>;
  now?: () => number;
}

/**
 * The classification of one jigsaw by its picture, `POST /jigsaw/:id/classify` (mounted at `/jigsaw/:id/classify`): the AI says the categories, the motive difficulty and the name the picture
 * suggests (in the base language of the picture; never a description), and the answer is given back. With `?apply=true` they are also put on the jigsaw: the categories (when it said some), the motive difficulty and the name;
 * nothing else of the jigsaw changes. Only its owner may (a jigsaw from before owners is anybody's; the header `X-Jigsaw-User` is the UID of who asks).
 */
export function jigsawClassifyRouter(deps: ClassifyDeps): express.Router {
  const router = apiRouter({ mergeParams: true });

  router.post("/", async (req, res) => {
    const id = (req.params as { id: string }).id;
    const jigsaw = await deps.jigsawById(id);
    if (!jigsaw) return bad(res, "No such jigsaw.", 404);
    if (jigsaw.ownerUid && askerOf(req) !== jigsaw.ownerUid) return bad(res, "Only the owner of a jigsaw can classify it.", 403);
    const language = JigsawLanguages.of(jigsaw); // the name is written in the base language of the picture
    const picture = await deps.pictureOf(id);
    if (!picture) return bad(res, "This jigsaw has no picture to look at.", 409);

    // the user who pays is the one who asks (the owner; a jigsaw from before owners has the header's user, or nobody)
    const payer = askerOf(req) || jigsaw.ownerUid;
    const keep = async (usage: AiUsage | undefined, status: "ok" | "failed", applied: boolean) => {
      if (!usage || !payer || !deps.keepUsage) return;
      await deps.keepUsage(payer, TokenUsages.record(usage, { userId: payer, kind: "classify", jigsawId: id, status, applied, now: (deps.now ?? Date.now)() })).catch(() => undefined);
    };

    let found;
    try {
      found = await deps.classifier.classify({ data: picture.data, mime: picture.mime }, language);
    } catch (err) {
      if (err instanceof AiUnavailable) return bad(res, err.message, 503);
      if (err instanceof AiFailed) await keep(err.usage, "failed", false);
      return bad(res, `The classification failed: ${err instanceof Error ? err.message : "unknown error"}`, 502);
    }

    const { usage, ...answer } = found; // what it used is kept for the user, not given to the page
    const apply = req.query.apply === "true";
    if (!apply) {
      await keep(usage, "ok", false);
      return void res.json({ ...answer, applied: false });
    }
    const settings = new JigsawSettings({
      ...jigsaw,
      ...(answer.categories.length ? { categories: answer.categories } : {}),
      ...(answer.motive ? { motive: answer.motive } : {}),
      ...(answer.name ? { name: answer.name } : {}),
    });
    const error = settings.error();
    if (error) {
      await keep(usage, "ok", false);
      return bad(res, `The classification could not be applied: ${error}`, 500);
    }
    await deps.update(id, settings.stored());
    await keep(usage, "ok", true);
    res.json({ ...answer, applied: true });
  });

  return router;
}
