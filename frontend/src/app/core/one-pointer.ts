/**
 * **One finger at a time** for what is dragged: while something is held, another finger (or the mouse, or a pen) does not take it or move it. A first finger of the same kind as the one that holds is not
 * "another": there cannot be two, so the end of the earlier one was never heard, and the new one takes over. (`held`: the type of the pointer that holds, if any.)
 */
export function takenByAnother(held: { type: string } | null | undefined, event: PointerEvent): boolean {
  return !!held && (!event.isPrimary || event.pointerType !== held.type);
}
