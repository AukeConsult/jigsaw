import { AiUsage, FeedWords, JigsawLanguages, FEED_LABEL_MAX, FEED_TEXT_MAX, FEED_TITLE_MAX } from "../models";
import { AiFailed, askOpenAi, settingsNow } from "../common/openai-chat";
import { OpenAiSettings } from "../common/openai-settings";

// Translating short words: of a tile of the home page, and the name and description of a picture (`jigsaw-translate.ts`). `Translator` is the port, as `Classifier` is for pictures: the OpenAI one is the real thing, a fake is what the tests use (no test calls OpenAI).

/** The most letters of each field, in the original and in what is made. */
export interface WordLimits {
  title: number;
  text: number;
  label: number;
}

/** the limits of the words of a tile of the home page */
const TILE_LIMITS: WordLimits = { title: FEED_TITLE_MAX, text: FEED_TEXT_MAX, label: FEED_LABEL_MAX };

export interface Translator {
  /**
   * The words in the languages asked for, made from the words of the master language. Throws `AiUnavailable` when it cannot be asked, `AiFailed` when the answer cannot be used (with what
   * the call used, which was spent all the same).
   */
  translate(words: FeedWords, from: string, to: readonly string[], limits?: WordLimits): Promise<{ made: Record<string, FeedWords>; usage?: AiUsage }>;
}

/** What the AI is told: the words to translate, the languages, and that a mark or a number stays as it is. */
function prompt(from: string, to: readonly string[], limits: WordLimits): string {
  const name = (code: string) => `${JigsawLanguages.nameOf(code)} (${code})`;
  return [
    `You translate short texts of an app for jigsaw puzzles from ${name(from)} into these languages: ${to.map(name).join(", ")}.`,
    "Keep the meaning and the friendly tone, and keep it short. Keep numbers, percentages, prices, names and web addresses as they are.",
    `Give each field again in each language: "title" (at most ${limits.title} letters), "text" (at most ${limits.text} letters) and "label" (a short mark such as "-20 %", at most ${limits.label} letters).`,
    "A field that is empty in the original stays empty.",
  ].join(" ");
}

function schema(to: readonly string[]): Record<string, unknown> {
  const field = { type: "string" };
  return {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: { type: "object", properties: { language: { type: "string", enum: [...to] }, title: field, text: field, label: field }, required: ["language", "title", "text", "label"], additionalProperties: false },
      },
    },
    required: ["translations"],
    additionalProperties: false,
  };
}

/** What the answer says, as the words of each language asked for; an error when a language is missing or has no title. */
export function readTranslations(json: unknown, words: FeedWords, to: readonly string[], limits: WordLimits = TILE_LIMITS): { made: Record<string, FeedWords> } | { error: string } {
  const list = (json as { translations?: unknown })?.translations;
  if (!Array.isArray(list)) return { error: "OpenAI did not give the translations." };
  const made: Record<string, FeedWords> = {};
  for (const item of list as Record<string, unknown>[]) {
    const language = item?.["language"];
    if (typeof language !== "string" || !to.includes(language)) continue;
    const cut = (v: unknown, max: number, wanted: boolean) => (wanted && typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const title = cut(item["title"], limits.title, true);
    if (!title) return { error: `OpenAI gave no title in ${language}.` };
    made[language] = { title, ...(cut(item["text"], limits.text, !!words.text) ? { text: cut(item["text"], limits.text, true) } : {}), ...(cut(item["label"], limits.label, !!words.label) ? { label: cut(item["label"], limits.label, true) } : {}) };
  }
  const lacking = to.filter((l) => !made[l]);
  return lacking.length ? { error: `OpenAI gave nothing in ${lacking.join(", ")}.` } : { made };
}

/** The translator that asks OpenAI (text only). `fetchFn` is the one thing a test replaces. */
export function openAiTranslator(settings: OpenAiSettings, fetchFn: typeof fetch = fetch): Translator {
  return {
    async translate(words, from, to, limits = TILE_LIMITS) {
      const messages = [
        { role: "system", content: prompt(from, to, limits) },
        { role: "user", content: JSON.stringify({ title: words.title, text: words.text ?? "", label: words.label ?? "" }) },
      ];
      const { json, usage } = await askOpenAi(settings, { messages, schema: { name: "feed_translations", schema: schema(to) }, task: "translate" }, fetchFn);
      const read = readTranslations(json, words, to, limits);
      if ("error" in read) throw new AiFailed(read.error, usage);
      return { made: read.made, ...(usage ? { usage } : {}) };
    },
  };
}

/** The translator that reads its settings when it is asked. */
export function configuredTranslator(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Translator {
  return { translate: async (words, from, to, limits) => openAiTranslator(settingsNow(env), fetchFn).translate(words, from, to, limits) };
}
