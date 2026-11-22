import { NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { PlaysService, UserGame } from '../plays.service';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';

/** The front page of Karins jigsaw (`/jigsaw`): what it is, where to start, and the newest jigsaws as small pictures. The list of all of them is at `/jigsaw/list`. */
@Component({
  selector: 'app-jigsaw-home',
  imports: [RouterLink, NgTemplateOutlet, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './jigsaw-home.html',
})
export class JigsawHome implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly plays = inject(PlaysService);
  protected readonly users = inject(JigsawUserService);

  /** the first name of the user who plays (empty: nobody has chosen who plays yet), for the welcome */
  readonly firstName = computed(() => this.users.user()?.name.trim().split(/\s+/)[0] ?? '');
  /** how many rounds the user has going (not solved); null until they are read */
  readonly roundsGoing = signal<number | null>(null);
  /** the rounds of the user that are not solved, newest first: where they left off */
  readonly myRounds = signal<UserGame[]>([]);

  /** all the jigsaws the person may see, the newest first (the popular ones, `service.popular()`, are for later) */
  readonly jigsaws = signal<JigsawSpec[]>([]);
  readonly loaded = signal(false);
  /** the jigsaws whose picture could not be read: they get an empty box */
  readonly noPicture = signal<ReadonlySet<string>>(new Set());

  async ngOnInit(): Promise<void> {
    void this.readRounds();
    try {
      this.jigsaws.set((await this.service.list()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)));
    } catch {
      /* the front page works without the list: the person can still start a new jigsaw */
    } finally {
      this.loaded.set(true);
    }
  }

  /** The rounds of the user who plays are counted for the welcome ("You have 2 rounds going"); without a user, or if they cannot be read, the welcome is just kind. */
  private async readRounds(): Promise<void> {
    const me = await this.users.load();
    if (!me) return;
    try {
      const going = (await this.plays.ofUser(me.id)).filter((g) => g.play.status !== 'solved');
      this.myRounds.set(going);
      this.roundsGoing.set(going.length);
    } catch {
      /* the welcome works without the number */
    }
  }

  pictureUrl(item: { id: string }): string {
    return this.images.url(item.id, 1);
  }

  lacksPicture(id: string): void {
    this.noPicture.update((now) => new Set([...now, id]));
  }
}
