import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { cameraWay } from '../app/core/platform';

/**
 * **A photo taken from the menu** (Take a photo): the entry opens the camera at once (a phone or tablet its camera app, a computer the window with the camera, which the main page frames), and the photo goes to Add
 * picture, where the form takes it as a chosen file (`taken`).
 */
@Injectable({ providedIn: 'root' })
export class PhotoShot {
  private readonly router = inject(Router);

  /** how a photo is taken on this device (`cameraWay`; null: it can not) */
  readonly way = cameraWay();
  /** the window with the camera of a computer is open */
  readonly filming = signal(false);
  /** a photo that was taken and waits for the form of Add picture to take it */
  readonly taken = signal<File | null>(null);

  /** The photo was taken: Add picture is opened (it may be open already) with it. */
  receive(file: File): void {
    this.filming.set(false);
    this.taken.set(file);
    void this.router.navigateByUrl('/play/mine/addpicture');
  }
}
