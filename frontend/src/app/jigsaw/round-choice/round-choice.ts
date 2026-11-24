import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { readPreference, writePreference } from '../../core/preferences';
import { JigsawCut } from '../../models/shared/jigsaw';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { Plays, PlayChoice } from '../../models/shared/play';
import { SNAP_LEVELS, snapPercentOf } from '../snap-level';

/** What a person chose last time for a round of a picture, kept on this device (rule 12): the number of pieces and the difficulty. */
const ROUND_DEFAULTS_KEY = 'jigsaw.roundDefaults';
interface RoundDefaults {
  pieces: number;
  snapPercent: number;
  /** whether the round is timed (a choice kept before there was one has none: timed) */
  timed?: boolean;
}
const isRoundDefaults = (v: unknown): v is RoundDefaults => !!v && typeof v === 'object' && Number.isInteger((v as RoundDefaults).pieces) && (v as RoundDefaults).pieces > 0 && SNAP_LEVELS.some((l) => l.percent === (v as RoundDefaults).snapPercent) && ((v as RoundDefaults).timed === undefined || typeof (v as RoundDefaults).timed === 'boolean');
const FIRST_TIME: RoundDefaults = { pieces: 24, snapPercent: 25 };

/**
 * The choice at the start of a round of a picture: the number of pieces (the numbers that fit the shape of the picture, `JigsawCut.pieceChoices`; the sizes the person has solved are left out
 * of the choice) and the difficulty. It starts as the person chose last time (`jigsaw.roundDefaults`), and what is chosen is kept when the round is started. It only says what was chosen:
 * the page starts the round.
 */
@Component({
  selector: 'app-round-choice',
  imports: [FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawNew')],
  templateUrl: './round-choice.html',
})
export class RoundChoice {
  readonly jigsaw = input.required<JigsawSpec>();
  /** the numbers of pieces the person has solved this picture at (not offered again) */
  readonly solved = input<readonly number[]>([]);
  readonly busy = input(false);

  readonly chosen = output<PlayChoice>();
  readonly cancelled = output<void>();

  protected readonly levels = SNAP_LEVELS;
  /** the numbers of pieces offered for the shape of this picture, the smallest first (the key is `columns x rows`) */
  protected readonly options = computed(() => JigsawCut.pieceChoices(this.jigsaw().width, this.jigsaw().height).map((c) => ({ ...c, key: `${c.columns}x${c.rows}`, solved: this.solved().includes(c.count) })));

  private readonly last = readPreference(ROUND_DEFAULTS_KEY, FIRST_TIME, isRoundDefaults);
  /** the number of pieces the person picked in the list (none yet: the nearest offered to the last choice that was not solved is shown) and the difficulty in percent */
  private readonly picked = signal<string | null>(null);
  protected readonly snapPercent = signal(this.last.snapPercent);
  /** whether the round has a clock (it starts as it was last time, and as the picture says if it has none) */
  private readonly timedPicked = signal<boolean | null>(null);
  protected readonly timed = computed(() => this.timedPicked() ?? (this.last.timed !== false && this.jigsaw().timed !== false));

  protected setTimed(on: boolean): void {
    this.timedPicked.set(on);
  }
  protected readonly key = computed(() => {
    if (this.picked()) return this.picked()!;
    const near = Plays.choiceNear(this.options(), this.last.pieces, this.solved());
    return near ? `${near.columns}x${near.rows}` : '';
  });

  protected setPieces(key: string): void {
    this.picked.set(key);
  }

  protected readonly selected = computed(() => this.options().find((o) => o.key === this.key()) ?? null);
  protected readonly canStart = computed(() => !!this.selected() && !this.selected()!.solved && !this.busy());

  protected setLevel(key: string): void {
    const percent = snapPercentOf(key);
    if (percent !== null) this.snapPercent.set(percent);
  }

  protected level(): string {
    return SNAP_LEVELS.find((l) => l.percent === this.snapPercent())?.key ?? 'medium';
  }

  protected go(): void {
    const o = this.selected();
    if (!o || !this.canStart()) return;
    writePreference(ROUND_DEFAULTS_KEY, { pieces: o.count, snapPercent: this.snapPercent(), ...(this.timed() ? {} : { timed: false }) } satisfies RoundDefaults);
    this.chosen.emit({ columns: o.columns, rows: o.rows, snapPercent: this.snapPercent(), ...(this.timed() ? {} : { timed: false }) });
  }
}
