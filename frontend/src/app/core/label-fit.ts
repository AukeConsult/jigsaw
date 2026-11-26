import { DestroyRef, Directive, ElementRef, afterNextRender, booleanAttribute, inject, input } from '@angular/core';

/**
 * A bar that must stay on ONE line (the menu, the helper bar of a round): the words in it are shown only while everything fits on one line. It measures instead of guessing from the width of the
 * screen: first everything is shown; if the bar then wraps, the words of the buttons are hidden (`fit-1`: the icons stay, and the words stay for a screen reader); if it still wraps, the name
 * beside the logo goes too (`fit-2`). What the classes hide is in `styles.scss` (`.fit-label`, `.nav-label`, `.brand-text`). It measures again whenever the bar or what is in it changes size or text.
 * **A bar with `fitSome` shows as many words as there is room for** (the app's menu stuck to the top or bottom): when not all fit, each word is tried in turn, from the start of the bar, and stays when the bar still has one
 * line (`fit-off` is on the ones that do not). Only when there is no room even without words does it do as the others (`fit-1`, `fit-2`).
 */
@Directive({ selector: '[appLabelFit]' })
export class LabelFit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroyRef = inject(DestroyRef);
  private timer = 0;
  /** show the words there is room for, instead of all or none */
  readonly fitSome = input(false, { transform: booleanAttribute });

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
    const boxes = [...this.host.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (boxes.length < 2) return false;
    return Math.max(...boxes.map((r) => r.top)) >= Math.min(...boxes.map((r) => r.bottom)) - 0.5;
  }

  /** Hides every word and then gives back each one there is still room for. False when the bar wraps even without words: they are then all as they were. */
  private fitWords(words: readonly Element[]): boolean {
    for (const word of words) word.classList.add('fit-off');
    const room = !this.wraps();
    for (const word of words) {
      word.classList.remove('fit-off');
      if (room && this.wraps()) word.classList.add('fit-off');
    }
    return room;
  }

  private fit(): void {
    const classes = this.host.classList;
    classes.remove('fit-1', 'fit-2');
    const words = [...this.host.querySelectorAll('.fit-label')];
    for (const word of words) word.classList.remove('fit-off');
    if (!this.wraps() || (this.fitSome() && this.fitWords(words))) return;
    classes.add('fit-1');
    if (this.wraps()) classes.add('fit-2');
  }
}
