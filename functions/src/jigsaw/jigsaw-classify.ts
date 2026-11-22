import express from "express";
import { AiUsage, JigsawInput, JigsawLanguages, JigsawSettings, JigsawSpec, TokenUsages } from "../models";
import { Classifier, ClassifierFailed, ClassifierUnavailable } from "./classifier";
import { Picture } from "./jigsaw-image";

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
 * The classification of one jigsaw by its picture, `POST /jigsaw/:id/classify` (mounted at `/jigsaw/:id/classify`): the AI says the categories, the name and the description the picture
 * suggests (the texts in the language of the jigsaw), and the answer is given back. With `?apply=true` they are also put on the jigsaw: the categories (when it said some), the name
 * and the description (when it said one); nothing else of the jigsaw changes. `?language=sv` asks for the texts in that language instead of the language of the jigsaw (and with `apply` the jigsaw gets that language). Only its owner may (a jigsaw from before owners is anybody's; the header `X-Jigsaw-User` is the UID of who asks).
 */
export function jigsawClassifyRouter(deps: ClassifyDeps): express.Router {
  const router = express.Router({ mergeParams: true });
  const bad = (res: express.Response, error: string, status: number) => void res.status(status).json({ error });

  router.post("/", async (req, res) => {
    const id = (req.params as { id: string }).id;
    const jigsaw = await deps.jigsawById(id);
    if (!jigsaw) return bad(res, "No such jigsaw.", 404);
    if (jigsaw.ownerUid && req.get("X-Jigsaw-User") !== jigsaw.ownerUid) return bad(res, "Only the owner of a jigsaw can classify it.", 403);
    const asked = req.query.language;
    if (asked !== undefined && !JigsawLanguages.is(asked)) return bad(res, "That is not a language the jigsaws are written in.", 400);
    const language = asked ?? JigsawLanguages.of(jigsaw); // the language that is asked for, else the one of the jigsaw
    const picture = await deps.pictureOf(id);
    if (!picture) return bad(res, "This jigsaw has no picture to look at.", 409);

    // the user who pays is the one who asks (the owner; a jigsaw from before owners has the header's user, or nobody)
    const payer = req.get("X-Jigsaw-User") || jigsaw.ownerUid;
    const keep = async (usage: AiUsage | undefined, status: "ok" | "failed", applied: boolean) => {
      if (!usage || !payer || !deps.keepUsage) return;
      await deps.keepUsage(payer, TokenUsages.record(usage, { userId: payer, kind: "classify", jigsawId: id, status, applied, now: (deps.now ?? Date.now)() })).catch(() => undefined);
    };

    let found;
    try {
      found = await deps.classifier.classify({ data: picture.data, mime: picture.mime }, language);
    } catch (err) {
      if (err instanceof ClassifierUnavailable) return bad(res, err.message, 503);
      if (err instanceof ClassifierFailed) await keep(err.usage, "failed", false);
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
      ...(asked ? { language } : {}),
      ...(answer.categories.length ? { categories: answer.categories } : {}),
      ...(answer.name ? { name: answer.name } : {}),
      ...(answer.description ? { description: answer.description } : {}),
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
