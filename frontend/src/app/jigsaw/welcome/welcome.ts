import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { Home } from '../../home/home';
import { ArrivingPicture } from '../../core/arriving-picture';

/**
 * **Karin's welcome**, the first document of the app's info page: the welcome and the three first steps (the third leads to the app's Add picture), under them a short description of how to play
 * with Help, About and Install as direct buttons, and Karin's picture with her note.
 */
@Component({
  selector: 'app-welcome',
  imports: [RouterLink, TranslocoDirective, Home, ArrivingPicture],
  providers: [provideTranslocoScope('jigsawHome', 'guide', 'play')],
  templateUrl: './welcome.html',
})
export class Welcome {}
