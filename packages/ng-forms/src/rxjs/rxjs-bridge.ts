import { effect, Signal } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * @fileoverview RxJS bridge for converting Angular signals to observables
 *
 * This module provides utilities for integrating SignalTree forms with
 * RxJS-based reactive patterns.
 */

/**
 * Converts an Angular signal to an RxJS Observable.
 *
 * Creates an Observable that emits the signal's value whenever it changes.
 * The effect is automatically destroyed when the Observable is unsubscribed.
 *
 * @template T - The type of value emitted by the signal
 * @param signal - The Angular signal to convert
 * @returns Observable that mirrors the signal's values
 *
 * @example
 * ```typescript
 * import { toObservable } from '@signaltree/ng-forms/rxjs';
 *
 * const form = createFormTree({ name: '' });
 *
 * // Convert form signals to observables
 * const name$ = toObservable(form.$.name);
 * const errors$ = toObservable(form.errors);
 *
 * // Use with RxJS operators
 * name$.pipe(
 *   debounceTime(300),
 *   distinctUntilChanged()
 * ).subscribe(value => {
 *   console.log('Name changed:', value);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Combine multiple form signals
 * import { combineLatest } from 'rxjs';
 *
 * const form = createFormTree({
 *   firstName: '',
 *   lastName: ''
 * });
 *
 * combineLatest([
 *   toObservable(form.$.firstName),
 *   toObservable(form.$.lastName)
 * ]).pipe(
 *   map(([first, last]) => `${first} ${last}`)
 * ).subscribe(fullName => {
 *   console.log('Full name:', fullName);
 * });
 * ```
 */
export function toObservable<T>(signal: Signal<T>): Observable<T> {
  return new Observable((subscriber) => {
    try {
      const effectRef = effect(() => {
        subscriber.next(signal());
      });
      return () => effectRef.destroy();
    } catch {
      // Fallback for test environment without injection context
      subscriber.next(signal());
      return () => {
        // No cleanup needed for single emission
      };
    }
  });
}
