import { Component, ElementRef, OnDestroy, effect, output, signal, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** why there is no picture from the camera */
type Failure = 'denied' | 'none' | 'other';

/**
 * **The camera of a computer, in a window over the page**: what the camera sees, a button that takes the photo, and the photo to keep or take again. The browser asks the person for the camera the first time. (A phone
 * or tablet does not come here: its own camera app is opened by a file field, see `cameraWay`.) The photo goes out as a picture file (`taken`), as a chosen file would; the camera is let go when the window closes.
 */
@Component({
  selector: 'app-camera-capture',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawNew')],
  host: { '(document:keydown.escape)': 'cancelled.emit()' },
  template: `<div class="crop-backdrop" *transloco="let t" role="dialog" aria-modal="true" [attr.aria-label]="t('jigsawNew.takePhoto') || 'Take a photo'">
    <div class="crop-dialog card shadow p-3">
      <h2 class="subsection-title mb-2">{{ t('jigsawNew.takePhoto') || 'Take a photo' }}</h2>
      @if (failure(); as why) {
        <div class="alert alert-warning small mb-0" role="alert">
          @switch (why) {
            @case ('denied') { {{ t('jigsawNew.cameraDenied') || 'The camera is not allowed. Allow it for this page and try again.' }} }
            @case ('none') { {{ t('jigsawNew.cameraNone') || 'No camera was found.' }} }
            @default { {{ t('jigsawNew.cameraFailed') || 'Could not open the camera. Another program may be using it.' }} }
          }
        </div>
      } @else {
        @if (!ready()) {
          <div class="small text-body-secondary mb-2" role="status">{{ t('jigsawNew.cameraStarting') || 'Opening the camera…' }}</div>
        }
        <video #video class="camera-view rounded bg-dark" [class.d-none]="!!shot()" autoplay playsinline (loadedmetadata)="ready.set(true)"></video>
        @if (shot(); as s) {
          <img class="camera-view rounded" [src]="s.url" [alt]="t('jigsawNew.takePhoto') || 'Take a photo'">
        }
      }
      <div class="d-flex flex-wrap justify-content-center gap-2 mt-3">
        <button type="button" class="btn btn-outline-secondary" (click)="cancelled.emit()">{{ t('jigsawNew.cancel') || 'Cancel' }}</button>
        @if (shot(); as s) {
          <button type="button" class="btn btn-outline-primary" (click)="again()"><i class="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>{{ t('jigsawNew.takeAgain') || 'Take again' }}</button>
          <button type="button" class="btn btn-primary" (click)="taken.emit(s.file)"><i class="bi bi-check-lg me-1" aria-hidden="true"></i>{{ t('jigsawNew.usePhoto') || 'Use the photo' }}</button>
        } @else if (!failure()) {
          <button type="button" class="btn btn-primary" [disabled]="!ready()" (click)="shoot()"><i class="bi bi-camera me-1" aria-hidden="true"></i>{{ t('jigsawNew.takePhoto') || 'Take a photo' }}</button>
        }
      </div>
    </div>
  </div>`,
})
export class CameraCapture implements OnDestroy {
  /** the photo the person keeps, as a picture file */
  readonly taken = output<File>();
  /** the window is closed without a photo */
  readonly cancelled = output<void>();

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private readonly stream = signal<MediaStream | null>(null);
  private closed = false;
  protected readonly failure = signal<Failure | null>(null);
  /** the camera shows a picture */
  protected readonly ready = signal(false);
  /** the photo that was taken and waits to be kept, and its address on the page */
  protected readonly shot = signal<{ file: File; url: string } | null>(null);

  constructor() {
    effect(() => {
      const video = this.video()?.nativeElement;
      const stream = this.stream();
      if (video && stream && video.srcObject !== stream) video.srcObject = stream;
    });
    void this.open();
  }

  private async open(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (this.closed) return this.stop(stream); // closed while the person was asked
      this.stream.set(stream);
    } catch (error) {
      const name = (error as DOMException).name;
      this.failure.set(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'none' : 'other');
    }
  }

  /** What the camera sees now becomes the photo, at the camera's own size. */
  protected shoot(): void {
    const video = this.video()?.nativeElement;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob || this.closed) return;
        const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
        this.shot.set({ file, url: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      0.92,
    );
  }

  protected again(): void {
    this.letGoOfShot();
  }

  private letGoOfShot(): void {
    const shot = this.shot();
    if (shot) URL.revokeObjectURL(shot.url);
    this.shot.set(null);
  }

  private stop(stream: MediaStream): void {
    for (const track of stream.getTracks()) track.stop();
  }

  ngOnDestroy(): void {
    this.closed = true;
    const stream = this.stream();
    if (stream) this.stop(stream);
    this.letGoOfShot();
  }
}
