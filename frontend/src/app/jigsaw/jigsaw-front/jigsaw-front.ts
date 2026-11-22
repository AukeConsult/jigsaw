import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawFinder } from '../jigsaw-finder/jigsaw-finder';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { MyRounds } from '../my-rounds/my-rounds';

/** The new front page, at `/`: a short welcome with the two ways to start, the user's open rounds, and the finder, where the jigsaws are looked for and picked. The older front page stays at `/jigsaw`. */
@Component({
  selector: 'app-jigsaw-front',
  imports: [RouterLink, TranslocoDirective, JigsawFinder, MyRounds],
  host: { class: 'd-block' },
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './jigsaw-front.html',
})
export class JigsawFront implements OnInit {
  private readonly service = inject(JigsawService);
  protected readonly users = inject(JigsawUserService);

  /** every jigsaw the person may see (the open rounds of the user are shown with their jigsaw) */
  protected readonly all = signal<JigsawSpec[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      this.all.set(await this.service.list());
    } catch {
      /* the page works without the list: the person can still start a new jigsaw */
    }
  }

  protected firstName(): string {
    return this.users.user()?.name.trim().split(/\s+/)[0] ?? '';
  }
}
