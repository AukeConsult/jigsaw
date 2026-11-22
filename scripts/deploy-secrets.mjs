#!/usr/bin/env node
/**
 * Puts the OpenAI key of the top-level `/.env` in the Firebase secret `JIGSAW_OPENAI_API_KEY` of the project, so the deployed function has it (`npm run deploy` and
 * `npm run deploy:functions` run it first, after `sync-env`). The key goes to `firebase` on its standard input, never on the command line, and is never printed. It only
 * adds a new version of that one secret (the name is the jigsaw's own, the project is shared with Seven Friends); it deploys nothing.
 *
 *   --check   say whether the key is there, change nothing
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv, SECRET_NAME } from "./sync-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".env");
const env = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
const key = env.OPENAI_API_KEY;
if (!key) {
  console.error("deploy-secrets: OPENAI_API_KEY is missing in /.env: the deployed function could not classify. Fill it in and run the deploy again.");
  process.exit(1);
}
if (process.argv.includes("--check")) {
  console.log("deploy-secrets: the key is in /.env");
  process.exit(0);
}
const project = env.FIREBASE_PROJECT_ID || "sevenfriends";
const run = spawnSync("firebase", ["functions:secrets:set", SECRET_NAME, "--data-file", "-", "--force", "--project", project], { input: key, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32" });
if (run.status !== 0) {
  console.error(`deploy-secrets: the secret ${SECRET_NAME} could not be set in ${project}.`);
  process.exit(run.status ?? 1);
}
console.log(`deploy-secrets: ${SECRET_NAME} is set in ${project}`);
