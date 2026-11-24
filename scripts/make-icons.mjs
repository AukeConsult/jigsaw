// Makes EVERY app icon and splash screen from the one logo, frontend/public/logo.svg (the four coloured puzzle pieces): npm run icons
// Needs the `sharp` package, which the project does not keep: run `npm i --no-save sharp` in the project root first (or set SHARP_FROM to a folder that has it).
// Writes: the web icons (frontend/public/icons/*, favicon.ico), the Android launcher images and splash screens, the iPhone app icon and splash screens,
// the Windows app.ico and the MSIX pictures. To change the look, change the constants below and run it again.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let sharp;
try {
  sharp = createRequire(process.env.SHARP_FROM ? join(process.env.SHARP_FROM, 'x.js') : join(root, 'x.js'))('sharp');
} catch {
  console.error('The package "sharp" is not installed (the project does not keep it). Install it once, then run this again:\n\n  npm i --no-save sharp\n  npm run icons\n');
  process.exit(1);
}

// ---- the design, in a 512 x 512 box -----------------------------------------------------------------------------------------------------
const TILE = '#eef3fb'; // the soft background of an icon (the pieces are blue and green: a white tile would be lost on a white home screen)
const SPLASH = '#ffffff'; // the background of a splash screen (the page behind it is white)
const logo = readFileSync(join(root, 'frontend/public/logo.svg'), 'utf8');
const LOGO_BOX = 136; // the viewBox of logo.svg is -68 -68 136 136
const logoBody = logo.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>[\s\S]*?<\/title>/, '');

/** The logo in the middle of a 512 box, `fill` of the box wide. */
const art = (fill) => `<g transform="translate(256 256) scale(${(512 * fill) / LOGO_BOX})">${logoBody}</g>`;

/** The picture as an svg text. `shape`: round (rounded square, see-through corners), square (full bleed), circle, none (no background: the Android foreground). */
const svg = (size, { shape = 'round', fill = 0.72 } = {}) => {
  const bg =
    shape === 'none' ? '' : shape === 'circle' ? `<circle cx="256" cy="256" r="256" fill="${TILE}"/>` : shape === 'square' ? `<rect width="512" height="512" fill="${TILE}"/>` : `<rect width="512" height="512" rx="115" fill="${TILE}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">${bg}${art(fill)}</svg>`);
};
const png = (size, options) => sharp(svg(size, options), { density: 384 }).resize(size, size).png().toBuffer();

/** A splash screen: the splash colour with the logo in the middle, `fill` of the shorter side wide. */
const splash = (width, height, fill = 0.3) => {
  const side = Math.round(Math.min(width, height) * fill);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-68 -68 136 136" width="${side}" height="${side}">${logoBody}</svg>`), { density: 384 })
    .resize(side, side)
    .png()
    .toBuffer()
    .then((picture) => sharp({ create: { width, height, channels: 4, background: SPLASH } }).composite([{ input: picture, gravity: 'centre' }]).png().toBuffer());
};

const put = (path, data) => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log('wrote', path);
};

/** An .ico with PNG pictures inside (Windows Vista and newer, every browser). */
const ico = async (sizes) => {
  const pics = await Promise.all(sizes.map((s) => png(s)));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const at = 6 + 16 * i;
    head[at] = s >= 256 ? 0 : s;
    head[at + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, at + 4); // planes
    head.writeUInt16LE(32, at + 6); // bits per pixel
    head.writeUInt32LE(pics[i].length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += pics[i].length;
  });
  return Buffer.concat([head, ...pics]);
};

// ---- the web app --------------------------------------------------------------------------------------------------------------------------
put('frontend/public/icons/icon-192.png', await png(192));
put('frontend/public/icons/icon-512.png', await png(512));
put('frontend/public/icons/icon-maskable-512.png', await png(512, { shape: 'square', fill: 0.56 })); // Android cuts it to any shape: the art stays in the middle 80 %
put('frontend/public/icons/apple-touch-icon.png', await png(180, { shape: 'square', fill: 0.7 })); // the iPhone rounds the corners itself
put('frontend/public/favicon.ico', await ico([16, 32, 48]));

// ---- Android: the launcher (legacy square and round, and the adaptive foreground that sits on the tile colour of ic_launcher_background.xml) ----
const res = 'client-wrappers/android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [name, k] of Object.entries(densities)) {
  put(`${res}/mipmap-${name}/ic_launcher.png`, await png(48 * k));
  put(`${res}/mipmap-${name}/ic_launcher_round.png`, await png(48 * k, { shape: 'circle', fill: 0.62 }));
  put(`${res}/mipmap-${name}/ic_launcher_foreground.png`, await png(108 * k, { shape: 'none', fill: 0.5 })); // the middle 66 of 108 dp are always seen
}
// the splash screens keep the sizes the folders already have
for (const file of readdirSync(join(root, res), { recursive: true }).filter((f) => f.endsWith('splash.png'))) {
  const { width, height } = await sharp(join(root, res, file)).metadata();
  put(`${res}/${file.replaceAll('\\', '/')}`, await splash(width, height));
}

// ---- iPhone: one 1024 square, no see-through parts, and the splash images -------------------------------------------------------------
put('client-wrappers/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', await png(1024, { shape: 'square', fill: 0.7 }));
for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  put(`client-wrappers/ios/App/App/Assets.xcassets/Splash.imageset/${name}`, await splash(2732, 2732, 0.24));
}

// ---- Windows: the app icon and the MSIX pictures ----------------------------------------------------------------------------------------
put('client-wrappers/windows/app.ico', await ico([16, 24, 32, 48, 64, 128, 256]));
put('client-wrappers/windows/msix/Assets/Square44x44Logo.png', await png(44));
put('client-wrappers/windows/msix/Assets/Square150x150Logo.png', await png(150));
put('client-wrappers/windows/msix/Assets/StoreLogo.png', await png(50));
put('client-wrappers/windows/msix/Assets/Wide310x150Logo.png', await sharp({ create: { width: 310, height: 150, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await png(150), left: 80, top: 0 }]).png().toBuffer());

console.log('done');
