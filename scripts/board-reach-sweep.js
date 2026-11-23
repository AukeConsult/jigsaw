// Run in the browser console on the page of a round (or with the Browser tool's javascript): takes a piece of the store, and then one on the picture, with the pointer all the way to every
// side of the board, and says what went wrong: a piece that jumps (moves more than the pointer, or the other way, or on the other axis), disappears, ends outside the board, or stops
// short of an edge by more than a piece. It moves pieces of the round that is open (they are saved like any move). The result is a list of problems: empty is good.
(async () => {
  const board = document.querySelector('app-jigsaw-board');
  const c = window.ng.getComponent(board);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (t, type, x, y) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const rootRect = () => c.root().nativeElement.getBoundingClientRect(); // the pieces area itself (the first div of the board can be the floating helper picture)
  const surfaceRect = () => board.querySelector('.picture-surface').getBoundingClientRect();
  const pieces = () => [...board.querySelectorAll('.placed-object')].map((e) => ({ e, r: e.getBoundingClientRect() })).filter((o) => o.r.width > 5);
  const inside = (o, b, m) => o.r.left > b.left + m && o.r.right < b.right - m && o.r.top > b.top + m && o.r.bottom < b.bottom - m;
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  const problems = [];
  const wide = window.innerWidth >= 1200;

  const drag = async (piece, path, name, watch) => {
    const start = centre(piece.getBoundingClientRect());
    fire(piece, 'pointerdown', start.x, start.y);
    let last = start;
    let lastP = start;
    let end = piece.getBoundingClientRect();
    for (const [px, py] of path(start)) {
      fire(piece, 'pointermove', px, py);
      await wait(14);
      const r = piece.getBoundingClientRect();
      if (r.width === 0) {
        problems.push(`${name}: the piece disappeared`);
        break;
      }
      const now = centre(r);
      const moved = { x: now.x - last.x, y: now.y - last.y };
      const asked = { x: px - lastP.x, y: py - lastP.y };
      const tol = Math.max(3, r.width * 0.15);
      if (watch.x && (moved.x * Math.sign(asked.x) < -tol || Math.abs(moved.x) > Math.abs(asked.x) + tol)) problems.push(`${name}: jumped sideways ${Math.round(moved.x)}px (pointer ${Math.round(asked.x)}px) at ${Math.round(px)},${Math.round(py)}`);
      if (watch.y && (moved.y * Math.sign(asked.y) < -tol || Math.abs(moved.y) > Math.abs(asked.y) + tol)) problems.push(`${name}: jumped up/down ${Math.round(moved.y)}px (pointer ${Math.round(asked.y)}px) at ${Math.round(px)},${Math.round(py)}`);
      last = now;
      lastP = { x: px, y: py };
      end = r;
      if (problems.length > 6) break;
    }
    fire(piece, 'pointerup', lastP.x, lastP.y);
    await wait(60);
    return end;
  };
  const line = (from, to, n = 30) => () => Array.from({ length: n }, (_, i) => [from.x + ((to.x - from.x) * (i + 1)) / n, from.y + ((to.y - from.y) * (i + 1)) / n]);

  const sweeps = async (label, pick) => {
    for (const [name, dx, dy] of [['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1], ['right again', 1, 0]]) {
      const piece = pick();
      if (!piece) return problems.push(`${label}: no piece to take`);
      const b = rootRect();
      const far = 3 * Math.max(b.width, b.height);
      const end = await drag(piece, (s) => line(s, { x: s.x + dx * far, y: s.y + dy * far })(), `${label} ${name}`, { x: dx !== 0, y: dy !== 0 });
      if (end.left < b.left - 1 || end.right > b.right + 1 || end.top < b.top - 1 || end.bottom > b.bottom + 1) problems.push(`${label} ${name}: ended outside the board`);
      const gap = dx > 0 ? b.right - end.right : dx < 0 ? end.left - b.left : dy > 0 ? b.bottom - end.bottom : end.top - b.top;
      if (dx > 0 && gap > end.width + (wide ? 30 : 8)) problems.push(`${label} ${name}: stopped ${Math.round(gap)}px short of the right edge (a piece is ${Math.round(end.width)}px)`);
    }
  };

  // a piece in the store, whole on the screen
  const inStore = () => {
    const b = rootRect();
    const s = surfaceRect();
    return pieces().filter((o) => inside(o, b, 4) && !(o.r.right > s.left && o.r.left < s.right && o.r.bottom > s.top && o.r.top < s.bottom)).sort((a, b2) => a.r.top - b2.r.top)[0]?.e;
  };
  await sweeps('from the store', inStore);
  // take a piece from the store onto the picture, then sweep from there
  const s = surfaceRect();
  const piece = inStore();
  if (piece) await drag(piece, (st) => line(st, { x: s.left + s.width / 2, y: s.top + s.height / 2 })(), 'to the picture', { x: false, y: false });
  const onPicture = () => pieces().find((o) => centre(o.r).x > s.left && centre(o.r).x < s.right && centre(o.r).y > s.top && centre(o.r).y < s.bottom && inside(o, rootRect(), 2))?.e;
  await sweeps('from the picture', onPicture);
  return { window: [innerWidth, innerHeight], stacked: c.stacked(), zone: !!c.zone(), problems };
})();
