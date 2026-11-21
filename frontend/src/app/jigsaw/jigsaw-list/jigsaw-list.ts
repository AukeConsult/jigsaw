import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { readPreference, writePreference } from '../../core/preferences';
import { contributorsOf, madeBy } from '../contributors';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { CanvasSpec } from '../../models/shared/canvas';
import { pieceGrid } from '../../models/shared/jigsaw';
import { snapLevelOfJigsaw } from '../snap-level';

/** What the person chose on this page, kept on the device and used when the page is opened again. */
interface ListPreferences {
  /** shown as a list or as cards */
  view: 'list' | 'cards';
  /** the contributor whose jigsaws are shown (null: everybody's) */
  contributor: string | null;
  /** the choice of contributors is open */
  choosing: boolean;
}

const LIST_PREFERENCES_KEY = 'jigsaw.list';
const DEFAULT_PREFERENCES: ListPreferences = { view: 'list', contributor: null, choosing: false };

const isListPreferences = (v: unknown): v is ListPreferences => {
  const p = v as Partial<ListPreferences> | null;
  return !!p && typeof p === 'object' && (p.view === 'list' || p.view === 'cards') && (p.contributor === null || typeof p.contributor === 'string') && typeof p.choosing === 'boolean';
};

/** The saved jigsaws of Karins jigsaw: open one to play it, delete one, or go and make a new one. */
@Component({
  selector: 'app-jigsaw-list',
  imports: [RouterLink, NgTemplateOutlet, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-list.html',
})
export class JigsawList implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  protected readonly users = inject(JigsawUserService);

  /** what was chosen the last time the page was open */
  private readonly saved = readPreference(LIST_PREFERENCES_KEY, DEFAULT_PREFERENCES, isListPreferences);

  /** how the jigsaws are shown, as a list or as cards */
  readonly view = signal<'list' | 'cards'>(this.saved.view);
  /** the jigsaws whose picture could not be read (no picture: an empty box is shown) */
  readonly noPicture = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // the choices are kept on the device each time one changes
    effect(() => writePreference(LIST_PREFERENCES_KEY, { view: this.view(), contributor: this.contributor(), choosing: this.choosing() } satisfies ListPreferences));
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
  /** who has made jigsaws (for the choice of a contributor), and the one chosen: null shows everybody's */
  readonly contributors = computed(() => contributorsOf(this.items()));
  readonly contributor = signal<string | null>(this.saved.contributor);
  readonly chosen = computed(() => this.contributors().find((c) => c.key === this.contributor()) ?? null);
  /** the choice of contributors is open */
  readonly choosing = signal(this.saved.choosing);
  /** the jigsaws that are shown: all, or those of the chosen contributor */
  readonly shown = computed(() => madeBy(this.items(), this.chosen() ? this.contributor() : null));
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

  /** Shows the jigsaws one contributor made (and closes the choice), or everybody's when none is given. */
  choose(key: string | null): void {
    this.contributor.set(key);
    this.choosing.set(false);
  }

  /** the difficulty of the jigsaw (hard, medium or easy) */
  level(item: CanvasSpec): string {
    return snapLevelOfJigsaw(item);
  }

  /** how many pieces the jigsaw is cut into: the cells of its grid */
  pieces(item: CanvasSpec): { columns: number; rows: number } {
    return pieceGrid(item.width, item.height, item.gridSize);
  }
}

