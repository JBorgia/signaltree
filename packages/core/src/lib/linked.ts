import { linkedSignal, type WritableSignal } from '@angular/core';

/**
 * Options for the source form of {@link linked}.
 *
 * @typeParam S - the source value type
 * @typeParam V - the linked (writable) value type
 */
export interface LinkedOptions<S, V> {
  /**
   * Reactive source. Read other tree state here, e.g. `() => $.options()`.
   * Whenever it changes, `computation` re-runs and resets the linked value
   * (unless a manual `.set()`/`.update()` is later overridden by the next
   * source change).
   */
  source: () => S;
  /**
   * Derive the value from the current source. `previous` carries the prior
   * `{ source, value }` so you can preserve an intent across source changes
   * (e.g. keep the selected item if it still exists after the list refreshes).
   *
   * `NoInfer` (mirroring Angular's `linkedSignal`) keeps `S`/`V` from being
   * inferred off these parameter positions — `S` resolves from `source`'s
   * return and `V` from this function's return, avoiding circular inference.
   */
  computation: (
    source: NoInfer<S>,
    previous?: { source: NoInfer<S>; value: NoInfer<V> }
  ) => V;
  /** Custom equality for the linked value (defaults to Angular's `Object.is`). */
  equal?: (a: NoInfer<V>, b: NoInfer<V>) => boolean;
}

/**
 * Create a **derived-but-writable** signal, comparable to NgRx SignalStore's
 * `withLinkedState`. It wraps Angular's native `linkedSignal`: the value is
 * computed from a source, but is also directly writable (`.set()` /
 * `.update()`), and re-derives whenever the source changes.
 *
 * Use it inside `.derived($ => ({ ... }))`, where the tree `$` is available as the
 * source (a bare state-literal marker can't reference sibling paths at build
 * time). It merges in as a real `WritableSignal` — both at runtime and, with the
 * `ProcessDerived` writability fix, at the type level (so `.set()` type-checks).
 *
 * @example Sticky selection that survives a list refresh
 * ```ts
 * const tree = signalTree({ options: [] as Option[] }).derived(($) => ({
 *   selected: linked({
 *     source: () => $.options(),
 *     // Annotate the return type — like Angular's linkedSignal, TS can't infer
 *     // it from the body when `prev.value` is referenced.
 *     computation: (opts, prev): Option | undefined =>
 *       opts.find((o) => o.id === prev?.value?.id) ?? opts[0],
 *   }),
 * }));
 *
 * tree.$.selected();          // derived from options
 * tree.$.selected.set(other); // user override (writable)
 * // → when $.options changes, `computation` re-runs from the new list.
 * ```
 *
 * @example Simple writable-derived (no explicit source)
 * ```ts
 * .derived(($) => ({ doubled: linked(() => $.count() * 2) }))
 * // doubled() reads; doubled.set(n) overrides until count() changes again.
 * ```
 */
export function linked<V>(computation: () => V): WritableSignal<V>;
export function linked<S, V>(options: LinkedOptions<S, V>): WritableSignal<V>;
export function linked<S, V>(
  arg: (() => V) | LinkedOptions<S, V>
): WritableSignal<V> {
  if (typeof arg === 'function') {
    return linkedSignal(arg as () => V);
  }
  const { source, computation, equal } = arg;
  return linkedSignal<S, V>({
    source,
    computation,
    ...(equal ? { equal } : {}),
  });
}
