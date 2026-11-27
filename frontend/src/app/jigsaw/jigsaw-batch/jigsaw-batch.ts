import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { readPreference, writePreference } from '../../core/preferences';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawKind, JigsawKinds } from '../../models/shared/jigsaw-kind';
import { JigsawMaker, MakeStep } from '../jigsaw-maker';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { SNAP_LEVELS, SnapLevelKey } from '../snap-level';
import { CategoryTags } from '../category-tags/category-tags';
import { apiError } from '../../core/api-error';

/** How many pictures can be made into jigsaws at one time (each is cut and drawn in the browser, so many at once would take long). */
export const BATCH_MAX = 30;
/** The pieces and the widths to choose from. */
export const BATCH_PIECES = [24, 48, 96, 150, 352, 600] as const;
export const BATCH_WIDTHS = [600, 800, 1000, 1200] as const;

/** What the person chose the last time, used when the page is opened again (not the pictures, and not the language, which starts as the one the app is shown in). */
interface BatchPreferences {
  pieces: number;
  width: number;
  difficulty: SnapLevelKey;
  timed: boolean;
  /** ready jigsaws or pictures (kept before there was a choice: pictures) */
  kind?: JigsawKind;
  /** the language of the names and descriptions (none kept: the language the app is shown in) */
  language?: string;
}
const DEFAULTS: BatchPreferences = { pieces: 96, width: 800, difficulty: 'medium', timed: true, kind: 'picture' };
const isBatchPreferences = (v: unknown): v is BatchPreferences => {
  const p = v as Partial<BatchPreferences> | null;
  return !!p && typeof p === 'object' && BATCH_PIECES.some((n) => n === p.pieces) && BATCH_WIDTHS.some((n) => n === p.width) && SNAP_LEVELS.some((l) => l.key === p.difficulty) && typeof p.timed === 'boolean' && (p.kind === undefined || JigsawKinds.is(p.kind)) && (p.language === undefined || LANGUAGES.some((l) => l.code === p.language));
};
const BATCH_KEY = 'jigsaw.batch';

/** Where a picture is on its way to be a jigsaw. */
type ItemState = 'waiting' | MakeStep | 'classifying' | 'done' | 'failed';

/** One picture of the list. */
export interface BatchItem {
  id: number;
  file: File;
  /** a small picture to see it by */
  preview: string;
  state: ItemState;
  /** why it failed (or why the AI could not classify it, when the jigsaw was made) */
  problem?: string;
  /** the jigsaw, when it is made, with what the AI set on it */
  jigsaw?: JigsawSpec;
  /** the AI looked at it and the answer is on the jigsaw */
  classified?: boolean;
}

/**
 * Many jigsaws at once (`/play/mine/many`, and the page of a package; for a publisher or an admin): how many pieces and how hard, then many pictures chosen from the computer at one time. Each picture is made into a
 * jigsaw (cut to its shape and cut into pieces, `JigsawMaker`) one after the other, and the AI is asked for its categories, name and description, which are put on the jigsaw. The
 * owner is the user who plays. A picture that could not be made says why, the others go on; the AI failing leaves the jigsaw made.
 */
@Component({
  selector: 'app-jigsaw-batch',
  imports: [FormsModule, RouterLink, TranslocoDirective, CategoryTags],
  providers: [provideTranslocoScope('jigsawBatch')],
  templateUrl: './jigsaw-batch.html',
})
export class JigsawBatch implements OnDestroy {
  /** the pictures belong to this package: only pictures are made (no size, pieces or difficulty), each linked to the package, and the package page (which frames this) is told after each (`madeOne`) */
  readonly packageId = input<string | undefined>(undefined);
  readonly madeOne = output<JigsawSpec>();

  private readonly maker = inject(JigsawMaker);
  private readonly jigsaws = inject(JigsawService);
  private readonly users = inject(JigsawUserService);

  private readonly saved = readPreference(BATCH_KEY, DEFAULTS, isBatchPreferences);
  readonly pieces = signal(this.saved.pieces);
  readonly width = signal(this.saved.width);
  readonly difficulty = signal<SnapLevelKey>(this.saved.difficulty);
  readonly timed = signal(this.saved.timed);
  /** ready jigsaws (cut into pieces here) or pictures (cut in each round: no pieces, size or difficulty are chosen here) */
  readonly kind = signal<JigsawKind>(this.saved.kind ?? 'picture');
  readonly isPicture = computed(() => !!this.packageId() || this.kind() === 'picture');
  /** the language of the names and descriptions: the one chosen last, the language the app is shown in to begin with */
  readonly language = signal(this.saved.language ?? inject(LanguageService).lang());

  protected readonly pieceChoices = BATCH_PIECES;
  protected readonly widthChoices = BATCH_WIDTHS;
  protected readonly levels = SNAP_LEVELS;
  protected readonly languages = LANGUAGES;
  protected readonly max = BATCH_MAX;

  readonly items = signal<BatchItem[]>([]);
  /** how many of the files that were chosen were left out: not pictures, and more than the list can take */
  readonly leftOut = signal({ notPictures: 0, tooMany: 0 });
  readonly running = signal(false);
  private stopping = false;
  private next = 0;

  /** how many are waiting to be made */
  readonly waiting = computed(() => this.items().filter((i) => i.state === 'waiting').length);
  readonly made = computed(() => this.items().filter((i) => i.jigsaw).length);
  readonly classified = computed(() => this.items().filter((i) => i.classified).length);
  readonly failed = computed(() => this.items().filter((i) => i.state === 'failed').length);
  /** something was done: the summary is shown */
  readonly finished = computed(() => !this.running() && this.items().length > 0 && this.waiting() === 0);

  constructor() {
    // what is chosen is kept on the device
    effect(() => writePreference(BATCH_KEY, { pieces: this.pieces(), width: this.width(), difficulty: this.difficulty(), timed: this.timed(), kind: this.kind(), language: this.language() } satisfies BatchPreferences));
  }

  /** The files that were chosen are put on the list (only pictures, and no more than `BATCH_MAX` in all). */
  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = [...(input.files ?? [])];
    input.value = ''; // the same files can be chosen again
    const pictures = chosen.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    const room = Math.max(0, BATCH_MAX - this.items().length);
    const taken = pictures.slice(0, room);
    this.leftOut.set({ notPictures: chosen.length - pictures.length, tooMany: pictures.length - taken.length });
    this.items.update((now) => [...now, ...taken.map((file) => ({ id: ++this.next, file, preview: URL.createObjectURL(file), state: 'waiting' as ItemState }))]);
  }

  /** A picture that has not been made is taken off the list. */
  remove(item: BatchItem): void {
    if (item.state !== 'waiting' && item.state !== 'failed') return;
    URL.revokeObjectURL(item.preview);
    this.items.update((now) => now.filter((i) => i !== item));
  }

  /** The list is emptied (what was made stays made). */
  clear(): void {
    if (this.running()) return;
    for (const item of this.items()) URL.revokeObjectURL(item.preview);
    this.items.set([]);
    this.leftOut.set({ notPictures: 0, tooMany: 0 });
  }

  stop(): void {
    this.stopping = true;
  }

  private change(item: BatchItem, change: Partial<BatchItem>): void {
    this.items.update((now) => now.map((i) => (i.id === item.id ? { ...i, ...change } : i)));
  }

  /**
   * Makes something of each picture that waits, one after the other: a ready jigsaw (cut into pieces here) or, when the choice is pictures, a stored picture (each round cuts it).
   * Either way the AI looks at it and sets its categories, name and description.
   */
  async start(): Promise<void> {
    const kind: JigsawKind = this.isPicture() ? 'picture' : 'jigsaw';
    const me = this.users.user();
    if (!me || this.running()) return;
    this.running.set(true);
    this.stopping = false;
    const snapPercent = SNAP_LEVELS.find((l) => l.key === this.difficulty())?.percent ?? 25;
    try {
      for (const item of this.items().filter((i) => i.state === 'waiting' || i.state === 'failed')) {
        if (this.stopping) break;
        this.change(item, { state: 'cutting', problem: undefined });
        let jigsaw: JigsawSpec;
        try {
          jigsaw = await this.maker.make(item.file, me, { kind, pieces: this.pieces(), width: this.width(), snapPercent, timed: this.timed(), language: this.language(), packageId: this.packageId() }, (step) => this.change(item, { state: step }));
        } catch (err) {
          this.change(item, { state: 'failed', problem: reasonOf(err) });
          continue;
        }
        this.change(item, { state: 'classifying', jigsaw });
        this.madeOne.emit(jigsaw);
        try {
          const found = await this.jigsaws.classify(jigsaw.id, true);
          this.change(item, {
            state: 'done',
            classified: true,
            jigsaw: { ...jigsaw, ...(found.name ? { name: found.name } : {}), ...(found.description ? { description: found.description } : {}), ...(found.categories.length ? { categories: found.categories } : {}), ...(found.motive ? { motive: found.motive } : {}) },
          });
        } catch (err) {
          this.change(item, { state: 'done', problem: reasonOf(err) }); // the jigsaw is made: only the AI did not
        }
      }
    } finally {
      this.running.set(false);
    }
  }

  ngOnDestroy(): void {
    for (const item of this.items()) URL.revokeObjectURL(item.preview);
  }
}

/** Why something failed, in words (the API says why when it can). */
function reasonOf(err: unknown): string {
  if (err instanceof HttpErrorResponse) return apiError(err) ?? `${err.status} ${err.statusText}`.trim();
  return err instanceof Error ? err.message : 'Something went wrong.';
}
