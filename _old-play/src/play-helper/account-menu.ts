import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { HelperMenu } from '../core/helper-menu';

/** The entry in the button of the account helpers, as the user entry of the website's menu is: an icon, and the name of the account that plays, or "Who is on" while nobody does. */
@Component({
  selector: 'account-menu',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  template: `<span class="d-flex align-items-center gap-2" *transloco="let t"><i class="bi bi-person-circle" aria-hidden="true"></i><span class="small">{{ users.user()?.name ?? (t('play.account.menu') || 'Who is on') }}</span></span>`,
})
export class AccountMenu extends HelperMenu {
  protected readonly users = inject(JigsawUserService);
}
