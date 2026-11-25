import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { HelperMenu } from '../core/helper-menu';

/** The menu of the checking helper: a small wait icon and the word "Checking". */
@Component({
  selector: 'checking-menu',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  template: `<span class="d-flex align-items-center gap-2" *transloco="let t"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span class="small">{{ t('play.checking') || 'Checking…' }}</span></span>`,
})
export class CheckingMenu extends HelperMenu {}
