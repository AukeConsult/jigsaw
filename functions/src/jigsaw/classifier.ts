import { AiUsage, Classification, Classifications } from "../models";
import { AiFailed, askOpenAi, settingsNow } from "../common/openai-chat";
import { OpenAiSettings } from "../common/openai-settings";

// Looking at a picture and saying what it shows. `Classifier` is the port: the OpenAI one is the real thing, a fake is what the tests use (no test calls OpenAI).

/** A picture to look at. */
export interface PictureToClassify {
  data: Buffer;
  mime: string;
}

/** What the classifier gives: the classification, and what the call used (when the service says it). */
export type Classified = Classification & { usage?: AiUsage };

export interface Classifier {
  /** What the picture shows: its categories, a name and a description, the texts written in the language. Throws `AiUnavailable` when it cannot be asked, an error when the answer fails (`AiFailed` says what was used). */
  classify(picture: PictureToClassify, language: string): Promise<Classified>;
}

/** The classifier that asks OpenAI (the vision API). `fetchFn` is the one thing a test replaces. */
export function openAiClassifier(settings: OpenAiSettings, fetchFn: typeof fetch = fetch): Classifier {
  return {
    async classify(picture, language) {
      const messages = [
        { role: "system", content: Classifications.prompt(language) },
        {
          role: "user",
          content: [
            { type: "text", text: "Classify this picture." },
            { type: "image_url", image_url: { url: `data:${picture.mime};base64,${picture.data.toString("base64")}`, detail: settings.detail } },
          ],
        },
      ];
      const { json, usage } = await askOpenAi(settings, { messages, schema: { name: "jigsaw_classification", schema: Classifications.schema() }, task: "classify the picture", usage: { imageDetail: settings.detail } }, fetchFn);
      const read = Classifications.read(json);
      if ("error" in read) throw new AiFailed(read.error, usage);
      return { ...read, ...(usage ? { usage } : {}) };
    },
  };
}

/** The classifier that reads its settings when it is asked. */
export function configuredClassifier(env: Record<string, string | undefined> = process.env, fetchFn: typeof fetch = fetch): Classifier {
  return { classify: async (picture, language) => openAiClassifier(settingsNow(env), fetchFn).classify(picture, language) };
}
