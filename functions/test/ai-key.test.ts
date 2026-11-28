import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// All AI is done by the service, and no AI key ever reaches a client (rule 15 of CLAUDE.md).

const root = resolve(__dirname, "../..");

/** every file under a folder of the repository */
const filesIn = (folder: string): string[] =>
  readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? filesIn(join(folder, entry.name)) : [join(folder, entry.name)]));

describe("the AI key", () => {
  it("is not in a page or what is served with it, and no page calls the AI itself", () => {
    const forbidden = /api\.openai\.com|OPENAI_|sk-(proj|svcacct|admin)-[A-Za-z0-9_-]{10,}|from ['"]openai['"]/i;
    const found = ["frontend/src", "frontend/public"].flatMap(filesIn).filter((file) => forbidden.test(readFileSync(join(root, file), "latin1")));
    expect(found).toEqual([]);
  });

  it("is left out of what a deploy of the functions uploads", () => {
    const firebase = JSON.parse(readFileSync(join(root, "firebase.json"), "utf8")) as { functions: { ignore?: string[] }[] };
    for (const functions of firebase.functions) expect(functions.ignore).toEqual(expect.arrayContaining([".secret.local", "node_modules", ".git"]));
  });
});
