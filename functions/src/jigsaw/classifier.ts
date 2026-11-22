import { AiUsage, Classification, Classifications, TokenUsages } from "../models";
import { OpenAiSettings, openAiSettings } from "../common/openai-settings";

// Looking at a picture and saying what it shows. `Classifier` is the port: the OpenAI one is the real thing, a fake is what the tests use (no test calls OpenAI).

/** A picture to look at. */
export interface PictureToClassify {
  data: Buffer;
  mime: string;
}

/** What the classifier gives: the classification, and what the call used (when the service says it). */
export type Classified = Classification & { usage?: AiUsage };

export interface Classifier {
  /** What the picture shows: its categories, a name and a description, the texts written in the language. Throws `ClassifierUnavailable` when it cannot be asked, an error when the answer fails (`ClassifierFailed` says what was used). */
  classify(picture: PictureToClassify, language: string): Promise<Classified>;
}

/** The service was asked and answered, but there was nothing to use in the answer: the tokens are spent all the same, so `usage` says how many. */
export class ClassifierFailed extends Error {
  constructor(message: string, readonly usage?: AiUsage) {
    super(message);
  }
}

/** The classifier cannot be used at all (the settings are not there): the route says so as it is, not as a failure of the picture. */
export class ClassifierUnavailable extends Error {}

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
/** How long OpenAI is waited for, in milliseconds. */
const TIMEOUT_MS = 60_000;

/** The classifier that asks OpenAI (the vision API, with the answer in strict JSON). `fetchFn` is the one thing a test replaces. */
export function openAiClassifier(settings: OpenAiSettings, fetchFn: typeof fetch = fetch): Classifier {
  return {
    async classify(picture, language) {
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
            { role: "system", content: Classifications.prompt(language) },
            {
              role: "user",
              content: [
                { type: "text", text: "Classify this picture." },
                { type: "image_url", image_url: { url: `data:${picture.mime};base64,${picture.data.toString("base64")}`, detail: settings.detail } },
              ],
            },
          ],
          response_format: { type: "json_schema", json_schema: { name: "jigsaw_classification", strict: true, schema: Classifications.schema() } },
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string }; choices?: { message?: { content?: string; refusal?: string } }[] } | null;
      const usage = TokenUsages.fromOpenAi(body, { model: settings.model, imageDetail: settings.detail });
      if (!response.ok) throw new Error(`OpenAI answered ${response.status}${body?.error?.message ? `: ${body.error.message}` : ""}`); // the key is never in what is said
      const message = body?.choices?.[0]?.message;
      if (message?.refusal) throw new ClassifierFailed(`OpenAI would not classify the picture: ${message.refusal}`, usage);
      let json: unknown;
      try {
        json = JSON.parse(message?.content ?? "");
      } catch {
        throw new ClassifierFailed("OpenAI did not answer with JSON.", usage);
      }
      const read = Classifications.read(json);
      if ("error" in read) throw new ClassifierFailed(read.error, usage);
      return { ...read, ...(usage ? { usage } : {}) };
    },
  };
}

/** The classifier that reads its settings when it is asked (so the functions start without them, and a missing setting is said where it matters). */
export function configuredClassifier(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Classifier {
  return {
    async classify(picture, language) {
      const settings = openAiSettings(env);
      if ("error" in settings) throw new ClassifierUnavailable(settings.error);
      return openAiClassifier(settings, fetchFn).classify(picture, language);
    },
  };
}
