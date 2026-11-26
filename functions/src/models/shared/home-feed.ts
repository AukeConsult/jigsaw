import type { FeedItem } from './feed-item';

/**
 * The home page: the pictures a search found, with the other tiles (information, offers, packages) among them. One rule for the app and the website, so the two cannot disagree.
 *
 * A tile that is not a picture has a place: after how many pictures it comes (its own `slot`, or what its kind says, `defaultSlot`). The place is counted in pictures from the very first one, so
 * the pictures that are asked for later (the next page of an endless list) are added at the end and **never move a tile that is already there**. A tile whose place is further down than the
 * pictures that are loaded waits, until they are (or until there are no more pictures: then it comes at the end).
 */
export class HomeFeed {
  /**
   * The tiles in the order they are shown: the pictures with the others among them. `complete` says there are no more pictures to load. The tiles are put in order of their place, then the one
   * with the higher priority, then by id.
   */
  static merge(pictures: readonly FeedItem[], others: readonly FeedItem[], complete: boolean): FeedItem[] {
    const seen = new Map<string, number>();
    const placed = others
      .filter((item) => item.onHome)
      .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1)) // the number of a tile among its kind follows its priority, not the order it came in
      .map((item) => {
        const order = seen.get(item.kind) ?? 0;
        seen.set(item.kind, order + 1);
        return { item, slot: item.slot ?? item.defaultSlot(order) };
      })
      .sort((a, b) => a.slot - b.slot || b.item.priority - a.item.priority || (a.item.id < b.item.id ? -1 : 1));
    const out: FeedItem[] = [];
    let next = 0; // the next picture to put
    for (const { item, slot } of placed) {
      if (slot > pictures.length && !complete) break; // its place is not loaded yet: it waits, and so does everything after it
      while (next < slot && next < pictures.length) out.push(pictures[next++]);
      out.push(item);
    }
    while (next < pictures.length) out.push(pictures[next++]);
    return out;
  }
}
