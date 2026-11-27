import { Component } from '@angular/core';
import { JigsawBatch } from '../../../app/jigsaw/jigsaw-batch/jigsaw-batch';

/**
 * The page of the route `/play/mine/many`: **many pictures at once**, for a publisher or an admin (`publisherGuard`; the server decides what each level may do). It only frames the component `app-jigsaw-batch`: how many pieces and how hard, then many pictures chosen from the computer, each made into a picture or a ready jigsaw and set by the AI. The pictures of a package are uploaded on the page of the package (`/play/mine/packages/:id/pictures`).
 */
@Component({
  selector: 'play-many',
  imports: [JigsawBatch],
  host: { class: 'd-block' },
  template: `<app-jigsaw-batch />`,
})
export class PlayMany {}
