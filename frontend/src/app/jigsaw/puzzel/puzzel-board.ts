import { Component, inject } from '@angular/core';
import { JigsawBoard } from '../../board/jigsaw-board/jigsaw-board';
import { PuzzelRound } from './puzzel-round';

/**
 * **The board of the round that is open**: the pieces in their store beside the picture, with the helper picture (the picture area, the store, the pieces and the pointer tools are `app-jigsaw-board`). It only shows what the round
 * (`PuzzelRound`, provided by the page) has, and gives back what the player does with the pieces.
 */
@Component({
  selector: 'app-puzzel-board',
  imports: [JigsawBoard],
  host: { class: 'd-block' },
  template: `
    @if (round.item(); as it) {
      <app-jigsaw-board [width]="it.width" [height]="it.height" [gridSize]="it.gridSize" [gridVisible]="it.gridVisible" [gridInset]="true" [numberPoints]="round.debug()"
                        [storeWidth]="it.storeWidth ?? 0" [lineWidth]="round.lineWidth()" [lineColor]="round.lineColor()" [backColor]="round.backColor()" [snapRange]="round.snapRangePx()" [picture]="round.picture()" [fillScreen]="true" [helperBanner]="true" [viewOnly]="round.viewOnly()" [roundLook]="round.ownLook()"
                        [(placed)]="round.placed" (storeWidthChange)="round.widenStore($event)" />
    }
  `,
})
export class PuzzelBoard {
  protected readonly round = inject(PuzzelRound);
}
