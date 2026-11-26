import { Location } from '@angular/common';
import { Router } from '@angular/router';

/** Cancel and Close: back to the page the person came from; to the home page when this was the first page of the visit (there is nothing in the app to go back to then). */
export function goBack(location: Location, router: Router): void {
  if (((location.getState() as { navigationId?: number } | null)?.navigationId ?? 1) > 1) location.back();
  else void router.navigateByUrl('/play/list');
}
