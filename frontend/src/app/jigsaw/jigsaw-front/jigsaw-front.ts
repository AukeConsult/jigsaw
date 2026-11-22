import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { PlaysService } from '../plays.service';

/** The new front page, at `/`: a short welcome with the two ways to start, the user's open rounds, and the popular jigsaws as cards. The older front page stays at `/jigsaw`. */
@Component({
  selector: 'app-jigsaw-front',
  imports: [RouterLink, TranslocoDirective, JigsawCard],
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './jigsaw-front.html',
})
export class JigsawFront implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly plays = inject(PlaysService);
  protected readonly users = inject(JigsawUserService);

  /** the jigsaws the user has a round going on (not solved) */
  protected readonly myRounds = signal<JigsawSpec[]>([]);
  /** every jigsaw the person may see: the popular ones first (the server ranks them), then the rest */
  protected readonly all = signal<JigsawSpec[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const [list, popular] = await Promise.all([this.service.list(), this.service.popular().catch(() => [] as JigsawSpec[])]);
      const rank = new Map(popular.map((j, i) => [j.id, i]));
      this.all.set([...list].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)));
    } catch {
      /* the page works without the list: the person can still start a new jigsaw */
    }
    void this.readRounds();
  }

  private async readRounds(): Promise<void> {
    const me = await this.users.load();
    if (!me) return;
    try {
      // a round only names its jigsaw, so the cards come from the list, one for each jigsaw with a round going
      const going = new Set((await this.plays.ofUser(me.id)).filter((g) => g.play.status !== 'solved').map((g) => g.jigsaw.id));
      this.myRounds.set(this.all().filter((j) => going.has(j.id)));
    } catch {
      /* no rounds shown */
    }
  }

  protected firstName(): string {
    return this.users.user()?.name.trim().split(/\s+/)[0] ?? '';
  }
}
