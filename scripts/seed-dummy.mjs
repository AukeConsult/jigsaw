// Makes dummy jigsaws to see how the lists and pages look: `npm run seed:dummy` (a jigsaw of every picture in the folder), `npm run seed:dummy -- --count 5` (only 5), `--again` (add more when
// there are some already), `--pictures <folder>`, and `npm run seed:dummy:clean` takes them away again.
// It talks to the running dev app through its API (the dev server on :4210 must be up), the way the pages do, so every rule is checked as for a real jigsaw.
// Dummy jigsaws are the ones whose author is "Test Tester": the clean-up takes away only those.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]);
};
const BASE = String(arg('api', 'http://localhost:4210/jigsaw/api'));
const FOLDER = String(arg('pictures', 'C:\\Users\\leif\\OneDrive\\Bilder\\div'));
const COUNT = arg('count', null) === null ? Infinity : Number(arg('count', null)); // every picture of the folder, unless a count is given
const CLEAN = process.argv.includes('--clean');
const AGAIN = process.argv.includes('--again');
const OWNER = { username: 'test-tester', name: 'Test Tester' };
const PLAYER = { username: 'test-player', name: 'Test Player' };

// never anywhere but on this machine: the dummies are for the emulator
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(BASE + '/')) throw new Error(`Only a local API is used for dummy jigsaws, not ${BASE}.`);

const { JIGSAW_LANGUAGES, JigsawCategories, JigsawCut, JigsawPieces, JigsawSettings } = require('../functions/lib/models/shared');

/** A request; when the dev server does not answer (it is restarting after a change), it is tried again a few times before giving up. */
async function send(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (attempt >= 10) throw e;
      console.log(`No answer from ${BASE} (try ${attempt} of 10), waiting...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

async function call(method, url, { body, user, raw, headers = {} } = {}) {
  const res = await send(BASE + url, {
    method,
    headers: { ...(user ? { 'X-Jigsaw-User': user } : {}), ...(body && !raw ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

/** The user with this user name: the one there is, or a new one. */
async function userOf({ username, name }) {
  const found = await send(`${BASE}/jigsaw-users/by-username/${username}`);
  return found.ok ? found.json() : call('POST', '/jigsaw-users', { body: { username, name } });
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffled = (list) => [...list].sort(() => Math.random() - 0.5);

if (CLEAN) {
  const mine = (await call('GET', '/jigsaw')).filter((j) => j.author === OWNER.name);
  const owner = await userOf(OWNER);
  for (const j of mine) await call('DELETE', `/jigsaw/${j.id}`, { user: owner.id });
  console.log(`Took away ${mine.length} dummy jigsaws.`);
  process.exit(0);
}

let canvas;
try {
  canvas = require('@napi-rs/canvas');
} catch {
  throw new Error('The dummy jigsaws need a canvas to draw the pieces: run `npm install --save-dev @napi-rs/canvas` once, in the main folder.');
}
const { createCanvas, loadImage, Path2D } = canvas;

const dummies = (await call('GET', '/jigsaw')).filter((j) => j.author === OWNER.name);
// the dummy jigsaws there are already are kept; a picture that has a dummy jigsaw already is not used again (with --again it is)
const used = new Set(dummies.map((j) => j.pictureName));

const all = (await readdir(FOLDER)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const files = AGAIN ? all : all.filter((f) => !used.has(f.slice(0, 200)));
const toMake = Math.min(COUNT, files.length);
if (Number.isFinite(COUNT) && COUNT > files.length) console.log(`Only ${files.length} pictures are left in ${FOLDER}, so ${files.length} are made, not ${COUNT}.`);
if (dummies.length) console.log(`${dummies.length} dummy jigsaws exist already: making ${toMake} more.`);
const owner = await userOf(OWNER);
const player = await userOf(PLAYER);

/** The part of the picture that covers a picture area of this shape, drawn as a jpeg (the longest side at most 1600 px). */
async function fit(image, width, height) {
  const shape = width / height;
  const wide = image.width / image.height > shape;
  const w = wide ? image.height * shape : image.width;
  const h = wide ? image.height : image.width / shape;
  const scale = Math.min(1, 1600 / Math.max(w, h));
  const c = createCanvas(Math.round(w * scale), Math.round(h * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(image, (image.width - w) / 2, (image.height - h) / 2, w, h, 0, 0, c.width, c.height);
  return c;
}

/** The graphic of each piece, as `piece-graphics.ts` of the app draws it: its outline cut out of the picture, with the line of the jigsaw. */
function graphics(picture, pieces, columns, rows, line) {
  const out = new Map();
  for (const piece of pieces) {
    const size = piece.size;
    const margin = Math.ceil(size * 0.35);
    const side = size + 2 * margin;
    const scale = Math.min(2, 256 / side);
    const c = createCanvas(Math.max(1, Math.round(side * scale)), Math.max(1, Math.round(side * scale)));
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(margin, margin);
    const outline = new Path2D(JigsawCut.path(size, piece));
    ctx.save();
    ctx.clip(outline);
    ctx.drawImage(picture, -piece.col * size, -piece.row * size, columns * size, rows * size);
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineWidth = line.width;
    ctx.strokeStyle = line.color;
    ctx.globalAlpha = 0.55;
    if (line.width > 0) ctx.stroke(outline);
    out.set(piece.id, `data:image/webp;base64,${c.toBuffer('image/webp', 80).toString('base64')}`);
  }
  return out;
}

const PIECES = [24, 48, 96, 150, 352, 600];
const LEVELS = [10, 25, 40];
const LINES = [{ width: 1, color: '#808080' }, { width: 2, color: '#333333' }, { width: 0, color: '#808080' }];
const DESCRIPTIONS = ['', '', 'A test jigsaw.', 'Made to see how a list of many jigsaws looks.', 'Dummy picture from a folder of test pictures.'];

/** None to three categories, and often one of the sub-categories of a category: pressed the way a person does it, so the rules of the model decide what comes out. */
function randomCategories() {
  let keys = [];
  for (let i = pick([0, 1, 1, 2, 2, 3]); i > 0; i--) {
    const category = pick(JigsawCategories.all());
    keys = JigsawCategories.toggled(keys, category.key);
    if (category.subs.length && Math.random() < 0.6) keys = JigsawCategories.toggled(keys, pick(category.subs).key);
  }
  return keys;
}

const picks = shuffled(files).slice(0, toMake);
const made = [];
for (const [i, file] of picks.entries()) {
  const image = await loadImage(await readFile(path.join(FOLDER, file)));
  const shape = image.width / image.height;
  const asked = { width: 800, height: Math.round(800 / shape / 10) * 10 };
  const layout = JigsawCut.layoutFor(asked.width, asked.height, pick(PIECES));
  const line = pick(LINES);
  const base = path.parse(file).name;
  const description = pick(DESCRIPTIONS);
  const categories = randomCategories();
  const language = Math.random() < 0.5 ? 'nb' : pick(JIGSAW_LANGUAGES).code; // about half Norwegian, as the pictures are
  const settings = {
    name: `Test ${String(dummies.length + i + 1).padStart(2, '0')} - ${base}`.slice(0, 60),
    author: OWNER.name,
    ownerUid: owner.id,
    ...(i % 7 === 3 ? { visibility: 'owner' } : {}),
    ...(Math.random() < 0.3 ? { timed: false } : {}),
    pictureName: file.slice(0, 200),
    ...(description ? { description } : {}),
    ...(categories.length ? { categories } : {}),
    language,
    width: layout.width,
    height: layout.height,
    gridSize: layout.grid,
    gridVisible: false,
    placed: [],
    snapPercent: pick(LEVELS),
    lineWidth: line.width,
    lineColor: line.color,
    backColor: JigsawSettings.DEFAULT_BACK_COLOR,
  };
  const cutting = JigsawCut.cut(settings.width, settings.height, settings.gridSize);
  if ('error' in cutting) throw new Error(cutting.error);
  const jigsaw = await call('POST', '/jigsaw', { body: { ...settings, storeWidth: cutting.storeWidth }, user: owner.id });
  try {
    const picture = await fit(image, settings.width, settings.height);
    await call('PUT', `/jigsaw-image/${jigsaw.id}`, { body: picture.toBuffer('image/jpeg', 85), raw: true, headers: { 'Content-Type': 'image/jpeg' }, user: owner.id });
    const pieces = cutting.placed.flatMap((p) => JigsawPieces.of(p, cutting.columns) ?? []);
    const drawn = graphics(picture, pieces, cutting.columns, cutting.rows, line);
    await call('PUT', `/jigsaw-pieces/${jigsaw.id}`, { body: { pieces: pieces.map((p) => ({ ...p, graphic: drawn.get(p.id) })) }, user: owner.id });
    made.push({ jigsaw, pieces });
    console.log(`${settings.name}: ${cutting.columns * cutting.rows} pieces${categories.length ? `, ${categories.join(' ')}` : ''}`);
  } catch (e) {
    await call('DELETE', `/jigsaw/${jigsaw.id}`, { user: owner.id }).catch(() => undefined); // nothing half made is left
    throw e;
  }
}

// the dummies from an earlier run that no round was started on (a run that stopped) get their rounds too
for (const j of dummies) {
  if ((await call('GET', `/jigsaw/${j.id}/plays/summary`)).played) continue;
  const { pieces } = await call('GET', `/jigsaw-pieces/${j.id}`);
  made.push({ jigsaw: j, pieces });
}

// rounds on some of them, by the owner and by another player, with some pieces in place, so "popular", the round counts and the lists of rounds have something to show
for (const [i, { jigsaw, pieces }] of made.entries()) {
  if (i % 5 === 4) continue;
  // a jigsaw only its owner sees can get a round from its owner only (the API answers 404 to anybody else)
  const players = jigsaw.visibility === 'owner' ? [owner] : i % 2 ? [owner, player] : [player];
  for (const who of players.slice(0, 1 + (i % 3))) {
    const round = await call('POST', `/jigsaw/${jigsaw.id}/plays`, { body: { userId: who.id }, user: who.id });
    const home = shuffled(pieces).slice(0, Math.floor(pieces.length * Math.random() * 0.8));
    const moves = home.map((p, n) => ({ id: p.id, centerX: (p.col + 0.5) * p.size, centerY: (p.row + 0.5) * p.size, layer: n + 1 }));
    if (moves.length) await call('PATCH', `/jigsaw/${jigsaw.id}/plays/${round.id}/positions`, { body: { moves, elapsedMs: 60000 * (2 + Math.floor(Math.random() * 90)) }, user: who.id });
  }
}
console.log(`Made ${made.length} dummy jigsaws (author "${OWNER.name}"). Take them away with: npm run seed:dummy:clean`);
