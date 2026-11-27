#!/usr/bin/env node
/**
 * Runs a command with a recent Java first on the PATH: the Firebase emulators need Java 21 or newer, and a computer often has an older
 * Java first on its PATH (that cannot be changed without administrator rights).
 *
 *   node scripts/with-java.mjs --temp=dev firebase emulators:start ...
 *
 * `--temp=<name>` gives the command a temporary folder of its own. **The emulators of the dev environment and of the tests must each have one:** the Storage emulator keeps its files in `<temp>/firebase/storage/blobs` and deletes that folder
 * when it stops, so with the folder the whole computer shares, stopping one (a test run, or the emulators of another project) takes away the files of every one that is running.
 *
 * Java is looked for in JAVA_HOME, then in the usual folder of Eclipse Temurin on Windows (the newest jdk-2x there). If none is found
 * the command still runs with whatever Java the PATH gives.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const exe = process.platform === "win32" ? "java.exe" : "java";
const hasJava = (home) => Boolean(home) && existsSync(path.join(home, "bin", exe));

function findJavaHome() {
  if (hasJava(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  if (process.platform !== "win32") return null;
  const base = "C:\\Program Files\\Eclipse Adoptium";
  if (!existsSync(base)) return null;
  const newest = readdirSync(base)
    .filter((name) => /^jdk-\d+/.test(name))
    .sort((a, b) => parseInt(b.slice(4), 10) - parseInt(a.slice(4), 10) || b.localeCompare(a))[0];
  return newest && hasJava(path.join(base, newest)) ? path.join(base, newest) : null;
}

const command = process.argv.slice(2);
const own = /^--temp=([a-z-]+)$/.exec(command[0] ?? "")?.[1];
if (own) command.shift();
if (!command.length) {
  console.error("with-java: no command given");
  process.exit(2);
}

const env = { ...process.env };
const home = findJavaHome();
if (home) {
  env.JAVA_HOME = home;
  const key = Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "PATH";
  env[key] = path.join(home, "bin") + path.delimiter + (env[key] ?? "");
  console.log(`with-java: using ${home}`);
}

if (own) {
  const temp = path.join(os.tmpdir(), `karins-jigsaw-emulators-${own}`);
  mkdirSync(temp, { recursive: true });
  env.TEMP = env.TMP = env.TMPDIR = temp; // Windows reads TEMP or TMP, others TMPDIR
}

// an argument with a space (a quoted script, as in "test:emulator") stays one argument
const quote = (arg) => (/[\s()&|<>]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
const child = spawn(command.map(quote).join(" "), { stdio: "inherit", shell: true, env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
