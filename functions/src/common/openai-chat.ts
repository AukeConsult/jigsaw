import { AiUsage, TokenUsages } from "../models";
import { OpenAiSettings, openAiSettings } from "./openai-settings";

// One question to OpenAI, answered in strict JSON: what the classification of a picture and the translation of a tile share.

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
/** How long OpenAI is waited for, in milliseconds. */
const TIMEOUT_MS = 60_000;

/** The service was asked and answered, but there was nothing to use in the answer: the tokens are spent all the same, so `usage` says how many. */
export class AiFailed extends Error {
  constructor(message: string, readonly usage?: AiUsage) {
    super(message);
  }
}

/** The AI cannot be used at all (the settings are not there): the route says so as it is, not as a failure of what was asked about. */
export class AiUnavailable extends Error {}

/** The settings as they are when the AI is asked (so the functions start without them, and a missing setting is said where it matters). */
export function settingsNow(env: Record<string, string | undefined> = process.env): OpenAiSettings {
  const settings = openAiSettings(env);
  if ("error" in settings) throw new AiUnavailable(settings.error);
  return settings;
}

export interface AiQuestion {
  /** the messages of the chat, the system's first */
  messages: readonly object[];
  /** the name and the JSON schema of the answer */
  schema: { name: string; schema: Record<string, unknown> };
  /** what was asked of it, for the message when it refuses ("translate") */
  task: string;
  /** what the record of the use says besides the model */
  usage?: { imageDetail?: OpenAiSettings["detail"] };
}

/** Asks, and gives the JSON of the answer with what the call used. Throws `AiFailed` when the answer cannot be used, an error when the service says no. `fetchFn` is the one thing a test replaces. */
export async function askOpenAi(settings: OpenAiSettings, question: AiQuestion, fetchFn: typeof fetch = fetch): Promise<{ json: unknown; usage?: AiUsage }> {
  const response = await fetchFn(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
      ...(settings.orgId ? { "OpenAI-Organization": settings.orgId } : {}),
      ...(settings.projectId ? { "OpenAI-Project": settings.projectId } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ model: settings.model, messages: question.messages, response_format: { type: "json_schema", json_schema: { name: question.schema.name, strict: true, schema: question.schema.schema } } }),
  });
  const body = (await response.json().catch(() => null)) as { error?: { message?: string }; choices?: { message?: { content?: string; refusal?: string } }[] } | null;
  const usage = TokenUsages.fromOpenAi(body, { model: settings.model, ...question.usage });
  if (!response.ok) throw new Error(`OpenAI answered ${response.status}${body?.error?.message ? `: ${body.error.message}` : ""}`); // the key is never in what is said
  const message = body?.choices?.[0]?.message;
  if (message?.refusal) throw new AiFailed(`OpenAI would not ${question.task}: ${message.refusal}`, usage);
  try {
    return { json: JSON.parse(message?.content ?? ""), usage };
  } catch {
    throw new AiFailed("OpenAI did not answer with JSON.", usage);
  }
}
