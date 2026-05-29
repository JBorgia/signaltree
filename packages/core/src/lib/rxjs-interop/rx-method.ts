import {
  DestroyRef,
  inject,
  Injector,
  isSignal,
  type Signal,
} from '@angular/core';
import {
  takeUntilDestroyed,
  toObservable,
} from '@angular/core/rxjs-interop';
import { isObservable, type Observable, Subject, Subscription } from 'rxjs';

/**
 * Acceptable input shapes for an {@link RxMethod} invocation.
 *
 * The method can be called with:
 * - a raw value of type `T`
 * - an Angular `Signal<T>` (auto-subscribed; pushes each emission through the pipeline)
 * - an `Observable<T>` (auto-subscribed; pushes each emission through the pipeline)
 *
 * Signal and Observable subscriptions are auto-cleaned on the surrounding `DestroyRef`.
 */
export type RxMethodInput<T> = T | Signal<T> | Observable<T>;

/**
 * The callable returned by {@link rxMethod}.
 *
 * - When `T extends void`, callable with no argument: `loadUsers()`.
 * - Otherwise, callable with a value, Signal, or Observable: `searchByQuery('alice')`, `searchByQuery(querySignal)`, `searchByQuery(query$)`.
 *
 * Returns a `Subscription` for the source bridge (signal/observable inputs) so the caller
 * can manually unsubscribe one specific input source if needed. The master pipeline subscription
 * is managed internally and torn down via the `DestroyRef` or {@link RxMethod.destroy}.
 */
export interface RxMethod<T> {
  (
    ...args: [T] extends [void]
      ? [] | [RxMethodInput<T>]
      : [RxMethodInput<T>]
  ): Subscription;
  /**
   * Manually tear down all subscriptions created by this method.
   * Normally called automatically via the `DestroyRef`; provided for tests
   * and for callers that need explicit lifecycle control.
   */
  destroy(): void;
}

/**
 * RxJS-pipeline async helper for SignalTree, modeled after NgRx's `rxMethod`.
 *
 * Encapsulates an RxJS pipeline that runs every time the returned method is called.
 * Subscriptions are automatically cleaned up on the surrounding component or service's
 * `DestroyRef`.
 *
 * Use inside an Angular injection context (class field initializer or constructor).
 * For non-Angular environments or tests, pass an explicit `destroyRef` and `injector`
 * via the `options` parameter.
 *
 * @example Basic void input
 * ```typescript
 * @Injectable({ providedIn: 'root' })
 * export class UserOps {
 *   private readonly _$ = inject(APP_TREE).$;
 *   private readonly _api = inject(UserService);
 *
 *   readonly loadUsers = rxMethod<void>((input$) =>
 *     input$.pipe(
 *       tap(() => this._$.users.loading.setLoading()),
 *       switchMap(() =>
 *         this._api.list$().pipe(
 *           tap((users) => this._$.users.entities.setAll(users)),
 *           tap(() => this._$.users.loading.setLoaded()),
 *           catchError((err) => {
 *             this._$.users.loading.setError(err);
 *             return EMPTY;
 *           }),
 *         ),
 *       ),
 *     ),
 *   );
 * }
 *
 * // Usage:
 * userOps.loadUsers();
 * ```
 *
 * @example Signal input (auto-debounced search)
 * ```typescript
 * readonly searchByQuery = rxMethod<string>((input$) =>
 *   input$.pipe(
 *     debounceTime(300),
 *     distinctUntilChanged(),
 *     switchMap((q) => this._api.search$(q)),
 *     tap((results) => this._$.searchResults.set(results)),
 *   ),
 * );
 *
 * // Wire a signal — every change pushes through the pipeline:
 * userOps.searchByQuery(this._$.searchInput);
 * // Or call with a raw value:
 * userOps.searchByQuery('alice');
 * // Or feed an observable:
 * userOps.searchByQuery(externalQuery$);
 * ```
 *
 * @example Manual lifecycle (tests or non-Angular contexts)
 * ```typescript
 * const destroyRef = { onDestroy: (fn: () => void) => { ... } } as DestroyRef;
 * const method = rxMethod<number>(
 *   (input$) => input$.pipe(tap((n) => console.log(n))),
 *   { destroyRef, injector: TestBed.inject(Injector) },
 * );
 * method(42);
 * method.destroy(); // manual teardown
 * ```
 */
export function rxMethod<T = void>(
  generator: (source$: Observable<T>) => Observable<unknown>,
  options?: { destroyRef?: DestroyRef; injector?: Injector }
): RxMethod<T> {
  const destroyRef = options?.destroyRef ?? inject(DestroyRef);
  const injector = options?.injector ?? inject(Injector);

  const trigger$ = new Subject<T>();
  const sourceSubs = new Set<Subscription>();
  let isDestroyed = false;

  const masterSub = generator(trigger$.asObservable())
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe();

  const fn = (input?: RxMethodInput<T>): Subscription => {
    if (isDestroyed) return Subscription.EMPTY;

    if (input === undefined) {
      trigger$.next(undefined as T);
      return Subscription.EMPTY;
    }

    if (isSignal(input)) {
      const sub = toObservable(input as Signal<T>, { injector })
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe((value) => trigger$.next(value));
      sourceSubs.add(sub);
      sub.add(() => sourceSubs.delete(sub));
      return sub;
    }

    if (isObservable(input)) {
      const sub = (input as Observable<T>)
        .pipe(takeUntilDestroyed(destroyRef))
        .subscribe((value) => trigger$.next(value));
      sourceSubs.add(sub);
      sub.add(() => sourceSubs.delete(sub));
      return sub;
    }

    trigger$.next(input as T);
    return Subscription.EMPTY;
  };

  const method = fn as unknown as RxMethod<T>;

  method.destroy = () => {
    if (isDestroyed) return;
    isDestroyed = true;
    masterSub.unsubscribe();
    sourceSubs.forEach((s) => s.unsubscribe());
    sourceSubs.clear();
    trigger$.complete();
  };

  destroyRef.onDestroy(() => method.destroy());

  return method;
}
