import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { JigsawCut } from '../../models/shared/jigsaw';
import type { PlacedObject } from '../../models/shared/placed';
import { JigsawBoard } from './jigsaw-board';

/**
 * A piece moves freely over all the room the board gives it. For several shapes of picture, in the window it is run in (the store is beside the picture from 1200 px, below
 * it under that: `npm run test:reach` runs it in every size), a piece that lies on the picture and one that lies in the store are each taken with the pointer all the way to
 * every side. On every step the piece must follow the pointer (it never jumps back or away: it moves no more than the pointer and never the other way, and does not change the
 * other axis), it is never outside the board, and no room as big as a piece is left over that it cannot reach.
 */
const PICTURES: { width: number; height: number; grid: number }[] = [
  { width: 770, height: 630, grid: 70 },
  { width: 600, height: 900, grid: 50 },
  { width: 1200, height: 600, grid: 100 },
  { width: 400, height: 400, grid: 50 },
  { width: 900, height: 450, grid: 50 },
];
const SIDEBAR_PX = 272; // from 1200 px the sidebar of the jigsaw takes 17rem of the room

class NoTexts implements TranslocoLoader {
  getTranslation(): Observable<Record<string, string>> {
    return of({});
  }
}

@Component({
  selector: 'app-reach-host',
  imports: [JigsawBoard],
  template: `<div [style.width.px]="room"><app-jigsaw-board [width]="w" [height]="h" [gridSize]="grid" [gridVisible]="true" [gridInset]="true" [storeWidth]="storeWidth" [fillScreen]="true" [(placed)]="placed" /></div>`,
})
class ReachHost {
  room = 400;
  w = 0;
  h = 0;
  grid = 0;
  storeWidth = 0;
  placed = signal<PlacedObject[]>([]);
}

const settle = async (fixture: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 6));
  fixture.detectChanges();
};

const fire = (target: Element, type: string, x: number, y: number) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 7, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));

type Where = 'picture' | 'store';

describe(`moving a piece over all the room of the board (window ${window.innerWidth}x${window.innerHeight})`, () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideTransloco({ config: { availableLangs: ['en'], defaultLang: 'en' }, loader: NoTexts })],
    });
  });

  for (const pic of PICTURES) {
    for (const where of ['picture', 'store'] as Where[]) {
      it(`${pic.width}x${pic.height} picture, from the ${where}`, async () => {
        const cut = JigsawCut.cut(pic.width, pic.height, pic.grid, () => 0.4);
        if ('error' in cut) throw new Error(cut.error);
        const fixture = TestBed.createComponent(ReachHost);
        const host = fixture.componentInstance;
        const wide = window.innerWidth >= 1200;
        Object.assign(host, { w: pic.width, h: pic.height, grid: pic.grid, storeWidth: cut.storeWidth, room: window.innerWidth - (wide ? SIDEBAR_PX : 0) - 16 });
        const pieces = cut.placed.filter((p) => p.piece);
        const chosen = pieces[Math.floor(pieces.length / 2)];
        // the chosen piece lies on the picture, or stays in the store (where the cut put it)
        host.placed.set(cut.placed.map((p) => (where === 'picture' && p.id === chosen.id ? { ...p, centerX: pic.width / 2 + pic.grid / 2, centerY: pic.height / 2 + pic.grid / 2, layer: 5000 } : p)));
        document.body.appendChild(fixture.nativeElement);
        for (let i = 0; i < 6; i++) {
          await settle(fixture);
          await new Promise((r) => setTimeout(r, 40)); // the board measures the room it has, then draws again
        }

        const el = fixture.nativeElement as HTMLElement;
        const board = (el.querySelector('app-jigsaw-board > div') as HTMLElement).getBoundingClientRect();
        const surface = el.querySelector('.picture-surface') as HTMLElement;
        const find = (): HTMLElement => {
          const here = surface.getBoundingClientRect();
          const all = [...el.querySelectorAll<HTMLElement>('.placed-object')].filter((e) => e.getBoundingClientRect().width > 0);
          const inPicture = (e: HTMLElement) => {
            const r = e.getBoundingClientRect();
            return r.left + r.width / 2 > here.left && r.left + r.width / 2 < here.right && r.top + r.height / 2 > here.top && r.top + r.height / 2 < here.bottom;
          };
          // on the picture: the one there; in the store: a piece that is whole inside the board, the nearest to its middle
          const pool = where === 'picture' ? all.filter(inPicture) : all.filter((e) => !inPicture(e) && e.getBoundingClientRect().right < board.right - 4 && e.getBoundingClientRect().bottom < board.bottom - 4 && e.getBoundingClientRect().left > board.left + 4 && e.getBoundingClientRect().top > board.top + 4);
          if (!pool.length) throw new Error(`no piece in the ${where}: ${all.length} drawn of ${el.querySelectorAll('.placed-object').length}, picture ${JSON.stringify(here)}, board ${JSON.stringify(board)}, first ${JSON.stringify(all[0]?.getBoundingClientRect())}`);
          return pool[Math.floor(pool.length / 2)];
        };
        const rectOf = (e: HTMLElement) => e.getBoundingClientRect();

        const failures: string[] = [];
        const sweep = async (name: string, dx: number, dy: number) => {
          const piece = find();
          const start = rectOf(piece);
          const sx = start.left + start.width / 2;
          const sy = start.top + start.height / 2;
          const far = 3 * Math.max(board.width, board.height);
          const steps = 30;
          fire(piece, 'pointerdown', sx, sy);
          let last = { x: sx, y: sy };
          let lastPointer = { x: sx, y: sy };
          let end = rectOf(piece);
          for (let i = 1; i <= steps; i++) {
            const px = sx + (dx * far * i) / steps;
            const py = sy + (dy * far * i) / steps;
            fire(piece, 'pointermove', px, py);
            await settle(fixture);
            const r = rectOf(piece);
            if (r.width === 0) {
              failures.push(`${name}: the piece disappeared at step ${i}`);
              break;
            }
            const now = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            const moved = { x: now.x - last.x, y: now.y - last.y };
            const asked = { x: px - lastPointer.x, y: py - lastPointer.y };
            // it follows the pointer: no more than the pointer moved, never the other way, and the other axis stays
            const tol = Math.max(2, r.width * 0.15);
            if (dx !== 0 && (moved.x * dx < -tol || Math.abs(moved.x) > Math.abs(asked.x) + tol)) failures.push(`${name}: jumped sideways by ${Math.round(moved.x)}px (the pointer moved ${Math.round(asked.x)}px) at step ${i}`);
            if (dy !== 0 && (moved.y * dy < -tol || Math.abs(moved.y) > Math.abs(asked.y) + tol)) failures.push(`${name}: jumped up or down by ${Math.round(moved.y)}px (the pointer moved ${Math.round(asked.y)}px) at step ${i}`);
            last = now;
            lastPointer = { x: px, y: py };
            end = r;
            if (failures.length > 3) break;
          }
          fire(piece, 'pointerup', lastPointer.x, lastPointer.y);
          await settle(fixture);
          // never outside the board
          if (end.left < board.left - 1 || end.right > board.right + 1 || end.top < board.top - 1 || end.bottom > board.bottom + 1) failures.push(`${name}: ended outside the board`);
          // and no room as big as a piece that it cannot reach, on the side it was taken to
          const gap = dx > 0 ? board.right - end.right : dx < 0 ? end.left - board.left : dy > 0 ? board.bottom - end.bottom : end.top - board.top;
          const limit = end.width + (wide ? 30 : 8); // beside the picture the store has a scroll bar and a border at its end
          if (dx !== 0 && gap > limit && !(dx < 0 && where === 'store')) failures.push(`${name}: stopped ${Math.round(gap)}px short of the edge (a piece is ${Math.round(end.width)}px)`);
        };

        await sweep('right', 1, 0);
        await sweep('left', -1, 0);
        await sweep('down', 0, 1);
        await sweep('up', 0, -1);
        await sweep('right again', 1, 0);
        fixture.destroy();
        expect(failures).toEqual([]);
      }, 120_000);
    }
  }
});
