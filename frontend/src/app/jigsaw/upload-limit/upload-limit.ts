import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { AccountLimits, UNVERIFIED_PICTURES_MAX } from '../../models/shared/account-limits';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';

/**
 * Over the Save button of a new picture or jigsaw: **what an account that is not verified has left of its uploaded pictures** (`AccountLimits`), with the way to verify the account; when it is full it says so and `full` is
 * true, so the form does not offer to save. Nothing for a verified account or an admin. The API refuses by itself: this only says why before the person tries. Used by the form of the app and of the website.
 */
@Component({
  selector: 'app-upload-limit',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawNew')],
  host: { class: 'd-block' },
  template: `
    <ng-container *transloco="let t">
      @if (shown()) {
        <div class="alert py-2 small text-center" [class.alert-warning]="full()" [class.alert-info]="!full()" role="status">
          @if (full()) {
            {{ t('jigsawNew.limitFull', { max }) || 'You have ' + max + ' pictures, the most an account that is not verified can have. Verify your account, or delete a picture.' }}
          } @else {
            {{ t('jigsawNew.limitCount', { count: count(), max }) || count() + ' of ' + max + ' pictures used. A verified account has no limit.' }}
          }
          <a class="alert-link ms-1" [routerLink]="inApp() ? '/play/account' : '/account'">{{ t('jigsawNew.limitVerify') || 'Verify your account' }}</a>
        </div>
      }
    </ng-container>
  `,
})
export class UploadLimit {
  private readonly users = inject(JigsawUserService);
  private readonly jigsaws = inject(JigsawService);
  /** a new picture is being made (a change of one that is there adds none) */
  readonly adding = input(true);
  /** the form is that of the app */
  readonly inApp = input(false);
  protected readonly max = UNVERIFIED_PICTURES_MAX;
  /** how many uploaded pictures the account has (null: not read, or the account has no limit) */
  protected readonly count = signal<number | null>(null);
  /** the account that has a limit: one that plays, is not verified, and is no admin */
  private readonly limited = computed(() => {
    const me = this.users.acting();
    return me && !this.users.isAdmin() && !AccountLimits.verified(me) ? me.id : null;
  });
  protected readonly shown = computed(() => this.adding() && !!this.limited() && this.count() !== null);
  /** no more picture can be added */
  readonly full = computed(() => this.shown() && this.count()! >= this.max);

  constructor() {
    effect(() => {
      const id = this.limited();
      untracked(() => {
        this.count.set(null);
        if (id) void this.jigsaws.mineSearch(id, { sort: 'new', limit: 1, page: 1 }).then((found) => this.count.set(found.counts.all), () => this.count.set(null));
      });
    });
  }
}
