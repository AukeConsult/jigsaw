import { NgComponentOutlet } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { PlayCircumstances } from '../core/circumstances';
import { HelperMainViews } from '../play-helper/helper-main-views';
import { HelperPanel } from '../play-helper/helper-panel';
import { PlayHelper } from '../play-helper/play-helper';
import { PlayPages } from './play-pages';

/** The main page of the app (`/`): it holds all the other pages of the app, as components: **every page is a play page (`PlayPage`), shown by `PlayPages` as the circumstances say** (the app never uses routing), the frame with the views of the helper when it shows them in the main area (in the place of the page while it is open: the page is hidden, not removed), and the helper that floats over all of them. What every page shares (a menu, a header) goes here. */
@Component({
  selector: 'play-main',
  imports: [NgComponentOutlet, HelperMainViews, PlayHelper],
  host: { class: 'd-block' },
  template: '<helper-main-views /><div [class.d-none]="panel.inMain()">@if (pages.current(); as page) {<ng-container *ngComponentOutlet="page.component" />}</div><play-helper />',
})
export class PlayMain implements OnInit {
  protected readonly panel = inject(HelperPanel);
  protected readonly pages = inject(PlayPages);
  private readonly circumstances = inject(PlayCircumstances);

  /** The top level checks who is logged on and which account plays, as the main page is shown (see `PlayCircumstances.check`): the helper is the one that fits the answer, and a wait icon until it is there. */
  ngOnInit(): void {
    void this.circumstances.check();
  }
}
