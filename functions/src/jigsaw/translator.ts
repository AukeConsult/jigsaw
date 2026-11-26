import { AiUsage, FeedWords, JigsawLanguages, TokenUsages, FEED_LABEL_MAX, FEED_TEXT_MAX, FEED_TITLE_MAX } from "../models";
import { OpenAiSettings, openAiSettings } from "../common/openai-settings";

// Translating the words of a tile of the home page. `Translator` is the port, as `Classifier` is for pictures: the OpenAI one is the real thing, a fake is what the tests use (no test calls OpenAI).

export interface Translator {
  /**
   * The words in the languages asked for, made from the words of the master language. Throws `TranslatorUnavailable` when it cannot be asked, `TranslatorFailed` when the answer cannot be used (with what
   * the call used, which was spent all the same).
   */
  translate(words: FeedWords, from: string, to: readonly string[]): Promise<{ made: Record<string, FeedWords>; usage?: AiUsage }>;
}

/** The service was asked and answered, but there was nothing to use in the answer: the tokens are spent all the same, so `usage` says how many. */
export class TranslatorFailed extends Error {
  constructor(message: string, readonly usage?: AiUsage) {
    super(message);
  }
}

/** The translator cannot be used at all (the settings are not there): the route says so as it is, and the tile is saved without the translations. */
export class TranslatorUnavailable extends Error {}

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 60_000;

/** What the AI is told: the words to translate, the languages, and that a mark or a number stays as it is. */
function prompt(from: string, to: readonly string[]): string {
  const name = (code: string) => `${JigsawLanguages.nameOf(code)} (${code})`;
  return [
    `You translate short texts of an app for jigsaw puzzles from ${name(from)} into these languages: ${to.map(name).join(", ")}.`,
    "Keep the meaning and the friendly tone, and keep it short. Keep numbers, percentages, prices, names and web addresses as they are.",
    `Give each field again in each language: "title" (at most ${FEED_TITLE_MAX} letters), "text" (at most ${FEED_TEXT_MAX} letters) and "label" (a short mark such as "-20 %", at most ${FEED_LABEL_MAX} letters).`,
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
export function readTranslations(json: unknown, words: FeedWords, to: readonly string[]): { made: Record<string, FeedWords> } | { error: string } {
  const list = (json as { translations?: unknown })?.translations;
  if (!Array.isArray(list)) return { error: "OpenAI did not give the translations." };
  const made: Record<string, FeedWords> = {};
  for (const item of list as Record<string, unknown>[]) {
    const language = item?.["language"];
    if (typeof language !== "string" || !to.includes(language)) continue;
    const cut = (v: unknown, max: number, wanted: boolean) => (wanted && typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
    const title = cut(item["title"], FEED_TITLE_MAX, true);
    if (!title) return { error: `OpenAI gave no title in ${language}.` };
    made[language] = { title, ...(cut(item["text"], FEED_TEXT_MAX, !!words.text) ? { text: cut(item["text"], FEED_TEXT_MAX, true) } : {}), ...(cut(item["label"], FEED_LABEL_MAX, !!words.label) ? { label: cut(item["label"], FEED_LABEL_MAX, true) } : {}) };
  }
  const lacking = to.filter((l) => !made[l]);
  return lacking.length ? { error: `OpenAI gave nothing in ${lacking.join(", ")}.` } : { made };
}

/** The translator that asks OpenAI (text only, the answer in strict JSON). `fetchFn` is the one thing a test replaces. */
export function openAiTranslator(settings: OpenAiSettings, fetchFn: typeof fetch = fetch): Translator {
  return {
    async translate(words, from, to) {
      const response = await fetchFn(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
          ...(settings.orgId ? { "OpenAI-Organization": settings.orgId } : {}),
          ...(settings.projectId ? { "OpenAI-Project": settings.projectId } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: "system", content: prompt(from, to) },
            { role: "user", content: JSON.stringify({ title: words.title, text: words.text ?? "", label: words.label ?? "" }) },
          ],
          response_format: { type: "json_schema", json_schema: { name: "feed_translations", strict: true, schema: schema(to) } },
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string }; choices?: { message?: { content?: string; refusal?: string } }[] } | null;
      const usage = TokenUsages.fromOpenAi(body, { model: settings.model });
      if (!response.ok) throw new Error(`OpenAI answered ${response.status}${body?.error?.message ? `: ${body.error.message}` : ""}`); // the key is never in what is said
      const message = body?.choices?.[0]?.message;
      if (message?.refusal) throw new TranslatorFailed(`OpenAI would not translate: ${message.refusal}`, usage);
      let json: unknown;
      try {
        json = JSON.parse(message?.content ?? "");
      } catch {
        throw new TranslatorFailed("OpenAI did not answer with JSON.", usage);
      }
      const read = readTranslations(json, words, to);
      if ("error" in read) throw new TranslatorFailed(read.error, usage);
      return { made: read.made, ...(usage ? { usage } : {}) };
    },
  };
}

/** The translator that reads its settings when it is asked (so the functions start without them, and a missing setting is said where it matters). */
export function configuredTranslator(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Translator {
  return {
    async translate(words, from, to) {
      const settings = openAiSettings(env);
      if ("error" in settings) throw new TranslatorUnavailable(settings.error);
      return openAiTranslator(settings, fetchFn).translate(words, from, to);
    },
  };
}
