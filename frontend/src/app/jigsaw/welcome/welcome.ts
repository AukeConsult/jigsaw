import { Component, DestroyRef, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { WELCOME_ART } from '../welcome-art';

/**
 * **Karin's welcome**, the first document of the app's info page: the almost finished jigsaws one after the other, the welcome and the three first steps (the third leads to the app's Add picture), under them a short description of how to play
 * with Help, About and Install as direct buttons, and Karin's picture with her note.
 */
@Component({
  selector: 'app-welcome',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawHome', 'guide', 'play')],
  templateUrl: './welcome.html',
})
export class Welcome {
  /** the pictures of the welcome (jigsaws almost put together), and which one is shown: they follow each other, round and round, every few seconds */
  protected readonly art = WELCOME_ART;
  protected readonly artIndex = signal(0);

  /** the text of the welcome (the title, the line and the three steps): the pictures of the almost finished jigsaws are as high as it, so their bottom edge is the bottom edge of the last step */
  private readonly welcomeText = viewChild<ElementRef<HTMLElement>>('welcomeText');
  protected readonly textHeight = signal<number | null>(null);

  constructor() {
    effect((onCleanup) => {
      const el = this.welcomeText()?.nativeElement;
      if (!el) return;
      const watch = new ResizeObserver(() => this.textHeight.set(Math.round(el.getBoundingClientRect().height)));
      watch.observe(el);
      onCleanup(() => watch.disconnect());
    });
    // round robin between the pictures (not for a person who has asked for less movement)
    if (this.art.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = setInterval(() => this.artIndex.update((i) => (i + 1) % this.art.length), 5000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }
}
