import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { readSession, writeSession } from '../../core/session-storage';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawService } from '../jigsaw.service';
import { CanvasSpec } from '../../models/shared/canvas';
import { pieceGrid } from '../../models/shared/jigsaw';

/** The saved jigsaws of Karins jigsaw: open one to play it, delete one, or go and make a new one. */
@Component({
  selector: 'app-jigsaw-list',
  imports: [RouterLink, NgTemplateOutlet, DatePipe],
  templateUrl: './jigsaw-list.html',
})
export class JigsawList implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);

  /** how the jigsaws are shown, as a list or as cards; kept for the session */
  readonly view = signal<'list' | 'cards'>(readSession('jigsaw.listView', 'list', (v): v is 'list' | 'cards' => v === 'list' || v === 'cards'));
  /** the jigsaws whose picture could not be read (no picture: an empty box is shown) */
  readonly noPicture = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => writeSession('jigsaw.listView', this.view()));
  }

  /** where the picture of a jigsaw is read */
  pictureUrl(item: CanvasSpec): string {
    return this.images.url(item.id, 1);
  }

  /** The picture of this jigsaw is not there (a jigsaw can be made without one): its box is empty. */
  lacksPicture(id: string): void {
    this.noPicture.update((now) => new Set([...now, id]));
  }

  readonly items = signal<CanvasSpec[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.items.set(await this.service.list());
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** how many pieces the jigsaw is cut into: the cells of its grid */
  pieces(item: CanvasSpec): { columns: number; rows: number } {
    return pieceGrid(item.width, item.height, item.gridSize);
  }
}

