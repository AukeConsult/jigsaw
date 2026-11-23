#!/usr/bin/env node
/**
 * Keeps the LIVE indexes and rules of the shared Firebase project in step with this app, directly (no repo is touched).
 *
 * Both apps use the same Firestore and Storage. What the jigsaw needs is written HERE (the ONE place to edit it):
 *   firestore.indexes.json, firestore.rules, storage.rules
 * and this script READS what is live in Firebase, MERGES what the jigsaw needs into it, and (with --apply) DEPLOYS the result.
 * It only adds: a live index, field override or rule that is not this app's is kept as it is.
 *   indexes  : the missing indexes and field overrides are added (read with `firebase firestore:indexes`, deployed with
 *              `firebase deploy --only firestore:indexes`, which needs the firebase CLI to be logged in)
 *   rules    : every `match` of this app's rules except the catch-all deny goes in a marked `BEGIN jigsaw` block just before the
 *              live catch-all deny (read and released with the Admin SDK: GOOGLE_APPLICATION_CREDENTIALS or --key <service account file>)
 *
 * Usage (npm run sync:firestore -- <option>):
 *   (no option)   read the live state and show what would change; change nothing
 *   --check       the same, and exit 1 when the live project lacks something this app needs
 *   --apply       deploy the merged indexes and rules to the live project
 *   --key <file>  a service account key file for the rules (instead of GOOGLE_APPLICATION_CREDENTIALS)
 *   --project <id>  the Firebase project (default: sevenfriends)
 *
 * Seven Friends uses the same project: its own rules and indexes stay as they are, and a later deploy from the Seven Friends repo
 * would replace the jigsaw's block unless its files hold the same (run this script again after such a deploy).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const apply = args.includes("--apply");
const check = args.includes("--check");
const project = option("--project", "sevenfriends");
const key = option("--key", process.env.GOOGLE_APPLICATION_CREDENTIALS);
const bucket = `${project}.firebasestorage.app`;

const BEGIN = "// BEGIN jigsaw (merged by jigsaw/scripts/sync-firestore.mjs: edit it there, not here)";
const END = "// END jigsaw";

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- indexes ----------

const indexKey = (i) => `${i.collectionGroup}|${i.queryScope}|${(i.fields ?? []).map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`).join(",")}`;
const overrideKey = (o) => `${o.collectionGroup}|${o.fieldPath}`;

/** The live indexes plus what this app lacks. A field override that exists on both sides gets the missing entries added. */
function mergeIndexes(own, live) {
  const merged = structuredClone(live);
  merged.indexes ??= [];
  merged.fieldOverrides ??= [];
  const known = new Set(merged.indexes.map(indexKey));
  for (const index of own.indexes ?? []) if (!known.has(indexKey(index))) merged.indexes.push(index);
  for (const override of own.fieldOverrides ?? []) {
    const have = merged.fieldOverrides.find((o) => overrideKey(o) === overrideKey(override));
    if (!have) merged.fieldOverrides.push(override);
    else for (const entry of override.indexes ?? []) if (!have.indexes.some((e) => same(e, entry))) have.indexes.push(entry);
  }
  return merged;
}

const firebase = (cliArgs, cwd) => execFileSync("firebase", cliArgs, { cwd, encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "inherit"] });

/** What is live: `firebase firestore:indexes` prints the same JSON the file holds. */
function liveIndexes() {
  const text = firebase(["firestore:indexes", "--project", project]);
  return JSON.parse(text.slice(text.indexOf("{")));
}

/** Deploy the indexes from a temporary folder, so no file of any repo is read or written. */
function deployIndexes(indexes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jigsaw-indexes-"));
  try {
    fs.writeFileSync(path.join(dir, "firestore.indexes.json"), JSON.stringify(indexes, null, 2));
    fs.writeFileSync(path.join(dir, "firebase.json"), JSON.stringify({ firestore: { indexes: "firestore.indexes.json" } }));
    firebase(["deploy", "--only", "firestore:indexes", "--project", project], dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------- rules ----------

/** Where the body of the first block that starts with `opener` (a regex ending in its opening brace) begins and ends. */
function blockOf(text, opener) {
  const m = text.match(opener);
  if (!m) throw new Error(`no block matching ${opener}`);
  const from = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return { from: from + 1, to: i };
  }
  throw new Error(`block ${opener} is not closed`);
}

/** The top-level statements of a block body (each with the comment lines above it); a statement ends at its closing brace or at a `;`. */
function statements(body) {
  const found = [];
  const code = body.replace(/\{[\w=*]+\}/g, (m) => "_".repeat(m.length)); // path wildcards such as {uid} or {document=**} are not blocks
  let depth = 0;
  let begin = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        found.push(body.slice(begin, i + 1));
        begin = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      found.push(body.slice(begin, i + 1));
      begin = i + 1;
    }
  }
  return found.map((s) => s.replace(/^\s*\n/, "").replace(/\s+$/, "")).filter((s) => s.trim());
}

/** What this app's rules file adds: everything inside the main block except its catch-all deny. */
function ownRules(text, opener, catchAll) {
  const { from, to } = blockOf(text, opener);
  return statements(text.slice(from, to)).filter((s) => !catchAll.test(s));
}

/** The live rules with the jigsaw block (re)written just before their catch-all deny; no block when there is nothing to add. */
function mergeRules(own, live, catchAll) {
  const lines = live.split("\n");
  const begin = lines.findIndex((l) => l.trim() === BEGIN);
  if (begin >= 0) {
    const end = lines.findIndex((l, i) => i > begin && l.trim() === END);
    if (end < 0) throw new Error("the jigsaw block has no END line");
    lines.splice(begin, end - begin + 1);
    if (lines[begin]?.trim() === "") lines.splice(begin, 1); // the blank line that followed the block
  }
  if (own.length === 0) return lines.join("\n");
  const at = lines.findIndex((l) => catchAll.test(l));
  if (at < 0) throw new Error("the live rules have no catch-all deny to insert before");
  let insertAt = at;
  while (insertAt > 0 && lines[insertAt - 1].trim().startsWith("//")) insertAt--; // keep its own comment with it
  lines.splice(insertAt, 0, `    ${BEGIN}`, ...own.map((s) => `    ${s.trimStart()}`), `    ${END}`, "");
  return lines.join("\n");
}

/** The Admin SDK's rules service (the same firebase-admin the functions use). */
async function securityRules() {
  if (!key) throw new Error("the rules need a service account: set GOOGLE_APPLICATION_CREDENTIALS or pass --key <file>");
  const require = createRequire(path.join(root, "functions", "package.json"));
  const { initializeApp, cert } = require("firebase-admin/app");
  const { getSecurityRules } = require("firebase-admin/security-rules");
  const app = initializeApp({ credential: cert(JSON.parse(fs.readFileSync(key, "utf8"))), projectId: project, storageBucket: bucket });
  return getSecurityRules(app);
}

const firestoreOpener = /match\s+\/databases\/\{database\}\/documents\s*\{/;
const firestoreCatchAll = /match\s+\/\{document=\*\*\}/;
const storageOpener = /match\s+\/b\/\{bucket\}\/o\s*\{/;
const storageCatchAll = /match\s+\/\{allPaths=\*\*\}/;

// ---------- run ----------

const rules = await securityRules();
const liveFirestore = (await rules.getFirestoreRuleset()).source[0].content;
const liveStorage = (await rules.getStorageRuleset(bucket)).source[0].content;
const indexesLive = liveIndexes();

const indexesMerged = mergeIndexes(JSON.parse(read("firestore.indexes.json")), indexesLive);
const firestoreMerged = mergeRules(ownRules(read("firestore.rules"), firestoreOpener, firestoreCatchAll), liveFirestore, firestoreCatchAll);
const storageMerged = mergeRules(ownRules(read("storage.rules"), storageOpener, storageCatchAll), liveStorage, storageCatchAll);

const steps = [
  { name: "indexes", changed: !same(indexesMerged, indexesLive), deploy: () => deployIndexes(indexesMerged) },
  { name: "firestore rules", changed: firestoreMerged !== liveFirestore, deploy: () => rules.releaseFirestoreRulesetFromSource(firestoreMerged) },
  { name: "storage rules", changed: storageMerged !== liveStorage, deploy: () => rules.releaseStorageRulesetFromSource(storageMerged, bucket) },
];

console.log(`live project: ${project}`);
for (const s of steps) console.log(`${s.changed ? (apply ? "deploying" : "differs  ") : "in step  "} ${s.name}`);
const stale = steps.filter((s) => s.changed);
if (apply) {
  for (const s of stale) await s.deploy();
  if (stale.length) console.log("\nDeployed to the live project.");
} else if (stale.length) {
  console.log("\nRun with --apply to deploy them to the live project.");
  if (check) process.exit(1);
}
