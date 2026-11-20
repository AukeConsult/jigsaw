import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-home',
  imports: [TranslocoDirective],
  template: `
    <main class="container py-5" *transloco="let t; prefix: 'home'">
      <h1 class="h3">{{ t('title') || 'Canvas' }}</h1>
      <p class="text-body-secondary">{{ t('intro') || 'An empty project.' }}</p>
    </main>
  `,
})
export class Home {}
