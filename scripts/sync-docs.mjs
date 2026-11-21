#!/usr/bin/env node
/**
 * Copies the user guide into the frontend, so the app can show it (the User guide page reads it as a file):
 *
 *   docs/guide/user-guide.md   (the ONE place to edit)
 *        ->  frontend/public/docs/user-guide.md   (generated copy, not committed)
 *
 * It runs by itself before every frontend start / build (npm pre-hooks), and by hand with: npm run sync:docs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "docs", "guide", "user-guide.md");
const target = path.join(root, "frontend", "public", "docs", "user-guide.md");

if (!fs.existsSync(source)) {
  console.error(`sync-docs: source not found: ${source}`);
  process.exit(1);
}
const text = fs.readFileSync(source, "utf8");
// only write what changed (so a running dev server is not restarted for nothing)
if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== text) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  console.log("sync-docs: user guide copied");
} else {
  console.log("sync-docs: user guide is in sync");
}
