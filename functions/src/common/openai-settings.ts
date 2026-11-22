// The settings of the AI classification, read from the environment. They are in the top-level `/.env` and are copied to the functions by `scripts/sync-env.mjs`: the model, how closely
// a picture is looked at, the organization and the project in `functions/.env`, and the key in `functions/.secret.local` (a deployed function gets the key as a Firebase secret).

export interface OpenAiSettings {
  apiKey: string;
  /** the model that looks at the picture: no default, it has to be said */
  model: string;
  /** how closely the picture is looked at */
  detail: "low" | "high" | "auto";
  orgId?: string;
  projectId?: string;
}

/** The settings, or what is missing (it says where to put it). */
export function openAiSettings(env: Record<string, string | undefined> = process.env): OpenAiSettings | { error: string } {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim();
  const missing = [apiKey ? "" : "OPENAI_API_KEY", model ? "" : "OPENAI_MODEL"].filter(Boolean);
  if (missing.length) return { error: `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set: put ${missing.length === 1 ? "it" : "them"} in the top-level .env and run npm run sync:env.` };
  const detail = env.OPENAI_IMAGE_DETAIL?.trim() || "low";
  if (detail !== "low" && detail !== "high" && detail !== "auto") return { error: "OPENAI_IMAGE_DETAIL must be low, high or auto." };
  return { apiKey: apiKey as string, model: model as string, detail, ...(env.OPENAI_ORG_ID?.trim() ? { orgId: env.OPENAI_ORG_ID.trim() } : {}), ...(env.OPENAI_PROJECT_ID?.trim() ? { projectId: env.OPENAI_PROJECT_ID.trim() } : {}) };
}
