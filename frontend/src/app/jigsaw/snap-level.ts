import { CanvasArea } from '../models/shared/canvas';

/** How easy it is to make a piece click into place: the choices of the snap range (in percent of the grid; stored in the jigsaw as that number). */
export const SNAP_LEVELS = [
  { key: 'hard', label: 'Hard', percent: 10 },
  { key: 'medium', label: 'Medium', percent: 25 },
  { key: 'easy', label: 'Easy', percent: 40 },
] as const;

export type SnapLevelKey = (typeof SNAP_LEVELS)[number]['key'];

/** The level a snap range is closest to (a jigsaw made with another number is shown as the nearest level until another is chosen). */
export function snapLevelOf(percent: number): SnapLevelKey {
  return SNAP_LEVELS.reduce((best, level) => (Math.abs(level.percent - percent) < Math.abs(best.percent - percent) ? level : best)).key;
}

/** The level of a saved jigsaw (one saved without a snap range has the model's default). */
export function snapLevelOfJigsaw(jigsaw: { snapPercent?: number }): SnapLevelKey {
  return snapLevelOf(jigsaw.snapPercent ?? CanvasArea.DEFAULT_SNAP_PERCENT);
}

/** The snap range of a level, in percent of the grid. */
export function snapPercentOf(key: string): number | null {
  return SNAP_LEVELS.find((level) => level.key === key)?.percent ?? null;
}
