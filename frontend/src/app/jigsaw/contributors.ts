import { CanvasSpec } from '../models/shared/canvas';

/** A contributor: someone who has made at least one jigsaw, with how many. */
export interface Contributor {
  /** what tells the contributors apart: the UID of the author, or (for a jigsaw from before owners) the author's name */
  key: string;
  name: string;
  count: number;
}

/** Who made a jigsaw: the key of its author, or '' when it has none. */
export function contributorKey(item: Pick<CanvasSpec, 'ownerUid' | 'author'>): string {
  return item.ownerUid || (item.author?.trim() ? `name:${item.author.trim().toLowerCase()}` : '');
}

/** The people who have made the jigsaws, by name, each with the number of jigsaws they made. */
export function contributorsOf(items: readonly CanvasSpec[]): Contributor[] {
  const found = new Map<string, Contributor>();
  for (const item of items) {
    const key = contributorKey(item);
    if (!key) continue;
    const seen = found.get(key);
    if (seen) seen.count += 1;
    else found.set(key, { key, name: item.author?.trim() || key, count: 1 });
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** The jigsaws one contributor made, or all of them when none is chosen (`null`). */
export function madeBy(items: readonly CanvasSpec[], key: string | null): CanvasSpec[] {
  return key === null ? [...items] : items.filter((item) => contributorKey(item) === key);
}
