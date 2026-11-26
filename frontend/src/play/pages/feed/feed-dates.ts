/**
 * The dates of a tile, as the form has them (a day, `2026-12-31`) and as they are kept (milliseconds): the day it is shown from is the start of that day, and the day it expires counts to the end of that day, in the
 * time of the person who writes it. Nothing is nothing: it is always shown.
 */
const parts = (day: string): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? [Number(m[1]), Number(m[2]) - 1, Number(m[3])] : null;
};

export function dayToMs(day: string, end: boolean): number | undefined {
  const p = parts(day);
  if (!p) return undefined;
  return (end ? new Date(p[0], p[1], p[2], 23, 59, 59, 999) : new Date(p[0], p[1], p[2])).getTime();
}

export function msToDay(ms: number | undefined): string {
  if (ms === undefined) return '';
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}
