/** The items the question is yes for, in their order. The questions are asked at the same time. */
export async function filterAsync<T>(items: readonly T[], keep: (item: T) => boolean | Promise<boolean>): Promise<T[]> {
  const kept = await Promise.all(items.map((item) => keep(item)));
  return items.filter((_, i) => kept[i]);
}
