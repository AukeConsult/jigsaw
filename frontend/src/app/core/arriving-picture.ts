import { Directive, signal } from '@angular/core';

/**
 * A picture that is not there yet: it comes in softly when it has arrived (or could not be read); in the box of a tile the box shimmers meanwhile, and a picture on its own rises into its place. The look is in
 * `styles.scss` (`.arriving`), so with the effects switched off, or on a device that asks for less motion, the picture is shown as it always was.
 */
@Directive({
  selector: 'img[appArriving]',
  host: { class: 'arriving', '[class.is-arrived]': 'arrived()', '(load)': 'arrived.set(true)', '(error)': 'arrived.set(true)' },
})
export class ArrivingPicture {
  protected readonly arrived = signal(false);
}
