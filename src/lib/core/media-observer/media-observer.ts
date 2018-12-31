/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {debounceTime, filter, map, switchMap} from 'rxjs/operators';

import {mergeAlias} from '../add-alias';
import {MediaChange} from '../media-change';
import {MatchMedia} from '../match-media/match-media';
import {PrintHook} from '../media-marshaller/print-hook';
import {BreakPointRegistry, OptionalBreakPoint} from '../breakpoints/break-point-registry';

/**
 * Class internalizes a MatchMedia service and exposes an Observable interface.

 * This exposes an Observable with a feature to subscribe to mediaQuery
 * changes and a validator method (`isActive(<alias>)`) to test if a mediaQuery (or alias) is
 * currently active.
 *
 * !! Only mediaChange activations (not de-activations) are announced by the MediaObserver
 *
 * This class uses the BreakPoint Registry to inject alias information into the raw MediaChange
 * notification. For custom mediaQuery notifications, alias information will not be injected and
 * those fields will be ''.
 *
 * !! This is not an actual Observable. It is a wrapper of an Observable used to publish additional
 * methods like `isActive(<alias>). To access the Observable and use RxJS operators, use
 * `.media$` with syntax like mediaObserver.asObservable().map(....).
 *
 *  @usage
 *
 *  // RxJS
 *  import { filter } from 'rxjs/operators';
 *  import { MediaObserver } from '@angular/flex-layout';
 *
 *  @Component({ ... })
 *  export class AppComponent {
 *    status: string = '';
 *
 *    constructor(media: MediaObserver) {
 *      const onChange = (change: MediaChange) => {
 *        this.status = change ? `'${change.mqAlias}' = (${change.mediaQuery})` : '';
 *      };
 *
 *      // Subscribe directly or access observable to use filter/map operators
 *      // e.g. media.asObservable().subscribe(onChange);
 *
 *      media.asObservable()
 *        .pipe(
 *          filter((change: MediaChange) => true)   // silly noop filter
 *        ).subscribe(onChange);
 *    }
 *  }
 */
@Injectable({providedIn: 'root'})
export class MediaObserver {

  /** Filter MediaChange notifications for overlapping breakpoints */
  filterOverlaps = false;

  constructor(protected breakpoints: BreakPointRegistry,
              protected matchMedia: MatchMedia,
              protected hook: PrintHook) {
    this._media$ = this.watchActivations();
  }

  // ************************************************
  // Public Methods
  // ************************************************

  /**
   * Observe changes to current activation 'list'
   */
  asObservable(): Observable<MediaChange[]> {
    return this._media$;
  }

  /**
   * Allow programmatic query to determine if specified query/alias is active.
   */
  isActive(alias: string): boolean {
    const query = toMediaQuery(alias, this.breakpoints);
    return this.matchMedia.isActive(query);
  }

  /**
   * Subscribers to activation list can use this function to easily exclude overlaps
   */


  // ************************************************
  // Internal Methods
  // ************************************************

  /**
   * Register all the mediaQueries registered in the BreakPointRegistry
   * This is needed so subscribers can be auto-notified of all standard, registered
   * mediaQuery activations
   */
  private watchActivations() {
    const queries = this.breakpoints.items.map(bp => bp.mediaQuery);
    return this.buildObservable(queries);
  }

  /**
   * Only pass/announce activations (not de-activations)
   *
   * Since multiple-mediaQueries can be activation in a cycle,
   * gather all current activations into a single list of changes to observers
   *
   * Inject associated (if any) alias information into the MediaChange event
   * - Exclude mediaQuery activations for overlapping mQs. List bounded mQ ranges only
   * - Exclude print activations that do not have an associated mediaQuery
   *
   * NOTE: the raw MediaChange events [from MatchMedia] do not
   *       contain important alias information; as such this info
   *       must be injected into the MediaChange
   */
  private buildObservable(mqList: string[]): Observable<MediaChange[]> {
    const hasChanges = (changes: MediaChange[]) => {
      const isValidQuery = (change: MediaChange) => (change.mediaQuery.length > 0);
      return (changes.filter(isValidQuery).length > 0);
    };
    const excludeOverlaps = (changes: MediaChange[]) => {
      return !this.filterOverlaps ? changes : changes.filter(change => {
        const bp = this.breakpoints.findByQuery(change.mediaQuery);
        return !bp ? true : !bp.overlapping;
      });
    };

    /**
     */
    return this.matchMedia
        .observe(this.hook.withPrintQuery(mqList))
        .pipe(
            filter((change: MediaChange) => change.matches),
            debounceTime(10),
            switchMap(_ => of(this.findAllActivations())),
            map(excludeOverlaps),
            filter(hasChanges)
        );
  }

  /**
   * Find all current activations and prepare single list of activations
   * sorted by descending priority.
   */
  private findAllActivations(): MediaChange[] {
    const mergeMQAlias = (change: MediaChange) => {
      let bp: OptionalBreakPoint = this.breakpoints.findByQuery(change.mediaQuery);
      return mergeAlias(change, bp);
    };
    const replaceWithPrintAlias = (change: MediaChange) => {
      return this.hook.isPrintEvent(change) ? this.hook.updateEvent(change) : change;
    };

    return this.matchMedia
        .activations
        .map(query => new MediaChange(true, query))
        .map(replaceWithPrintAlias)
        .map(mergeMQAlias)
        .sort(sortChangesByPriority);
  }

  private _media$: Observable<MediaChange[]>;
}

/**
 * Find associated breakpoint (if any)
 */
function toMediaQuery(query: string, locator: BreakPointRegistry) {
  const bp = locator.findByAlias(query) || locator.findByQuery(query);
  return bp ? bp.mediaQuery : query;
}

/** HOF to sort the breakpoints by priority */
export function sortChangesByPriority(a: MediaChange, b: MediaChange): number {
  const priorityA = a ? a.priority || 0 : 0;
  const priorityB = b ? b.priority || 0 : 0;
  return priorityB - priorityA;
}
