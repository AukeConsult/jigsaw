import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../jigsaw-user.service';

/** How long the welcome stays before it fades away, and how long the fading takes (milliseconds; the fade is the `.start-welcome` of `styles.scss`). */
export const WELCOME_STAYS_MS = 15_000;
export const WELCOME_FADES_MS = 1_000;

/**
 * The welcome at the top of the front page: the title (a welcome back by name, or the name of the app) and a line about what this is. It fades away after 15 seconds and makes
 * room for the page; the title stays for a screen reader (the page needs its heading).
 */
@Component({
  selector: 'app-start-welcome',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './start-welcome.html',
})
export class StartWelcome implements OnInit, OnDestroy {
  private readonly users = inject(JigsawUserService);

  /** the first name of the user who plays (empty: nobody has chosen who plays yet) */
  protected readonly firstName = computed(() => this.users.user()?.name.trim().split(/\s+/)[0] ?? '');
  /** the welcome is fading */
  protected readonly fading = signal(false);
  /** the welcome has faded: only the title for a screen reader is left */
  protected readonly gone = signal(false);
  private timers: ReturnType<typeof setTimeout>[] = [];

  ngOnInit(): void {
    this.timers.push(
      setTimeout(() => {
        this.fading.set(true);
        this.timers.push(setTimeout(() => this.gone.set(true), WELCOME_FADES_MS));
      }, WELCOME_STAYS_MS),
    );
  }

  ngOnDestroy(): void {
    this.timers.forEach(clearTimeout);
  }
}
