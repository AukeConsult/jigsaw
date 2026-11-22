#!/usr/bin/env node
/**
 * Copies the settings of the functions from the top-level `/.env` (not committed) to the functions folder, and splits them in two, because Firebase treats a secret differently:
 *
 *   /.env  ->  functions/.env           the settings that are not secret (the model, how closely a picture is looked at, the organization and project):
 *                                       the emulator reads it, and a deploy takes it with the function
 *              functions/.secret.local  the key, only for the emulator: it is never deployed (a deployed function gets its key from a Firebase secret)
 *
 * It runs before every build of the functions (an npm pre-hook), and by hand with:
 *   npm run sync:env
 *
 * Options:
 *   --check        change nothing, say what is missing, exit 1 when something is
 *   --soft         when the settings are missing, say so and go on (a build does not need the AI): exit 0
 *   --from <file>  read another file than /.env (used by the tests)
 *   --to <dir>     write to another folder than functions/ (used by the tests)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What goes to `functions/.env` (not secret), and what goes to `functions/.secret.local` (secret). */
export const PUBLIC_KEYS = ["OPENAI_MODEL", "OPENAI_IMAGE_DETAIL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID"];
export const SECRET_KEYS = ["OPENAI_API_KEY"];
/** The name the key has as a Firebase secret of the deployed function (the emulator reads a declared secret by this name from `.secret.local`). */
export const SECRET_NAME = "JIGSAW_OPENAI_API_KEY";
/** What has to be there for the classification to work. */
export const REQUIRED_KEYS = ["OPENAI_API_KEY", "OPENAI_MODEL"];

/** The settings of the text of a `.env` file: `NAME=value` lines (a line that starts with # is a comment; a value may be in quotes). */
export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
    env[match[1]] = value;
  }
  return env;
}

/** What is missing of what is required (a name with no value is missing too). */
export function missingOf(env) {
  return REQUIRED_KEYS.filter((key) => !env[key]);
}

/** The text of a `.env` file for these names (the ones that have a value, in the order given). */
export function envText(env, keys, header) {
  const lines = keys.filter((key) => env[key]).map((key) => `${key}=${env[key]}`);
  return `${header}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}

function main(args) {
  const option = (name) => (args.includes(name) ? path.resolve(args[args.indexOf(name) + 1] ?? "") : undefined);
  const from = option("--from") ?? path.join(root, ".env");
  const to = option("--to") ?? path.join(root, "functions");
  const checkOnly = args.includes("--check");
  const soft = args.includes("--soft");

  if (!fs.existsSync(from)) {
    console.log(`sync-env: ${path.relative(root, from) || from} is missing: copy .env.example to .env and fill in the OpenAI settings (the AI classification needs them).`);
    return checkOnly || !soft ? 1 : 0;
  }
  const env = parseEnv(fs.readFileSync(from, "utf8"));
  const missing = missingOf(env);
  if (missing.length) console.log(`sync-env: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing in ${path.basename(from)}: the AI classification will not work until ${missing.length === 1 ? "it is" : "they are"} filled in.`);
  if (checkOnly) return missing.length ? 1 : 0;

  fs.writeFileSync(path.join(to, ".env"), envText(env, PUBLIC_KEYS, "# Copied from /.env by scripts/sync-env.mjs: not secret, not committed. Edit /.env, not this file."));
  fs.writeFileSync(path.join(to, ".secret.local"), envText({ ...env, [SECRET_NAME]: env.OPENAI_API_KEY }, [...SECRET_KEYS, SECRET_NAME], "# Copied from /.env by scripts/sync-env.mjs: the emulator reads it, it is never deployed, never committed. Edit /.env, not this file."));
  console.log(`sync-env: ${path.relative(root, from)} -> ${path.relative(root, to)}/.env (${PUBLIC_KEYS.filter((k) => env[k]).length} settings) and .secret.local (${SECRET_KEYS.filter((k) => env[k]).length} secret)`);
  return missing.length && !soft ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exit(main(process.argv.slice(2)));
