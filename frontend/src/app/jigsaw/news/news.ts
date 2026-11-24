import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** News and offers (`app-news`): the area under the steps of the welcome on the front page. A dummy for now: what news and offers are, who writes them and where they are kept is not decided (see `TODO.md`, "News and offers"). */
@Component({
  selector: 'app-news',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawNews')],
  templateUrl: './news.html',
})
export class News {}
