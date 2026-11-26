import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { AdminBanner } from '../../app/jigsaw/admin-banner/admin-banner';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { PlayLook } from '../../app/jigsaw/play-look';
import { TextLook } from '../../app/jigsaw/text-look';
import { PartSizeChoice } from '../../app/jigsaw/part-sizes';
import { TileDetails } from '../../app/jigsaw/tile-details';
import { AuthService } from '../../app/logons/auth.service';
import { PlayMenuItem } from '../helper/menus';
import { rememberPage } from '../last-page';
import { PlayFrame } from '../play-frame/play-frame';
import { menuOfRoute } from '../play-route';

/**
 * The main page of the app: **one router outlet, for the page that is open, and the frame that lies over it and shows the helper.** Main is what finds out whether a user is logged on (a user is logged on when an account plays) and gives
 * the helper, which is always there in the frame, its menu: the menu that goes with the page that is open (every route carries one), for who is logged on. It finds out as it is shown (`ngOnInit`: the earlier login is restored and
 * the account that played last is read), and gives the menu again whenever the page or the answer changes. Until it knows the helper has no menu and is not shown. It also says the theme of the app and the size and font of its text and the sizes of its tiles and labels (`data-table`, `data-text-size`, `data-font`, `data-tiles`, `data-labels`, and `data-tile-details`: the account's preferences).
 */
@Component({
  selector: 'play-main',
  imports: [RouterOutlet, PlayFrame, AdminBanner],
  host: { class: 'd-block', '[attr.data-table]': 'look.table()', '[attr.data-text-size]': 'text.value().size', '[attr.data-font]': 'text.value().font', '[attr.data-tiles]': 'sizes.tileSize.value()', '[attr.data-labels]': 'sizes.labelSize.value()', '[attr.data-tile-details]': 'details.shown()' },
  template: '<app-admin-banner [inApp]="true" /><router-outlet></router-outlet><play-frame [menu]="menu()" />',
})
export class PlayMain implements OnInit {
  /** the theme of the app, the account's preference: the stylesheet paints it behind the pages and the menu */
  protected readonly look = inject(PlayLook);
  /** how big the text is and in which letters, said the same way */
  protected readonly text = inject(TextLook);
  /** how big the picture tiles and the small labels are */
  protected readonly sizes = inject(PartSizeChoice);
  /** whether the picture tiles tell their details */
  protected readonly details = inject(TileDetails);
  private readonly auth = inject(AuthService);
  private readonly users = inject(JigsawUserService);
  private readonly router = inject(Router);

  /** the menu that goes with the page that is open (its route carries it) */
  private readonly pageMenu = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      tap(() => rememberPage(this.router.url)), // a section is opened again where the person was in it
      map(() => menuOfRoute(this.router)),
    ),
    { initialValue: menuOfRoute(this.router) },
  );

  /** main has found out who is logged on */
  private readonly known = signal(false);

  /** the menu of the helper now: none while main finds out, then the menu of the page that is open, for nobody or for the user who plays (it may be none: the helper is not shown) */
  protected readonly menu = computed<readonly PlayMenuItem[] | null>(() => (this.known() ? this.pageMenu()(this.users.acting(), { levels: this.users.mayOpenLevels(), publish: this.users.mayPublish() }) : null));

  async ngOnInit(): Promise<void> {
    await this.auth.ready; // the earlier login is restored first (an account that is locked needs it)
    try {
      await this.users.load(); // the account that played last is read
    } finally {
      this.known.set(true);
    }
  }
}
