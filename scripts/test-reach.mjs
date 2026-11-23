// Runs the reach test of the board (frontend/src/app/board/jigsaw-board/jigsaw-board.reach.spec.ts) in a window of each size: the size decides whether the store is beside the
// picture (1200 px and wider) or below it. `node scripts/test-reach.mjs` runs all; `node scripts/test-reach.mjs 1400x800 360x640` only those.
import { spawnSync } from 'node:child_process';

const sizes = process.argv.length > 2 ? process.argv.slice(2) : ['360x640', '414x800', '600x800', '768x1024', '1100x700', '1280x720', '1400x800', '1920x1000'];
let failed = 0;
for (const size of sizes) {
  console.log(`\n=== window ${size} ===`);
  const run = spawnSync('npm', ['--prefix', 'frontend', 'run', 'test:reach'], { stdio: 'inherit', shell: true, env: { ...process.env, WINDOW: size } });
  if (run.status !== 0) failed++;
}
console.log(failed ? `\n${failed} of ${sizes.length} sizes failed.` : `\nAll ${sizes.length} sizes passed.`);
process.exit(failed ? 1 : 0);
