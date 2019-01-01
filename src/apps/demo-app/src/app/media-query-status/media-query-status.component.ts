import {ChangeDetectionStrategy, Component} from '@angular/core';
import {MediaChange, MediaObserver} from '@angular/flex-layout';
import {Observable} from 'rxjs';

@Component({
  selector: 'media-query-status',
  template: `
    <div class="mqInfo" *ngIf="media$ | async as event">
      <span title="Active MediaQuery">{{  extractQuery(event) }}</span>
    </div>
  `,
  styles: [`
    .mqInfo {
      padding-left: 25px;
      margin-bottom: 5px;
      margin-top: 10px;
    }

    .mqInfo > span {
      padding-left: 0;
      color: rgba(0, 0, 0, 0.54);
      font-size: 0.8em;
    }

    .mqInfo > span::before {
      content: attr(title) ': ';
    }
  `],
  changeDetection : ChangeDetectionStrategy.OnPush
})
export class MediaQueryStatusComponent {
  media$: Observable<MediaChange>;

  constructor(mediaObserver: MediaObserver) {
    this.media$ = mediaObserver.media$;
  }

  extractQuery(change: MediaChange): string {
    return change ? `'${change.mqAlias}' = (${change.mediaQuery})` : '';
  }
}
