import { readPreference, writePreference } from '../../core/preferences';
import { JigsawFilters, JigsawSetup } from '../../models/shared/jigsaw-filter';

/** A filter of pictures as it is kept on the device (the app's list keeps its filter this way). */
export type FinderPreferences = JigsawSetup;

/** What was kept under this key (everything, when nothing was kept or it is not what it should be). */
export function readFinderPreferences(key: string): FinderPreferences {
  const kept = readPreference<FinderPreferences>(key, { view: 'cards', filter: JigsawFilters.empty() }, JigsawFilters.isSetup);
  return { ...kept, filter: { ...JigsawFilters.empty(), ...kept.filter } }; // what was kept before there were motive difficulties has none of them: it gets the empty list
}

export function writeFinderPreferences(key: string, value: FinderPreferences): void {
  writePreference(key, value);
}
