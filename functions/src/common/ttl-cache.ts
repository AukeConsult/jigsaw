// What was asked is kept for a while. Several places keep an answer for some seconds (a level, a user, a search): this is how all of them do it.

/** Answers by key, each kept `keepMs`. The promise itself is kept, so calls at the same time ask once; a question that fails is not kept. When `max` keys are kept, all are forgotten before another is. */
export class TtlCache<V> {
  private readonly kept = new Map<string, { at: number; value: Promise<V> }>();

  constructor(
    private readonly keepMs: number,
    private readonly max = Infinity,
    private readonly now: () => number = Date.now,
  ) {}

  /** What is kept for the key, else what `ask` says now. */
  get(key: string, ask: () => Promise<V>): Promise<V> {
    const same = this.kept.get(key);
    if (same && this.now() - same.at < this.keepMs) return same.value;
    if (this.kept.size >= this.max) this.kept.clear();
    const entry = { at: this.now(), value: ask() };
    this.kept.set(key, entry);
    entry.value.catch(() => {
      if (this.kept.get(key) === entry) this.kept.delete(key); // only itself: a later question for the key stays
    });
    return entry.value;
  }

  /** The key is asked again the next time; every key when none is given. */
  forget(key?: string): void {
    if (key === undefined) this.kept.clear();
    else this.kept.delete(key);
  }
}
