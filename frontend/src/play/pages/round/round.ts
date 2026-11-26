import { DatePipe, Location, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CategoryTags } from '../../../app/jigsaw/category-tags/category-tags';
import { BoughtService } from '../../../app/jigsaw/bought.service';
import { FeedService } from '../../../app/jigsaw/feed.service';
import { JigsawImageService } from '../../../app/jigsaw/jigsaw-image.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PlaysService } from '../../../app/jigsaw/plays.service';
import { RoundChoice } from '../../../app/jigsaw/round-choice/round-choice';
import { snapLevelOfJigsaw } from '../../../app/jigsaw/snap-level';
import { AuthService } from '../../../app/logons/auth.service';
import { pieceGrid } from '../../../app/models/shared/jigsaw';
import { JigsawKinds } from '../../../app/models/shared/jigsaw-kind';
import { JigsawSpec } from '../../../app/models/shared/jigsaw-settings';
import { BoughtPackages } from '../../../app/models/shared/bought-package';
import { PackageItem } from '../../../app/models/shared/feed-item';
import { PlayChoice } from '../../../app/models/shared/play';

/**
 * The page of the route `/play/round/:id`, where **a card leads when it is pressed**: what comes before putting it together, with Cancel back to where the person came from.
 * - A **picture** is cut in each round, so this is the start of a round: the player chooses the number of pieces and the difficulty (the component `app-round-choice`, the same as the website's page of a picture has), and the round is
 *   started and opened (`/play/jigsaw/:id`). A picture that the player has a round going of goes straight to it.
 * - A **ready jigsaw** (cut already) is looked at first: its picture, what is told about it, and a button that opens the puzzle: Start the round, Continue (a round is going) or Look (it is solved: a jigsaw is not played twice).
 * **Anybody may look; starting a round is what asks for more.** A picture of a package the account has not got (and neither owns nor made, and any package picture when nobody plays) has **no choice and no button to start**: only the picture, a line that says so and the way to the package (the server refuses such a round too). When nobody plays, the picture and what is told about it are shown, and in place of the start the way to log on.
 */
@Component({
  selector: 'play-round',
  imports: [TranslocoDirective, RouterLink, RoundChoice, CategoryTags, DatePipe, NgTemplateOutlet],
  providers: [provideTranslocoScope('play'), provideTranslocoScope('jigsawPlay'), provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels')],
  host: { class: 'd-block' },
  templateUrl: './round.html',
})
export class PlayRound implements OnInit {
  private readonly jigsaws = inject(JigsawService);
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly auth = inject(AuthService);
  private readonly images = inject(JigsawImageService);
  private readonly bought = inject(BoughtService);
  private readonly feed = inject(FeedService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  /** what the page is: being opened, the choice of a round of a picture, the look at a ready jigsaw, a picture of a package the account has not got, the look of somebody who is not logged on, or there is no such jigsaw */
  protected readonly state = signal<'opening' | 'choose' | 'view' | 'package' | 'logon' | 'missing'>('opening');
  /** of a ready jigsaw: the player has not played it, has a round going, or has solved it */
  protected readonly played = signal<'new' | 'going' | 'solved'>('new');
  protected readonly pieces = computed(() => {
    const j = this.jigsaw();
    if (!j) return 0;
    const grid = pieceGrid(j.width, j.height, j.gridSize);
    return grid.columns * grid.rows;
  });
  protected readonly level = computed(() => (this.jigsaw() ? snapLevelOfJigsaw(this.jigsaw()!) : ''));
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
    this.jigsaw.set(jigsaw);
    const me = this.users.acting();
    if (!me) return this.state.set(jigsaw.packageId ? 'package' : 'logon'); // nobody plays: they may look
    const rounds = await this.plays.list(this.id, me.id).catch(() => []);
    const going = rounds.some((r) => r.status !== 'solved');
    // a picture of a package the account has not got: nothing to start a round with (a round that is there already is not taken away)
    if (!going && !(await this.mayStart(jigsaw, me.id))) return this.state.set('package');
    if (!JigsawKinds.isPicture(jigsaw)) {
      this.played.set(going ? 'going' : rounds.length ? 'solved' : 'new');
      return this.state.set('view');
    }
    if (going) return void (await this.router.navigate(['/play/jigsaw', this.id], { replaceUrl: true })); // a round is going: it is gone on with
    this.solved.set(rounds.filter((r) => r.status === 'solved').map((r) => r.total));
    this.state.set('choose');
  }

  /** The same rule as the server's: the account has the package of the picture, owns the picture, or owns the package (to try it out). A picture in no package is for anybody. */
  private async mayStart(jigsaw: JigsawSpec, me: string): Promise<boolean> {
    if (BoughtPackages.mayUse(jigsaw, me, await this.bought.ids(me).catch(() => new Set<string>()))) return true;
    const found = await this.feed.package(jigsaw.packageId!).catch(() => null);
    return BoughtPackages.mayUse(jigsaw, me, new Set(), (found?.item as PackageItem | undefined)?.data.ownerUid);
  }

  /** the ready jigsaw is opened: the puzzle starts a round, goes on with the one going, or shows the solved one */
  protected async openPuzzle(): Promise<void> {
    await this.router.navigate(['/play/jigsaw', this.id], { replaceUrl: true });
  }

  /** Cancel: back to the page the person came from; to the home page when this was the first page of the visit (there is nothing in the app to go back to then). */
  protected back(): void {
    if (((this.location.getState() as { navigationId?: number } | null)?.navigationId ?? 1) > 1) this.location.back();
    else void this.router.navigateByUrl('/play/list');
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
