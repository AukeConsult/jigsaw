import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { PlayMenu, pageMenu } from './helper/menus';

/** The menu that goes with the page that is open: the one its route carries in its `data` (`menu`; the deepest route that is active), or the menu of a plain page when the route carries none. */
export function menuOfRoute(router: Router): PlayMenu {
  let route: ActivatedRouteSnapshot | null = router.routerState.snapshot.root;
  while (route?.firstChild) route = route.firstChild;
  return (route?.data['menu'] as PlayMenu | undefined) ?? pageMenu;
}
