import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawService } from '../jigsaw.service';
import { CanvasSpec } from '../../models/shared/canvas';
import { pieceGrid } from '../../models/shared/jigsaw';

/** How many of the newest jigsaws the front page shows. */
const RECENT = 3;

/** The front page of Karins jigsaw (`/jigsaw`): what it is, where to start, and the newest jigsaws to go on with. The list of all of them is at `/jigsaw/list`. */
@Component({
  selector: 'app-jigsaw-home',
  imports: [RouterLink, DatePipe],
  templateUrl: './jigsaw-home.html',
})
export class JigsawHome implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);

  /** the newest jigsaws (the API gives the newest first) */
  readonly recent = signal<CanvasSpec[]>([]);
  readonly loaded = signal(false);
  /** the jigsaws whose picture could not be read: they get an empty box */
  readonly noPicture = signal<ReadonlySet<string>>(new Set());

  async ngOnInit(): Promise<void> {
    try {
      this.recent.set((await this.service.list()).slice(0, RECENT));
    } catch {
      /* the front page works without the list: the person can still start a new jigsaw */
    } finally {
      this.loaded.set(true);
    }
  }

  pictureUrl(item: CanvasSpec): string {
    return this.images.url(item.id, 1);
  }

  lacksPicture(id: string): void {
    this.noPicture.update((now) => new Set([...now, id]));
  }

  /** how many pieces the jigsaw is cut into */
  pieces(item: CanvasSpec): number {
    const grid = pieceGrid(item.width, item.height, item.gridSize);
    return grid.columns * grid.rows;
  }
}
