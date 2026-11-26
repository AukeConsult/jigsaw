import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * A bar that must stay on ONE line (the menu, the helper bar of a round): the words in it are shown only while everything fits on one line. It measures instead of guessing from the width of the
 * screen: first everything is shown; if the bar then wraps, the words of the buttons are hidden (`fit-1`: the icons stay, and the words stay for a screen reader); if it still wraps, the name
 * beside the logo goes too (`fit-2`). What the classes hide is in `styles.scss` (`.fit-label`, `.nav-label`, `.brand-text`). It measures again whenever the bar or what is in it changes size or text.
 */
@Directive({ selector: '[appLabelFit]' })
export class LabelFit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private timer = 0;

  constructor() {
    afterNextRender(() => {
      const schedule = () => {
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.fit(), 0); // not a frame: a page that is not on the screen has none, and the bar still has to be right when it is shown
      };
      const resize = new ResizeObserver(schedule);
      resize.observe(this.host);
      const mutation = new MutationObserver(schedule);
      mutation.observe(this.host, { childList: true, subtree: true, characterData: true });
      window.addEventListener('resize', schedule);
      schedule();
      this.destroyRef.onDestroy(() => {
        clearTimeout(this.timer);
        resize.disconnect();
        mutation.disconnect();
        window.removeEventListener('resize', schedule);
      });
    });
  }

  /** Whether the bar has more than one line: two things in it that do not share a line (one begins under where another ends). */
  private wraps(): boolean {
    if (getComputedStyle(this.host).flexDirection === 'column') return false; // a bar down a side: one thing under the other is how it is
    const boxes = [...this.host.children].filter((c) => getComputedStyle(c).position !== 'absolute').map((c) => c.getBoundingClientRect()) // what lies on the bar, out of its row, is no line of it
      .filter((r) => r.width > 0 && r.height > 0);
    if (boxes.length < 2) return false;
    return Math.max(...boxes.map((r) => r.top)) >= Math.min(...boxes.map((r) => r.bottom)) - 0.5;
  }

  private fit(): void {
    const classes = this.host.classList;
    classes.remove('fit-1', 'fit-2');
    if (!this.wraps()) return;
    classes.add('fit-1');
    if (this.wraps()) classes.add('fit-2');
  }
}
