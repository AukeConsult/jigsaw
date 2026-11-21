import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JigsawService } from '../jigsaw.service';
import { CanvasSpec } from '../../models/shared/canvas';
import { pieceGrid } from '../../models/shared/jigsaw';

/** The saved jigsaws of Karins jigsaw: open one to play it, delete one, or go and make a new one. */
@Component({
  selector: 'app-jigsaw-list',
  imports: [RouterLink],
  templateUrl: './jigsaw-list.html',
})
export class JigsawList implements OnInit {
  private readonly service = inject(JigsawService);

  readonly items = signal<CanvasSpec[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly message = signal<{ kind: 'success' | 'danger'; text: string } | null>(null);
  /** the jigsaw whose Delete button was pressed and waits for "Yes" (deleting is for good: its pieces and picture go too) */
  readonly confirmingId = signal<string | null>(null);

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

  async remove(item: CanvasSpec): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.service.remove(item.id);
      this.items.update((list) => list.filter((c) => c.id !== item.id));
      this.message.set({ kind: 'success', text: `Deleted "${item.name}".` });
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not delete the jigsaw.' });
    }
  }
}

