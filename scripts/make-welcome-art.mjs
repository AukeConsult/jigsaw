#!/usr/bin/env node
/**
 * Makes the pictures of the welcome band: each photo in `frontend/art/welcome/` (a jpeg; `crops.json` says which 4:3 part of it is used: x, y and width in pixels of the photo,
 * the middle of the photo when it says nothing) becomes a jigsaw that is almost put together, `frontend/public/images/welcome-art-<n>.svg` (48 pieces, a few places empty and
 * two pieces lying loose, different for each photo). The band shows them one after the other. It also writes the list, `frontend/src/app/jigsaw/welcome-art.ts`.
 * Run it after a photo is added or changed:  npm run welcome:art
 * (Windows: the photo is cut and made smaller with PowerShell and System.Drawing, so no package is needed.)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "frontend", "art", "welcome");
const imagesDir = path.join(root, "frontend", "public", "images");
const cropsFile = path.join(sourceDir, "crops.json");
const crops = fs.existsSync(cropsFile) ? JSON.parse(fs.readFileSync(cropsFile, "utf8")) : {};

const S = 40;
const H = 7;
const COLS = 8;
const ROWS = 6;
const OX = 24;
const OY = 24;
// the picture starts at the top left corner of the image (2 px for the line); the room at the right and below is for the pieces that lie loose
const VIEW = `${OX - 2} ${OY - 2} ${COLS * S + 52} ${ROWS * S + 48}`;
const round1 = (n) => Math.round(n * 10) / 10;

/** A random number generator that gives the same numbers for the same seed (so the pictures do not change each time this runs). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The photo cut to 4:3 and 720 x 540, as the bytes of a jpeg (PowerShell and System.Drawing). */
function cut(file, crop) {
  const out = path.join(os.tmpdir(), `welcome-${path.basename(file)}`);
  const width = crop?.w ? String(crop.w) : "$img.Width";
  const left = crop?.x !== undefined ? String(crop.x) : "[int](($img.Width - $w) / 2)";
  const top = crop?.y !== undefined ? String(crop.y) : "[int](($img.Height - $h) / 2)";
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$img = [System.Drawing.Image]::FromFile("${file}")`,
    `$w = ${width}; if ($w -gt $img.Width) { $w = $img.Width }`,
    "$h = [int]($w * 3 / 4); if ($h -gt $img.Height) { $h = $img.Height; $w = [int]($h * 4 / 3) }",
    `$x = ${left}; $y = ${top}`,
    "if ($x + $w -gt $img.Width) { $x = $img.Width - $w }; if ($y + $h -gt $img.Height) { $y = $img.Height - $h }",
    "$bmp = New-Object System.Drawing.Bitmap 720, 540",
    "$g = [System.Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'",
    "$g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, 720, 540), $x, $y, $w, $h, [System.Drawing.GraphicsUnit]::Pixel)",
    "$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
    "$p = New-Object System.Drawing.Imaging.EncoderParameters 1",
    "$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 74L",
    `$bmp.Save("${out}", $enc, $p); $g.Dispose(); $bmp.Dispose(); $img.Dispose()`,
  ].join("\n");
  const run = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  if (run.status !== 0) throw new Error(`could not cut ${file}: ${run.stderr || run.stdout}`);
  return fs.readFileSync(out);
}

/** One side of a piece, from (x0, y0) to (x1, y1), with a tab (sign 1) or a blank (sign -1) along the normal, or flat (0). */
function edge(x0, y0, x1, y1, nx, ny, sign) {
  if (!sign) return `L${x1} ${y1}`;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const ax = x0 + 0.35 * dx;
  const ay = y0 + 0.35 * dy;
  const bx = x0 + 0.65 * dx;
  const by = y0 + 0.65 * dy;
  const k = sign * H * 1.33;
  return `L${round1(ax)} ${round1(ay)}C${round1(ax + nx * k)} ${round1(ay + ny * k)} ${round1(bx + nx * k)} ${round1(by + ny * k)} ${round1(bx)} ${round1(by)}L${x1} ${y1}`;
}

function svgOf(jpeg, name, seed) {
  const rnd = random(seed);
  const pick = () => (rnd() < 0.5 ? -1 : 1);
  const hs = Array.from({ length: ROWS }, () => Array.from({ length: COLS - 1 }, pick));
  const vs = Array.from({ length: ROWS - 1 }, () => Array.from({ length: COLS }, pick));
  const piece = (r, c) => {
    const x = OX + c * S;
    const y = OY + r * S;
    const top = r === 0 ? 0 : -vs[r - 1][c];
    const right = c === COLS - 1 ? 0 : hs[r][c];
    const bottom = r === ROWS - 1 ? 0 : vs[r][c];
    const left = c === 0 ? 0 : -hs[r][c - 1];
    return `M${x} ${y}` + edge(x, y, x + S, y, 0, -1, top) + edge(x + S, y, x + S, y + S, 1, 0, right) + edge(x + S, y + S, x, y + S, 0, 1, bottom) + edge(x, y + S, x, y, -1, 0, left) + "Z";
  };
  // five empty places away from each other and from the border (the frame of the picture is whole); two of their pieces lie loose
  const inside = [];
  for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) inside.push([r, c]);
  const empty = [];
  for (let tries = 0; empty.length < 5 && tries < 500; tries++) {
    const [r, c] = inside[Math.floor(rnd() * inside.length)];
    if (!empty.some(([er, ec]) => Math.abs(er - r) + Math.abs(ec - c) < 3)) empty.push([r, c]);
  }
  const loose = empty.slice(0, 2).map(([r, c], i) => ({ r, c, dx: i ? -8 : 44, dy: 40, rot: i ? -12 : 14 }));
  const isEmpty = (r, c) => empty.some(([er, ec]) => er === r && ec === c);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW}" role="img" aria-label="A jigsaw of ${name}, almost finished"><title>A jigsaw of ${name}, almost finished</title>`);
  o.push(
    `<defs><image id="photo" href="data:image/jpeg;base64,${jpeg.toString("base64")}" x="${OX - H - 4}" y="${OY - H - 4}" width="${COLS * S + 2 * H + 8}" height="${ROWS * S + 2 * H + 8}" preserveAspectRatio="none"/>` +
      `<filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity=".3"/></filter>`,
  );
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) o.push(`<clipPath id="p${r}${c}"><path d="${piece(r, c)}"/></clipPath>`);
  o.push("</defs>");
  for (const [r, c] of empty) o.push(`<g clip-path="url(#p${r}${c})" opacity=".15"><use href="#photo"/></g><path d="${piece(r, c)}" fill="none" stroke="#adb5bd" stroke-width="1.5" stroke-dasharray="4 3"/>`);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!isEmpty(r, c)) o.push(`<g clip-path="url(#p${r}${c})"><use href="#photo"/></g><path d="${piece(r, c)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`);
  for (const { r, c, dx, dy, rot } of loose) {
    const cx = OX + c * S + S / 2 + dx;
    const cy = OY + r * S + S / 2 + dy;
    o.push(`<g transform="rotate(${rot} ${cx} ${cy})" filter="url(#sh)"><g transform="translate(${dx} ${dy})"><g clip-path="url(#p${r}${c})"><use href="#photo"/></g><path d="${piece(r, c)}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></g></g>`);
  }
  o.push("</svg>");
  return o.join("\n") + "\n";
}

const photos = fs.readdirSync(sourceDir).filter((f) => /\.jpe?g$/i.test(f)).sort();
for (const old of fs.readdirSync(imagesDir)) if (/^welcome-art-\d+\.svg$/.test(old)) fs.rmSync(path.join(imagesDir, old));
const files = [];
photos.forEach((file, i) => {
  const name = path.basename(file, path.extname(file));
  const jpeg = cut(path.join(sourceDir, file), crops[name]);
  const out = `welcome-art-${i + 1}.svg`;
  fs.writeFileSync(path.join(imagesDir, out), svgOf(jpeg, name.replace(/-/g, " "), 1000 + i * 77));
  files.push(`images/${out}`);
  console.log(`welcome-art: ${file} -> public/images/${out}`);
});
const list = `// Made by scripts/make-welcome-art.mjs (npm run welcome:art): the pictures of the welcome band, one after the other. Do not edit.\nexport const WELCOME_ART: readonly string[] = ${JSON.stringify(files, null, 2)};\n`;
fs.writeFileSync(path.join(root, "frontend", "src", "app", "jigsaw", "welcome-art.ts"), list);
