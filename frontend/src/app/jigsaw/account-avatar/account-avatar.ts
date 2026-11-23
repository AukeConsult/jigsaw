import { Component, computed, input, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/** The picture of an account, round, or the icon when it has none (or the picture cannot be read). `at` is when the picture was set (`pictureAt`): without it there is none. */
@Component({
  selector: 'app-account-avatar',
  host: { class: 'd-inline-flex align-self-center flex-shrink-0' },
  template: `
    @if (at() && !broken()) {
      <img class="rounded-circle object-fit-cover" [src]="url()" [attr.width]="pixels()" [attr.height]="pixels()" alt="" (error)="broken.set(true)">
    } @else {
      <i class="bi bi-person-circle text-primary" [class.icon-md]="size() === 'md'" [class.fs-1]="size() === 'lg'" aria-hidden="true"></i>
    }
  `,
})
export class AccountAvatar {
  readonly id = input.required<string>();
  readonly at = input<number | undefined>(undefined);
  readonly size = input<'md' | 'lg'>('md');
  protected readonly broken = signal(false);
  protected readonly pixels = computed(() => (this.size() === 'lg' ? 48 : 28));
  protected readonly url = computed(() => `${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(this.id())}/picture?v=${this.at()}`);
}
