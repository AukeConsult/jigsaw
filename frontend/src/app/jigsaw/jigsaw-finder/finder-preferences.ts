import { readPreference, writePreference } from '../../core/preferences';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';

/** What the person chose when looking for jigsaws, kept on the device: how the jigsaws are shown, and what is looked for. */
export interface FinderPreferences {
  view: 'list' | 'cards';
  filter: JigsawFilter;
}

/** Where the front page keeps what is looked for: the Find page sets it, and the front page shows the jigsaws that match. */
export const FRONT_FINDER_KEY = 'jigsaw.front';

const isFinderPreferences = (v: unknown): v is FinderPreferences => {
  const p = v as Partial<FinderPreferences> | null;
  return !!p && typeof p === 'object' && (p.view === 'list' || p.view === 'cards') && JigsawFilters.is(p.filter);
};

/** What was kept under this key (cards, and everything, when nothing was kept or it is not what it should be). */
export function readFinderPreferences(key: string): FinderPreferences {
  return readPreference<FinderPreferences>(key, { view: 'cards', filter: JigsawFilters.empty() }, isFinderPreferences);
}

export function writeFinderPreferences(key: string, value: FinderPreferences): void {
  writePreference(key, value);
}
