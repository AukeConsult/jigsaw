import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { MyRounds } from '../my-rounds/my-rounds';

/** The new front page, at `/`: a short welcome with the two ways to start, the user's open rounds, and the popular jigsaws as cards. The older front page stays at `/jigsaw`. */
@Component({
  selector: 'app-jigsaw-front',
  imports: [RouterLink, TranslocoDirective, JigsawCard, MyRounds],
  // no browser menu on a right click or a long press anywhere on this page (it lives only while the page is open)
  host: { class: 'd-block', '(document:contextmenu)': '$event.preventDefault()' },
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './jigsaw-front.html',
})
export class JigsawFront implements OnInit {
  private readonly service = inject(JigsawService);
  protected readonly users = inject(JigsawUserService);

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
  }

  protected firstName(): string {
    return this.users.user()?.name.trim().split(/\s+/)[0] ?? '';
  }
}
