import { readPreference, writePreference } from '../../core/preferences';
import { JigsawFilters, JigsawSetup } from '../../models/shared/jigsaw-filter';

/** What the person chose when looking for jigsaws, kept on the device: how the jigsaws are shown, and what is looked for. When Go is pressed it is kept with the user too. */
export type FinderPreferences = JigsawSetup;

/** Where the front page keeps what is looked for: the Find page sets it, and the front page shows the jigsaws that match. */
export const FRONT_FINDER_KEY = 'jigsaw.front';

/** What was kept under this key (cards, and everything, when nothing was kept or it is not what it should be). */
export function readFinderPreferences(key: string): FinderPreferences {
  const kept = readPreference<FinderPreferences>(key, { view: 'cards', filter: JigsawFilters.empty() }, JigsawFilters.isSetup);
  return { ...kept, filter: { ...JigsawFilters.empty(), ...kept.filter } }; // what was kept before there were motive difficulties has none of them: it gets the empty list
}

export function writeFinderPreferences(key: string, value: FinderPreferences): void {
  writePreference(key, value);
}

/** Whether anything has been kept on this device under the key (a device that has none takes the setup of the user). */
export function hasFinderPreferences(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}
