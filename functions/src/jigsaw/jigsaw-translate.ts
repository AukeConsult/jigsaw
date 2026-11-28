import express from "express";
import { AiUsage, FEED_LABEL_MAX, JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME, JigsawLanguages, JigsawSpec, JigsawTexts, TokenUsages, Translations } from "../models";
import { AiFailed, AiUnavailable } from "../common/openai-chat";
import { apiRouter, askerOf, bad } from "../common/http";
import { Translator } from "./translator";

// Translating the name and the description of a picture. The page only names the picture: the words are read here, from what is saved, so nobody can have a text of their own translated, and all AI is the
// service's (rule 15 of CLAUDE.md).

/** how long the words of a picture are (the translator is the one of the tiles, whose limits differ) */
const LIMITS = { title: JIGSAW_MAX_NAME, text: JIGSAW_MAX_DESCRIPTION, label: FEED_LABEL_MAX };
/** how long words that could not be translated are left alone, so that a page that is shown again and again does not ask the AI again and again */
const REST_MS = 10 * 60_000;

/** What the route needs from the app. */
export interface TranslateDeps {
  translator: Translator;
  jigsawById(id: string): Promise<JigsawSpec | null>;
  /** whether this call may look at the picture */
  maySee(jigsaw: JigsawSpec, req: express.Request): Promise<boolean>;
  /** puts the translations on the picture, and nothing else of it */
  keep(id: string, translations: Translations): Promise<unknown>;
  /** keeps what a call used for the user who pays for it; a failure here never fails the translation */
  keepUsage?(userId: string, usage: ReturnType<typeof TokenUsages.record>): Promise<unknown>;
  now?: () => number;
}

/**
 * `POST /jigsaw/:id/translate` (mounted at `/jigsaw/:id/translate`): **the words of the picture in every language it lacks**, made from the words as written and kept with the picture; the answer is all its
 * translations. The page asks as it saves a picture and when it shows one that lacks the reader's language. Anybody who may look at the picture may ask, and the AI is asked only for what is missing, so once
 * for the words as they are; **its owner pays** (who asks, for a picture with no owner).
 */
export function jigsawTranslateRouter(deps: TranslateDeps): express.Router {
  const router = apiRouter({ mergeParams: true });
  const now = deps.now ?? Date.now;
  /** the translations being made now, by picture and words, so that several readers at once ask the AI once */
  const running = new Map<string, Promise<Translations>>();
  const resting = new Map<string, number>();

  const translate = async (jigsaw: JigsawSpec, to: readonly string[], payer: string | undefined): Promise<Translations> => {
    const spent = async (usage: AiUsage | undefined, status: "ok" | "failed", applied: boolean) => {
      if (!usage || !payer || !deps.keepUsage) return;
      await deps.keepUsage(payer, TokenUsages.record(usage, { userId: payer, kind: "translate", jigsawId: jigsaw.id, status, applied, now: now() })).catch(() => undefined);
    };
    let answer;
    try {
      answer = await deps.translator.translate({ title: jigsaw.name, text: jigsaw.description }, JigsawLanguages.of(jigsaw), to, LIMITS);
    } catch (err) {
      if (err instanceof AiFailed) await spent(err.usage, "failed", false);
      throw err;
    }
    // the words may have been changed while the AI worked: what was made of the old ones is not kept
    const after = await deps.jigsawById(jigsaw.id);
    const holds = !!after && JigsawTexts.same(after, jigsaw);
    const made = JigsawTexts.stored(Object.fromEntries(Object.entries(answer.made).map(([language, words]) => [language, { name: words.title, description: words.text }])));
    const translations = holds ? { ...after.translations, ...made } : (after?.translations ?? {});
    if (holds) await deps.keep(jigsaw.id, translations);
    await spent(answer.usage, "ok", holds);
    return translations;
  };

  router.post("/", async (req, res) => {
    const id = (req.params as { id: string }).id;
    const jigsaw = await deps.jigsawById(id);
    if (!jigsaw || !(await deps.maySee(jigsaw, req))) return bad(res, "No such jigsaw.", 404);
    const to = JigsawTexts.lacking(jigsaw);
    if (!to.length) return void res.json({ translations: jigsaw.translations ?? {} });

    const words = JSON.stringify([id, jigsaw.name, jigsaw.description ?? ""]);
    if ((resting.get(words) ?? 0) > now()) return bad(res, "It could not be translated. Try again later.", 503);
    let job = running.get(words);
    if (!job) {
      job = translate(jigsaw, to, jigsaw.ownerUid ?? askerOf(req)).finally(() => running.delete(words));
      running.set(words, job);
    }
    try {
      res.json({ translations: await job });
    } catch (err) {
      resting.set(words, now() + REST_MS);
      if (err instanceof AiUnavailable) return bad(res, err.message, 503);
      bad(res, "The translation failed.", 502);
    }
  });

  return router;
}
