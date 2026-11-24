// Run in the browser console on the page of a round (or with the Browser tool's javascript): drops one piece at many points over and round the scroller (the store frame) and checks rule 3
// of the board, a piece belongs to the scroller only when the WHOLE of it is inside what the scroller shows. The piece is dropped by the pointer (`areaPoint`), and what the page then says
// (`belongsToStore`, `inStore` of the drawn piece) is compared with what the screen shows: the piece box against the frame. They are two ways of telling the same rule (the pointer's and the
// stored place's), so a difference is a bug in one of them. Along the way the scroller scrolls (up and down beside the picture) a piece may hang over the visible edge and still belongs to the
// store (it moves with the scroll), so only the sides across it are judged there (and the top edge while it is not scrolled). It moves one piece of the round that is open (saved like any move). The result is a list of problems: empty is good.
(async () => {
  const board = document.querySelector('app-jigsaw-board');
  const c = window.ng.getComponent(board);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (t, type, x, y) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  const frame = c.storeInner()?.nativeElement.parentElement;
  if (!frame) return { problems: ['the round has no scroller on this screen'] };
  const scale = c.scale();
  const stacked = c.stacked();
  const f = frame.getBoundingClientRect();
  // what the scroller shows: beside the picture its width is a slice (the frame is a little wider: border and scroll bar); below it the strip is as high as the frame without the scroll bar under it
  const shown = stacked ? { left: f.left, right: f.right, top: f.top, bottom: f.bottom - 5 * scale } : { left: f.left, right: f.left + c.sliceWidth() * scale, top: f.top, bottom: f.bottom };
  const problems = [];
  let checked = 0;
  const first = [...board.querySelectorAll('.placed-object[data-id]')].find((e) => c.view().find((v) => v.p.id === e.dataset.id)?.piece && !c.view().find((v) => v.p.id === e.dataset.id)?.matched);
  if (!first) return { problems: ['no piece to take'] };
  const id = first.dataset.id;
  const margin = 3; // a drop this near an edge is not judged: half a pixel of the pointer decides there
  const xs = [-0.5, -0.2, -0.05, 0.05, 0.3, 0.5, 0.7, 0.95, 1.05, 1.3, 1.6].map((k) => shown.left + (shown.right - shown.left) * k);
  const ys = [-0.5, -0.1, 0.02, 0.1, 0.3, 0.5, 0.8, 0.95, 1.02, 1.2].map((k) => shown.top + (shown.bottom - shown.top) * k);
  for (const x of xs) {
    for (const y of ys) {
      const el = board.querySelector(`.placed-object[data-id="${id}"]`);
      const r0 = el.getBoundingClientRect();
      const start = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
      fire(el, 'pointerdown', start.x, start.y);
      for (let i = 1; i <= 8; i++) fire(el, 'pointermove', start.x + ((x - start.x) * i) / 8, start.y + ((y - start.y) * i) / 8);
      fire(el, 'pointerup', x, y);
      await wait(40);
      const now = board.querySelector(`.placed-object[data-id="${id}"]`);
      if (!now) { problems.push(`at ${Math.round(x)},${Math.round(y)}: the piece disappeared`); continue; }
      const r = now.getBoundingClientRect();
      const unscrolled = c.storeScroll() === 0;
      const acrossOk = r.left >= shown.left - 1 && r.right <= shown.right + 1;
      const whole = stacked ? acrossOk && r.top >= shown.top - 1 && r.bottom <= shown.bottom + 1 : acrossOk && (!unscrolled || r.top >= shown.top - 1);
      const near = Math.min(Math.abs(r.left - shown.left), Math.abs(r.right - shown.right), Math.abs(r.top - shown.top), stacked ? Math.abs(r.bottom - shown.bottom) : 99) < margin;
      const says = !!c.view().find((v) => v.p.id === id)?.inStore;
      checked++;
      if (near) continue;
      if (says && !whole) problems.push(`dropped at ${Math.round(x)},${Math.round(y)}: the page says the piece is in the scroller but it is not whole inside it`);
      if (!says && whole && !stacked) problems.push(`dropped at ${Math.round(x)},${Math.round(y)}: the piece is whole inside the scroller but the page says it is a free piece`);
    }
  }
  return { window: [innerWidth, innerHeight], stacked, checked, problems: problems.slice(0, 20), count: problems.length };
})();
