import { DestroyRef, inject, Injectable, type Type } from '@angular/core';

import type { SignalTreeBuilder } from './internals/builder-types';
import type { ReadonlyStore } from './readonly';

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
  /**
   * `'readonly'` narrows the injected type to {@link ReadonlyStore} — sugar
   * over `asReadonly(tree)` (the primary readonly surface, from
   * `@signaltree/core`): read-only `$` over the tree's **accumulated** type
   * (leaf `Signal` reads, derived computeds preserved, marker surfaces
   * narrowed to their reader allowlists) plus lifecycle
   * (`destroy()`/`destroyed`). This is a **type-only** narrowing:
   * `inject(MyStore)` resolves to the exact same tree object either way, so
   * it does not protect against a deliberate `as any` bypass — it protects
   * the common case where an AI agent or developer reaches for a
   * `.set()`/mutator that simply isn't offered on the injected type. Use it
   * for components that should only read the store, pairing it with a
   * separate `@Injectable` Ops service for writes (see "Production
   * architecture" in the root README).
   *
   * Only accepted when the factory returns a real tree
   * (`signalTree(...)`-shaped, i.e. a `SignalTreeBuilder`); combining it with
   * a plain-object factory is a compile error rather than a silent no-op.
   */
  expose?: 'readonly';
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
 *
 * @example Read-only injection
 * ```ts
 * export const CounterStore = defineStore(
 *   () => signalTree({ count: 0 }),
 *   { expose: 'readonly' }
 * );
 *
 * @Component({ providers: [CounterStore] })
 * export class Display {
 *   readonly store = inject(CounterStore);
 *   read() { return this.store.$.count(); } // ✅ read-only
 *   // this.store.$.count.set(1);           // ❌ type error — not on ReadonlyStore
 * }
 * ```
 */
// Overload order matters, mirroring entityMap's config-driven overload
// precedent (entity-map.ts): the readonly-specific overload is declared
// first so `{ expose: 'readonly' }` resolves to it. Two deliberate choices
// here, both verified by the type-test harness (define-store.typing.spec.ts
// / readonly.typing.spec.ts):
//
// 1. Constrained on `SignalTreeBuilder<T, A>` (not `SignalTree<T>`/
//    `ISignalTree<T>`) because that's what `signalTree(...)` actually
//    returns — an earlier constraint on `SignalTree<T>` never matched and
//    every real call silently fell through to the generic overload.
// 2. Parameterized over the builder's accumulated `A` (not just the source
//    `T`) so `ReadonlyStore<T, A>` preserves `.derived()` computeds
//    (RFC 0004 F1), and the generic fallback overload rejects
//    `expose: 'readonly'` (`expose?: undefined`) so a factory that does NOT
//    return a builder — e.g. a plain object — is a compile error instead of
//    a silently-unnarrowed store (RFC 0004 F2 / §5 rule 4: silent-inert is
//    the priority defect class).
export function defineStore<T, A>(
  factory: () => SignalTreeBuilder<T, A>,
  config: DefineStoreConfig & { expose: 'readonly' }
): Type<ReadonlyStore<T, A>>;
/**
 * Fallback overload. `expose?: undefined` means a config variable WIDENED to
 * {@link DefineStoreConfig} matches neither overload — pass a config object
 * literal (or `as const`). Deliberate: this cliff is what makes
 * `expose: 'readonly'` misuse a compile error instead of a silent no-op.
 */
export function defineStore<R>(
  factory: () => R,
  config?: DefineStoreConfig & { expose?: undefined }
): Type<R>;
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
