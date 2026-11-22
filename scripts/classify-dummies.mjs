// Tries the AI classification on the dummy jigsaws (the ones by "Test Tester", made by `npm run seed:dummy`): `npm run classify:dummies` shows what the AI would say for 3 of them and
// changes nothing. `npm run classify:dummies:apply` classifies EVERY dummy and PUTS the answer on the jigsaws (the categories, the name and the description).
// Options go after `--` (`npm run classify:dummies -- --all --apply`), or use the scripts that have them: `classify:dummies:all` (look at every one) and `classify:dummies:apply`.
// npm takes a flag that has no `--` before it for itself and changes it (`--apply` and a number after `--count` do not arrive): so the script says so and stops, it does not quietly do
// something else.
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const mangled = ["all", "apply", "count"].filter((name) => process.env[`npm_config_${name}`] !== undefined);
if (mangled.length) {
  console.error(`npm took ${mangled.map((n) => `--${n}`).join(" and ")} for itself, so it did not arrive: put -- before the options, or use the scripts that have them:
  npm run classify:dummies -- --all --apply
  npm run classify:dummies:all     (look at every one)
  npm run classify:dummies:apply   (classify every one and save)`);
  process.exit(2);
}
const BASE = String(option("api", "http://localhost:4210/jigsaw/api"));
const APPLY = flag("apply");
const COUNT = flag("all") ? Infinity : Number(option("count", 3));
const OWNER = "Test Tester";

if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(BASE + "/")) throw new Error(`Only a local API is used for the dummy jigsaws, not ${BASE}.`);

const { JigsawLanguages } = createRequire(import.meta.url)("../functions/lib/models/shared");

const dummies = (await (await fetch(`${BASE}/jigsaw`)).json()).filter((j) => j.author === OWNER && j.ownerUid && !j.visibility);
const chosen = dummies.slice(0, COUNT);
console.log(`${dummies.length} dummy jigsaws; ${APPLY ? "classifying and APPLYING" : "classifying, changing nothing (add --apply to save)"} ${chosen.length}.`);

let failed = 0;
for (const j of chosen) {
  const res = await fetch(`${BASE}/jigsaw/${j.id}/classify${APPLY ? "?apply=true" : ""}`, { method: "POST", headers: { "X-Jigsaw-User": j.ownerUid } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    failed++;
    console.log(`\n${j.name}\n  ${res.status}: ${body.error ?? "no answer"}`);
    if (res.status === 503) break; // the settings are not there: the others would say the same
    continue;
  }
  console.log(`\n${j.name}  [${JigsawLanguages.nameOf(JigsawLanguages.of(j))}]`);
  console.log(`  categories:  ${body.categories.join(", ") || "(none)"}`);
  console.log(`  name:        ${body.name || "(none)"}`);
  console.log(`  description: ${body.description || "(none)"}${body.applied ? "\n  -> saved on the jigsaw" : ""}`);
}
console.log(`\n${chosen.length - failed} of ${chosen.length} classified${APPLY ? " and saved" : ""}.${failed ? ` ${failed} failed.` : ""}`);
if (!APPLY && chosen.length) console.log(`NOTHING WAS CHANGED: this was only to look. To classify ALL ${dummies.length} dummies and save the answers, run:  npm run classify:dummies:apply`);
process.exit(failed ? 1 : 0);
