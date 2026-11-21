#!/usr/bin/env node
/**
 * Runs the whole app locally with one command:  npm run dev
 *   - functions: tsc --watch (rebuilds functions/lib when a .ts file changes; the emulator picks it up)
 *   - emulators: Auth, Functions, Firestore, Storage (npm run dev:emulators)
 *   - frontend:  ng serve on http://localhost:4210, with /jigsaw/api sent to the Functions emulator
 * Ctrl+C stops all three.
 */
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";

// the emulator needs a built functions/lib to start, so build once first
console.log("[dev] building the functions...");
const build = spawnSync(npm, ["--prefix", "functions", "run", "build"], { cwd: root, stdio: "inherit", shell: isWindows });
if (build.status !== 0) process.exit(build.status ?? 1);

const jobs = [
  ["functions", ["--prefix", "functions", "run", "build:watch"]],
  ["emulators", ["run", "dev:emulators"]],
  ["frontend", ["run", "dev:frontend"]],
];

const children = jobs.map(([name, args]) => {
  const child = spawn(npm, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"], shell: isWindows });
  const prefix = (data) => String(data).split(/\r?\n/).filter(Boolean).forEach((line) => console.log(`[${name}] ${line}`));
  child.stdout.on("data", prefix);
  child.stderr.on("data", prefix);
  child.on("exit", (code) => {
    if (!stopping) {
      console.log(`[dev] ${name} stopped (code ${code}): stopping the rest`);
      stop(code ?? 1);
    }
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

console.log("[dev] frontend http://localhost:4210  |  emulator UI http://localhost:4010");
