import { effect, signal, untracked } from '@angular/core';

/** idle: nothing to save, invalid: the settings are not allowed so nothing is saved, waiting: a change is waiting for the pause, saving, saved, failed */
export type SaveState = 'idle' | 'invalid' | 'waiting' | 'saving' | 'saved' | 'failed';

/** how long it waits after the last change before it saves */
const PAUSE_MS = 800;
/** how long it waits before it tries again after a save failed */
const RETRY_MS = 5000;

export interface AutosaveOptions<Input, Item extends { id: string }> {
  /** the settings of what is open, as the API takes them (read in an effect: every signal it reads is watched) */
  input: () => Input;
  /** why the settings are not allowed ('' when they are): nothing is saved while they are not */
  invalid: () => string;
  create: (input: Input) => Promise<Item>;
  update: (id: string, input: Input) => Promise<Item>;
  /** called with the saved item, to keep a list of the saved items up to date */
  saved: (item: Item) => void;
}

/**
 * Saves what is open on a page by itself, a pause after the last change: the first save creates it, the next ones change it.
 * Nothing is saved when the page opens or when something saved is opened (call `markSaved`), only a change after that.
 * One save at a time; a change made while saving is saved after. A failed save is tried again after a while.
 * Create it where the page's component is made (it starts an effect).
 */
export class Autosave<Input, Item extends { id: string }> {
  /** the saved item that is open (null for a new one that is not saved yet) */
  readonly currentId = signal<string | null>(null);
  readonly state = signal<SaveState>('idle');

  /** the settings that are saved (as text): a change is anything that differs from this */
  private savedAs: string;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing = false;

  constructor(private readonly options: AutosaveOptions<Input, Item>) {
    this.savedAs = JSON.stringify(options.input());
    effect(() => {
      const now = JSON.stringify(options.input());
      const invalid = options.invalid();
      untracked(() => {
        clearTimeout(this.timer);
        if (invalid) {
          this.state.set('invalid');
        } else if (now !== this.savedAs) {
          this.state.set('waiting');
          this.timer = setTimeout(() => void this.flush(), PAUSE_MS);
        } else if (this.state() === 'invalid') {
          this.state.set('idle'); // the settings are allowed again and are the saved ones
        }
      });
    });
  }

  /** What is open now counts as saved (a saved item was opened, or a new one was started): `id` is the saved item, or null for a new one. */
  markSaved(id: string | null): void {
    clearTimeout(this.timer);
    this.currentId.set(id);
    this.savedAs = JSON.stringify(this.options.input());
    this.state.set('idle');
  }

  /** Leaving the page: a change that is still waiting is saved now, not after the pause. */
  destroy(): void {
    clearTimeout(this.timer);
    if (this.state() === 'waiting') void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.options.invalid()) return;
    this.flushing = true;
    this.state.set('saving');
    const input = this.options.input();
    const body = JSON.stringify(input);
    try {
      const id = this.currentId();
      const item = id ? await this.options.update(id, input) : await this.options.create(input);
      this.currentId.set(item.id);
      this.savedAs = body;
      this.options.saved(item);
      this.state.set('saved');
    } catch {
      this.state.set('failed');
    } finally {
      this.flushing = false;
    }
    // something changed while saving (or the save failed: try again after a while)
    if (JSON.stringify(this.options.input()) !== this.savedAs && !this.options.invalid()) {
      const failed = this.state() === 'failed';
      this.state.set(failed ? 'failed' : 'waiting');
      this.timer = setTimeout(() => void this.flush(), failed ? RETRY_MS : PAUSE_MS);
    }
  }
}
