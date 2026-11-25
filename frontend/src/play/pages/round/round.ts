import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawImageService } from '../../../app/jigsaw/jigsaw-image.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PlaysService } from '../../../app/jigsaw/plays.service';
import { RoundChoice } from '../../../app/jigsaw/round-choice/round-choice';
import { AuthService } from '../../../app/logons/auth.service';
import { JigsawKinds } from '../../../app/models/shared/jigsaw-kind';
import { JigsawSpec } from '../../../app/models/shared/jigsaw-settings';
import { PlayChoice } from '../../../app/models/shared/play';

/**
 * The page of the route `/play/round/:id`, where a **picture** leads when it is pressed: **the start of a round**. A picture is cut in each round, so the player chooses the number of pieces and the difficulty (the component
 * `app-round-choice`, the same as the website's page of a picture has), and the round is started and opened (`/play/jigsaw/:id`). A picture that the player has a round going of goes straight to it, and a ready jigsaw (which has its
 * cut already) goes to its puzzle. Nobody plays: the account is asked for first.
 */
@Component({
  selector: 'play-round',
  imports: [TranslocoDirective, RouterLink, RoundChoice],
  providers: [provideTranslocoScope('play'), provideTranslocoScope('jigsawPlay')],
  host: { class: 'd-block' },
  templateUrl: './round.html',
})
export class PlayRound implements OnInit {
  private readonly jigsaws = inject(JigsawService);
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly auth = inject(AuthService);
  private readonly images = inject(JigsawImageService);
  private readonly router = inject(Router);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  /** what the page is: being opened, the choice, an account is needed first, or there is no such jigsaw */
  protected readonly state = signal<'opening' | 'choose' | 'logon' | 'missing'>('opening');
  protected readonly jigsaw = signal<JigsawSpec | null>(null);
  /** the numbers of pieces the player has solved this picture at (not offered again) */
  protected readonly solved = signal<readonly number[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly noPicture = signal(false);
  protected readonly pictureUrl = computed(() => (this.jigsaw() ? this.images.url(this.jigsaw()!, 1) : ''));

  async ngOnInit(): Promise<void> {
    await this.users.load();
    await this.auth.ready; // a sign-in of an earlier visit is restored first
    const jigsaw = await this.jigsaws.get(this.id).catch(() => null);
    if (!jigsaw) return this.state.set('missing');
    if (!JigsawKinds.isPicture(jigsaw)) return void (await this.router.navigate(['/play/jigsaw', this.id], { replaceUrl: true })); // a ready jigsaw is cut already
    this.jigsaw.set(jigsaw);
    const me = this.users.acting();
    if (!me) return this.state.set('logon');
    const rounds = await this.plays.list(this.id, me.id).catch(() => []);
    if (rounds.some((r) => r.status !== 'solved')) return void (await this.router.navigate(['/play/jigsaw', this.id], { replaceUrl: true })); // a round is going: it is gone on with
    this.solved.set(rounds.filter((r) => r.status === 'solved').map((r) => r.total));
    this.state.set('choose');
  }

  /** The player chose the number of pieces and the difficulty: the round is started, and opened. */
  protected async start(choice: PlayChoice): Promise<void> {
    const me = this.users.acting();
    if (!me || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const round = await this.plays.start(this.id, me.id, choice);
      await this.router.navigate(['/play/jigsaw', this.id], { queryParams: { round: round.id }, replaceUrl: true }); // a round with no piece moved is not in the lists: the puzzle is told which one to open
    } catch (err) {
      this.error.set((err as { error?: { error?: string } })?.error?.error || 'Could not start a round: try again.');
      this.busy.set(false);
    }
  }
}
