import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { readPreference, writePreference } from './preferences';

/**
 * **The two modes of the program: `play` (the new app, `src/play/`, at `/play/...`) and `jigsaw` (the existing app, the website, at `/jigsaw/...`; to be refactored later).** The mode is kept on the device (rule 12 of `CLAUDE.md`) and decides where
 * the top routes go: home, `/`, goes to the home of the mode, and a top route such as `/list` goes to the same page under the prefix of the mode (`/play/list`, or `/jigsaw/list`). Opening anything under `/play` sets the mode `play`, and opening
 * anything under `/jigsaw` sets the mode `jigsaw`; from then on the top routes go there.
 */
export type AppMode = 'play' | 'jigsaw';

const MODE_KEY = 'app.mode';
const isMode = (value: unknown): value is AppMode => value === 'play' || value === 'jigsaw';

/** whether an address is a page of the app (under `/play`) */
export const isPlayUrl = (url: string | null | undefined): boolean => !!url && /^\/play(\/|$)/.test(url);

/** a path of this site that a login may come back to (not another site, and not a protocol-relative address) */
export const isLocalPath = (url: unknown): url is string => typeof url === 'string' && /^\/(?!\/)/.test(url);

/** The mode that was set last (the new app to begin with). */
export const appMode = (): AppMode => readPreference<AppMode>(MODE_KEY, 'play', isMode);

/** where home goes in each mode: the first page of the new app, or the website */
const HOME: Record<AppMode, string> = { play: '/play/list', jigsaw: '/jigsaw' };

/** Guard of the routes of a mode: going to them sets the mode. */
export const modeGuard =
  (mode: AppMode): CanActivateFn =>
  () => {
    writePreference(MODE_KEY, mode);
    return true;
  };

/** Guard of home (`/`): it goes to the home of the mode that is set. */
export const homeGuard: CanActivateFn = () => inject(Router).parseUrl(HOME[appMode()]);

/**
 * Guard of the top routes (what no route knows and is not under `/play` or `/jigsaw`): the same address under the prefix of the mode that is set, so `/list` goes to `/play/list` in play mode and to `/jigsaw/list` in jigsaw mode. What is not
 * known under `/play` or under `/jigsaw` goes to the home of that mode.
 */
export const topRouteGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const under = /^\/(play|jigsaw)(?=[/?#]|$)/.exec(state.url)?.[1] as AppMode | undefined;
  if (under) return router.parseUrl(HOME[under]);
  return router.parseUrl(`/${appMode()}${state.url === '/' ? '' : state.url}`);
};
