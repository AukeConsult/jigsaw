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
  /** the popular jigsaws, the best first (the server ranks them) */
  protected readonly popular = signal<JigsawSpec[]>([]);

  async ngOnInit(): Promise<void> {
    void this.readRounds();
    try {
      this.popular.set(await this.service.popular());
    } catch {
      /* the page works without the list: the person can still start a new jigsaw */
    }
  }

  private async readRounds(): Promise<void> {
    const me = await this.users.load();
    if (!me) return;
    try {
      // a round only names its jigsaw, so the cards are made from the list, one card for each jigsaw with a round going
      const going = new Set((await this.plays.ofUser(me.id)).filter((g) => g.play.status !== 'solved').map((g) => g.jigsaw.id));
      this.myRounds.set((await this.service.list()).filter((j) => going.has(j.id)));
    } catch {
      /* no rounds shown */
    }
  }

  protected firstName(): string {
    return this.users.user()?.name.trim().split(/\s+/)[0] ?? '';
  }
}
