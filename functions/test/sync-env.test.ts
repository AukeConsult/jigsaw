import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error the script is plain JavaScript, in the folder of the scripts
import { PUBLIC_KEYS, REQUIRED_KEYS, SECRET_KEYS, envText, missingOf, parseEnv } from "../../scripts/sync-env.mjs";

const script = path.resolve(__dirname, "../../scripts/sync-env.mjs");

describe("copying the settings from /.env to the functions", () => {
  it("reads NAME=value lines, skips comments and empty lines, and takes quotes off a value", () => {
    expect(parseEnv(`# a comment\n\nA=1\n  B = two words \nC="quoted"\nD='single'\n# E=hidden\nF=\nINVALID LINE\n`)).toEqual({ A: "1", B: "two words", C: "quoted", D: "single", F: "" });
    expect(parseEnv("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" }); // Windows line ends
  });

  it("keeps the key apart from the settings that are not secret, so the key is never in the file that is deployed", () => {
    expect(SECRET_KEYS).toEqual(["OPENAI_API_KEY"]);
    for (const key of SECRET_KEYS) expect(PUBLIC_KEYS).not.toContain(key);
    expect(REQUIRED_KEYS).toEqual(["OPENAI_API_KEY", "OPENAI_MODEL"]);
  });

  it("says what is missing: a name with no value is missing too", () => {
    expect(missingOf({})).toEqual(["OPENAI_API_KEY", "OPENAI_MODEL"]);
    expect(missingOf({ OPENAI_API_KEY: "k", OPENAI_MODEL: "" })).toEqual(["OPENAI_MODEL"]);
    expect(missingOf({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" })).toEqual([]);
  });

  it("makes the text of a file of the names that have a value, with a header", () => {
    expect(envText({ A: "1", B: "", C: "3" }, ["A", "B", "C", "D"], "# header")).toBe("# header\nA=1\nC=3\n");
    expect(envText({}, ["A"], "# header")).toBe("# header\n");
  });

  it("writes functions/.env without the key and functions/.secret.local with only the key, and nothing else of /.env", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-"));
    const from = path.join(dir, ".env");
    fs.writeFileSync(from, "FIREBASE_PROJECT_ID=p\nCANVAS_KEYSTORE_PASSWORD=never-copied\nOPENAI_API_KEY=sk-test-123\nOPENAI_MODEL=some-model\nOPENAI_IMAGE_DETAIL=low\nOPENAI_ORG_ID=org-1\nOPENAI_PROJECT_ID=proj-1\n");
    const to = path.join(dir, "functions");
    fs.mkdirSync(to);
    const run = spawnSync(process.execPath, [script, "--from", from, "--to", to], { encoding: "utf8" });
    expect(run.status).toBe(0);
    const publicFile = fs.readFileSync(path.join(to, ".env"), "utf8");
    const secretFile = fs.readFileSync(path.join(to, ".secret.local"), "utf8");
    expect(publicFile).toContain("OPENAI_MODEL=some-model");
    expect(publicFile).toContain("OPENAI_ORG_ID=org-1");
    expect(publicFile).not.toContain("sk-test-123"); // the key is not in the file that is deployed
    expect(publicFile).not.toContain("KEYSTORE");
    expect(secretFile).toContain("OPENAI_API_KEY=sk-test-123");
    expect(secretFile).not.toContain("OPENAI_MODEL");
    expect(run.stdout).not.toContain("sk-test-123"); // and what is said never has it
  });

  it("stops (exit 1) when /.env or a setting is missing, unless it is soft, and then only says so; --check changes nothing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-env-"));
    const to = path.join(dir, "functions");
    fs.mkdirSync(to);
    const run = (...args: string[]) => spawnSync(process.execPath, [script, "--to", to, ...args], { encoding: "utf8" });
    const none = path.join(dir, "missing.env");
    expect(run("--from", none).status).toBe(1);
    expect(run("--from", none, "--soft").status).toBe(0); // a build does not need the AI
    expect(run("--from", none, "--soft").stdout).toMatch(/copy \.env\.example to \.env/);
    const half = path.join(dir, "half.env");
    fs.writeFileSync(half, "OPENAI_API_KEY=k\n");
    expect(run("--from", half).status).toBe(1);
    expect(run("--from", half).stdout).toMatch(/OPENAI_MODEL is missing/);
    expect(run("--from", half, "--soft").status).toBe(0);
    expect(run("--from", half, "--check").status).toBe(1);
    fs.rmSync(path.join(to, ".env"), { force: true });
    fs.rmSync(path.join(to, ".secret.local"), { force: true });
    expect(run("--from", half, "--check").status).toBe(1);
    expect(fs.existsSync(path.join(to, ".env"))).toBe(false); // --check wrote nothing
    const full = path.join(dir, "full.env");
    fs.writeFileSync(full, "OPENAI_API_KEY=k\nOPENAI_MODEL=m\n");
    expect(run("--from", full, "--check").status).toBe(0);
  });
});
