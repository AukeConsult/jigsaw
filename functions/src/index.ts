import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { createJigsawApp } from "./jigsaw/app";

initializeApp();

/**
 * The OpenAI key of the AI classification, a Firebase secret (never in a file that is deployed). Its name starts with JIGSAW_ because the project is shared with Seven Friends: a plain
 * name could be theirs. `npm run deploy` sets it from the top-level /.env first (`scripts/deploy-secrets.mjs`); the emulator reads it from `functions/.secret.local`.
 */
const openAiKey = defineSecret("JIGSAW_OPENAI_API_KEY");

/** The API of the app is one Cloud Function: Hosting sends `/jigsaw/api/**` to it. */
export const jigsawApi = onRequest(
  { region: "europe-west1", invoker: "public", secrets: [openAiKey], memory: "256MiB", timeoutSeconds: 60, maxInstances: 10, concurrency: 80, cpu: 1 },
  createJigsawApp(),
);
