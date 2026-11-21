#!/usr/bin/env node
/**
 * Copies the user guides into the frontend, so the app can show them (the User guide pages read them as files):
 *
 *   docs/guide/jigsaw-guide.md   (the short guide of Karins jigsaw: the menu of the jigsaw module)
 *   docs/guide/user-guide.md     (the whole guide, canvas included: the menu of the canvas module)
 *        ->  frontend/public/docs/   (generated copies, not committed)
 *
 * They are the ONE place to edit. This runs by itself before every frontend start / build (npm pre-hooks), and by hand with: npm run sync:docs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const guides = ["jigsaw-guide.md", "user-guide.md"];
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
