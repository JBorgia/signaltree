import { DestroyRef, inject, Injectable, type Type } from '@angular/core';

/**
 * Config for {@link defineStore}.
 */
export interface DefineStoreConfig {
  /**
   * Where to provide the store. `'root'`/`'platform'` make it an app-wide
   * singleton (like `@Injectable({ providedIn: 'root' })`); omit/`null` to
   * provide it locally via a component/route `providers` array.
   */
  providedIn?: 'root' | 'platform' | null;
}

/**
 * Wrap a `signalTree(...)` factory in an injectable Angular service class — the
 * idiomatic Angular DI pattern for a tree, comparable to NgRx SignalStore's
 * `signalStore()`.
 *
 * `inject(MyStore)` resolves to the **real tree** — callable, with `$`, `state`,
 * `.with(...)`, and any enhancer-added methods — not a wrapper. The tree's
 * `destroy()` is tied to the host injector's lifecycle via `DestroyRef`, so a
 * component-provided store tears down with the component and a root store with
 * the app.
 *
 * The factory runs inside Angular's injection context, so it may call `inject()`
 * (e.g. to read other services) and use `.with(enhancer())` / `.derived(...)`.
 *
 * @example
 * ```ts
 * import { signalTree, defineStore } from '@signaltree/core';
 *
 * export const CounterStore = defineStore(() =>
 *   signalTree({ count: 0 })
 * );
 *
 * // App-wide singleton:
 * export const SettingsStore = defineStore(
 *   () => signalTree({ theme: 'light' }),
 *   { providedIn: 'root' }
 * );
 *
 * @Component({ providers: [CounterStore] })
 * export class Counter {
 *   readonly store = inject(CounterStore);
 *   inc() { this.store.$.count.update((n) => n + 1); }
 * }
 * ```
 */
export function defineStore<R>(
  factory: () => R,
  config: DefineStoreConfig = {}
): Type<R> {
  @Injectable({ providedIn: config.providedIn ?? null })
  class SignalTreeStore {
    constructor() {
      const tree = factory();

      // Tie the tree's teardown to the host injector — component-provided stores
      // dispose with the component, root stores with the app. (NgRx SignalStore
      // ties teardown to the injector's DestroyRef the same way.)
      inject(DestroyRef).onDestroy(() => {
        try {
          (tree as { destroy?: () => void }).destroy?.();
        } catch {
          /* destroy() is idempotent — ignore double-teardown */
        }
      });

      // A constructor that returns an object makes `new SignalTreeStore()`
      // resolve to THAT object. Angular instantiates the token with `new`, so
      // `inject(MyStore)` yields the real tree (full callable API), not this
      // wrapper instance — no proxy, no property copying, no lost call signature.
      return tree as object;
    }
  }

  return SignalTreeStore as unknown as Type<R>;
}
