import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { AccountLimits, PRIVATE_PICTURES_MAX, UNVERIFIED_PICTURES_MAX } from '../../models/shared/account-limits';
import { UserLevels } from '../../models/shared/user-level';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';

/**
 * Over the Save button of a new picture or jigsaw: **what an account that is not verified has left of its uploaded pictures** (`AccountLimits`), with the way to verify the account; when it is full it says so and `full` is
 * true, so the form does not offer to save. A **verified user who is no publisher** is told the same of the pictures that are not public. Nothing for a publisher or an admin. The API refuses by itself: this only says why before the person tries. Used by the form of a picture (`play-picture-form`).
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
          @if (privateOnly()) {
            @if (full()) {
              {{ t('jigsawNew.privateFull', { max: max() }) || 'You have ' + max() + ' pictures that are not public, the most you can have. Delete one to add another.' }}
            } @else {
              {{ t('jigsawNew.privateCount', { count: count(), max: max() }) || count() + ' of ' + max() + ' private pictures used.' }}
            }
          } @else {
            @if (full()) {
              {{ t('jigsawNew.limitFull', { max: max() }) || 'You have ' + max() + ' pictures, the most an account that is not verified can have. Verify your account, or delete a picture.' }}
            } @else {
              {{ t('jigsawNew.limitCount', { count: count(), max: max() }) || count() + ' of ' + max() + ' pictures used.' }}
            }
            <a class="alert-link ms-1" routerLink="/play/account">{{ t('jigsawNew.limitVerify') || 'Verify your account' }}</a>
          }
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
  /** the limit is the one on pictures that are not public (a verified user), not the one of an account that is not verified */
  protected readonly privateOnly = computed(() => !!this.users.acting() && AccountLimits.verified(this.users.acting()));
  protected readonly max = computed(() => (this.privateOnly() ? PRIVATE_PICTURES_MAX : UNVERIFIED_PICTURES_MAX));
  /** how many uploaded pictures the account has (null: not read, or the account has no limit) */
  protected readonly count = signal<number | null>(null);
  /** the account that has a limit: one that plays and is no admin; of the verified ones, those who are no publisher */
  private readonly limited = computed(() => {
    const me = this.users.acting();
    return me && !this.users.isAdmin() && !(AccountLimits.verified(me) && UserLevels.mayPublish(this.users.level())) ? me.id : null;
  });
  protected readonly shown = computed(() => this.adding() && !!this.limited() && this.count() !== null);
  /** no more picture can be added */
  readonly full = computed(() => this.shown() && this.count()! >= this.max());

  constructor() {
    effect(() => {
      const id = this.limited();
      untracked(() => {
        this.count.set(null);
        if (id) void this.jigsaws.mineSearch(id, { sort: 'new', limit: 1, page: 1 }).then((found) => this.count.set(this.privateOnly() ? found.counts.owner + found.counts.hidden : found.counts.all), () => this.count.set(null));
      });
    });
  }
}
