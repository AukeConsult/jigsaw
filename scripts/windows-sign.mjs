// Signs a file of the Windows app (the program and its installer) with a code-signing certificate, so Windows shows the name of the publisher and SmartScreen
// learns to trust the file, instead of "Publisher: Unknown". The certificate is a .pfx file that stays on THIS computer and is never committed (.gitignore: *.pfx).
// Set it up in .env (or in the environment):
//   SF_SIGN_PFX=C:/keys/karinsjigsaw.pfx
//   SF_SIGN_PFX_PASSWORD=the password of the file
//   SF_SIGN_TIMESTAMP=http://timestamp.digicert.com     (optional: the signature stays valid after the certificate has expired)
// Without them nothing is signed, and a message says so. Used by scripts/windows-release.mjs; try it alone with: node scripts/windows-sign.mjs <file>
// Needs signtool.exe of the Windows 10/11 SDK (found in "Windows Kits\10\bin\<version>\x64").
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sdkTool } from "./windows-msix.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The SF_SIGN_ values of .env, the environment of the command first. */
function settings() {
  const values = {};
  const file = join(root, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(SF_SIGN_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) values[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
  for (const key of ["SF_SIGN_PFX", "SF_SIGN_PFX_PASSWORD", "SF_SIGN_TIMESTAMP"]) if (process.env[key]) values[key] = process.env[key];
  return values;
}

/**
 * Signs the file when a certificate is set up, and checks the signature. Returns true when it was signed, false when there is no certificate (the file stays unsigned);
 * a certificate that is set up but does not work stops the release with the reason.
 */
export function signFile(path) {
  const env = settings();
  if (!env.SF_SIGN_PFX) {
    console.log(`Not signed (no SF_SIGN_PFX in .env): ${path}`);
    return false;
  }
  if (!existsSync(env.SF_SIGN_PFX)) throw new Error(`The certificate file SF_SIGN_PFX does not exist: ${env.SF_SIGN_PFX}`);
  if (!env.SF_SIGN_PFX_PASSWORD) throw new Error("SF_SIGN_PFX is set but SF_SIGN_PFX_PASSWORD is not.");
  const signtool = sdkTool("signtool.exe");
  if (!signtool) throw new Error("signtool.exe was not found. Install the Windows 10/11 SDK (https://developer.microsoft.com/windows/downloads/windows-sdk/).");
  const timestamp = env.SF_SIGN_TIMESTAMP || "http://timestamp.digicert.com";
  console.log(`\n== Sign ${path}`);
  const signed = spawnSync(signtool, ["sign", "/fd", "SHA256", "/f", env.SF_SIGN_PFX, "/p", env.SF_SIGN_PFX_PASSWORD, "/tr", timestamp, "/td", "SHA256", path], { stdio: "inherit", cwd: root });
  if (signed.error || signed.status !== 0) throw new Error(`Signing ${path} failed${signed.error ? ` (${signed.error.message})` : ` (exit ${signed.status})`}`);
  return true;
}

// run alone: node scripts/windows-sign.mjs <file>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/windows-sign.mjs <file>");
    process.exit(1);
  }
  try {
    process.exit(signFile(resolve(file)) ? 0 : 2);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
