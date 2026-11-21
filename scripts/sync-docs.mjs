#!/usr/bin/env node
/**
 * Copies the user guide of Canvas into the frontend, so the app can show it (the User guide page reads it as a file):
 *
 *   docs/guide/user-guide.md     (the whole guide, canvas included: the menu of the canvas module)
 *        ->  frontend/public/docs/   (generated copy, not committed)
 *
 * It is the ONE place to edit. This runs by itself before every frontend start / build (npm pre-hooks), and by hand with: npm run sync:docs
 * The guide of Karins jigsaw is not copied: it is a file for each language, written where it is shown: frontend/public/i18n/<language>/jigsaw-guide.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guides = ["user-guide.md"];
const targetDir = path.join(root, "frontend", "public", "docs");

let copied = 0;
for (const name of guides) {
  const source = path.join(root, "docs", "guide", name);
  if (!fs.existsSync(source)) {
    console.error(`sync-docs: source not found: ${source}`);
    process.exit(1);
  }
  const text = fs.readFileSync(source, "utf8");
  const target = path.join(targetDir, name);
  // only write what changed (so a running dev server is not restarted for nothing)
  if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== text) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(target, text);
    copied++;
  }
}
console.log(copied ? `sync-docs: ${copied} guide(s) copied` : "sync-docs: the guides are in sync");
