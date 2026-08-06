import {
  computed,
  effect,
  Injector,
  isSignal,
  runInInjectionContext,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { deepEqual, isBuiltInObject, parsePath } from '@signaltree/shared';

declare const ngDevMode: boolean | undefined;

/**
 * @internal Dev-mode notice that a snapshot silently omitted a value.
 *
 * Deliberately NOT deduped. An earlier version keyed a suppression Set on the
 * bare property name, so the first `value`/`id`/`name` anywhere in the process
 * silenced every later one — including in a different tree — for the process
 * lifetime, hiding the second instance of every bug it found. Repeating in dev
 * is the lesser evil, and it also stops the Set growing without bound.
 */
function warnUnwrapSkipped(key: string): void {
  console.error(
    `SignalTree: "${key}" OMITTED from snapshot — value is a function that is ` +
      `neither signal nor node accessor. [ST2008]`
  );
}

/** @internal Dev-mode notice that applyState clobbered a live node. Not deduped — see above. */
function warnApplyStateOverwrite(key: string, target: unknown): void {
  if (typeof target !== 'function') return;
  console.error(
    `SignalTree: applyState REPLACED the live value at "${key}" with a raw ` +
      `value; its signal is gone. [ST2009]`
  );
}

/** Symbol to mark callable signals - must match symbol used by signal-tree */
const CALLABLE_SIGNAL_SYMBOL = Symbol.for('SignalTree:NodeAccessor');

/**
 * SignalTree Utility Functions v1.1.6
 * Core utilities for signal tree operations
 */

export { deepEqual };
export { deepEqual as equal };
export { isBuiltInObject };
export { parsePath };

/**
 * Check if a value is an EntityMapMarker
 * Used to preserve entity map markers during lazy signal tree creation
 */
export function isEntityMapMarker(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __isEntityMap?: unknown }).__isEntityMap === true
  );
}

/**
 * Check if a value is a branded loader feature produced by `loader()`.
 *
 * Kept here (a shake-safe, dependency-free property check) rather than in
 * `./markers/loader` on purpose: `entity-map.ts` calls this guard on every
 * materialized collection, so if the guard lived alongside `loader()` it would
 * statically pull the loader module — and its `attachLoader` import — into
 * every `entityMap()` consumer, defeating the whole tree-shake boundary. Mirror
 * of {@link isEntityMapMarker}.
 */
export function isLoaderFeature(
  value: unknown
): value is { __signalTreeLoader: true; attach(entity: unknown): void } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { __signalTreeLoader?: unknown }).__signalTreeLoader === true &&
      // Also require a callable `attach` — the guard's return type promises it,
      // and the factory relies on this to fail closed: a hand-forged brand
      // without `attach` must be rejected at the call site ([ST2004]), not slip
      // through and TypeError inside the marker processor's swallowed try/catch.
      typeof (value as { attach?: unknown }).attach === 'function'
  );
}

/**
 * Generic memory manager interface for lazy signal trees
 */
export interface MemoryManager {
  getSignal(path: string): WritableSignal<unknown> | undefined;
  cacheSignal(path: string, signal: WritableSignal<unknown>): void;
  dispose(): void;
}

// NodeAccessor and TreeNode are defined in ./types.ts (canonical location)
import type { NodeAccessor, TreeNode } from './types';

/**
 * Checks if a value is a node accessor created by makeNodeAccessor
 */
export function isNodeAccessor(value: unknown): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' && value && CALLABLE_SIGNAL_SYMBOL in value
  );
}

/**
 * Checks if a value is either an Angular signal or a callable signal
 * This is useful for packages that need to work with both types
 */
export function isAnySignal(value: unknown): boolean {
  return isSignal(value) || isNodeAccessor(value);
}

/**
 * Checks if a value is a non-null object or function — the permissive
 * "can this have own enumerable children worth recursing into" test that
 * every hand-written tree walker in this codebase needs. Node accessors and
 * leaf signals are callable (`typeof === 'function'`); plain nested state
 * literals are plain objects (`typeof === 'object'`) — a walker that only
 * accepts one of the two silently skips half the tree.
 *
 * This is intentionally broader than {@link isNodeAccessor} or
 * {@link isAnySignal}, which check for a *specific* shape. Use this as the
 * "should I keep walking?" guard before those narrower checks decide what
 * to do with the value.
 *
 * Typed as a guard narrowing to `object` (which in TypeScript includes
 * callables), so callers can pass the value to `Object.keys()` /
 * `WeakSet#has()` without re-asserting what the guard already proved.
 */
export function isTraversableNode(value: unknown): value is object {
  return (
    value != null && (typeof value === 'object' || typeof value === 'function')
  );
}

/**
 * Converts a NodeAccessor (SignalTree slice or whole tree) into a WritableSignal
 * for use with any API that expects a `WritableSignal` — e.g. as an Angular
 * Signal Forms model, or the value fed to `SignalFormControl`. (Note: Angular
 * has no `FormControl.connect(signal)` API — see `signalForm()` for the
 * signal-native forms bridge.)
 *
 * Creates a two-way binding between the NodeAccessor and a WritableSignal:
 * - Reads all leaf values from the NodeAccessor and exposes them as a signal
 * - Writes to the WritableSignal update the underlying NodeAccessor
 *
 * **Important**: This function uses `effect()` internally for synchronization, which requires
 * an injection context. It can be called in:
 * - Component/directive/pipe class field initializers
 * - Component/directive/pipe constructors
 * - Functions called from within an injection context
 *
 * @template T - The type of the node value
 * @param node - The NodeAccessor to convert (can be a slice or whole tree)
 * @returns A WritableSignal that stays in sync with the NodeAccessor
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   user: { name: '', email: '' }
 * });
 *
 * // Convert a slice to a WritableSignal (e.g. a Signal Forms model)
 * const userSignal = toWritableSignal(tree.$.user);
 *
 * // Leaves are already WritableSignal - no conversion needed
 * const nameSignal = tree.$.user.name; // ✅ Already a WritableSignal
 * ```
 */
export function toWritableSignal<T>(
  node: NodeAccessor<T>,
  injector?: unknown
): WritableSignal<T> {
  // Create a signal initialized with the current node value
  const sig = signal(node());

  // Capture original setter before overriding so tree->signal sync doesn't write back and loop
  const originalSet = sig.set.bind(sig);

  // Effect to sync tree (NodeAccessor) changes into the writable signal
  // We intentionally track dependencies inside node() so updates to any leaf propagate.
  const runner = () => {
    originalSet(node() as T);
  };
  if (injector) {
    runInInjectionContext(injector as Injector, () => effect(runner));
  } else {
    try {
      effect(runner);
    } catch {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(
          '[SignalTree] toWritableSignal called without injection context; pass Injector for reactivity.'
        );
      }
    }
  }

  // Override set to write back to the NodeAccessor, then update local signal
  sig.set = (value: T) => {
    node(value);
    originalSet(value);
  };

  // Override update to write back using set pathway
  sig.update = (updater: (current: T) => T) => {
    sig.set(updater(sig()));
  };

  return sig;
}

export function composeEnhancers<T>(
  ...enhancers: Array<(tree: T) => T>
): (tree: T) => T {
  return (tree: T) => enhancers.reduce((t, e) => e(t), tree);
}

/**
 * @internal Per-node materialisation cache — the incremental half of `tree()`.
 *
 * Materialising is O(state): there is no plain object anywhere until one is
 * built. But a write touches ONE leaf, so rebuilding the whole tree to observe
 * it is the full-state-work-per-change anti-pattern this library exists to
 * avoid — the video-frame principle, applied to state.
 *
 * Each node's materialisation is memoised in a `computed`, so Angular's own
 * dependency graph does the work: a node rebuilds only when a signal BENEATH IT
 * actually changed, and every clean subtree is returned BY REFERENCE. That is
 * why this is a `computed` rather than a hand-rolled dirty flag — the
 * invalidation already happens on the write path, so incremental
 * materialisation costs the write path nothing at all. (Measured alternative:
 * manual version stamping costs +7.6ns to +68.5ns per write depending on depth;
 * early-exit dirty flags +3.7ns. This costs zero.)
 *
 * Measured, write one leaf then read the whole state, 200x:
 *
 *   grid 100x100 (10k leaves)   489.1us -> 8.6us   56.7x   99/100 shared
 *   grid 1000x20 (20k leaves)  1127.0us -> 47.8us  23.6x   999/1000 shared
 *   deep nest 50                   2.2us -> 2.2us   1.0x   (nothing wide)
 *
 * No win on deep-narrow shapes, and that is expected: this is a WIDTH
 * optimisation. Depth is cheap to rebuild (measured elsewhere at 0.4% of the
 * allocation bill for a 15-deep, 50k-wide immutable update); width is the
 * entire cost.
 *
 * TWO CONSEQUENCES, both real:
 *
 * 1. `tree()` no longer returns a freshly-allocated object. MUTATING THE RESULT
 *    CORRUPTS THE CACHE and the mutation is visible to later reads. Snapshots
 *    were always meant to be read-only; now it is load-bearing. Callers that
 *    need to mutate must copy first (`structuredClone`, or spread what they
 *    need). timeTravel already structuredClones, so it is unaffected.
 *
 * 2. Reading `tree()` inside a `computed`/`effect` now takes a dependency on
 *    per-node computeds rather than on every leaf individually. Same
 *    reactivity, finer granularity — a write to an unrelated subtree no longer
 *    forces the consumer to rebuild anything it did not read.
 *
 * The cache is a WeakMap keyed on the node, so it is collected with the tree,
 * and each entry is created lazily on first materialisation: a tree that never
 * calls `tree()` allocates nothing here.
 */
const MATERIALIZED = new WeakMap<object, Signal<unknown>>();

/**
 * Same symbol `makeNodeAccessor` stamps on every accessor. Duplicated here
 * rather than imported because signal-tree.ts imports THIS module — and
 * `Symbol.for` is a global registry lookup, so both spellings resolve to the
 * identical symbol.
 */
const NODE_STORE_SYMBOL = Symbol.for('SignalTree:NodeStore');

/**
 * A node is reachable two ways — as the accessor (`tree.$.a`) and as the raw
 * store the accessor wraps — and both materialise the same subtree. Keying the
 * memo on the STORE collapses them onto one cache entry, so `tree()` and
 * `unwrap(tree.$.a)` hand back the SAME object rather than two equal copies.
 * Without this the structural sharing silently splits in half.
 */
/**
 * Only GENUINE tree nodes may be memoised.
 *
 * A `computed` over a non-reactive plain object has no dependencies, so it never
 * invalidates and the snapshot is stale forever. `snapshotState()` is public and
 * takes `unknown`, so without this guard any caller handing it a plain object —
 * a mock in a test, a detached sub-object, a hand-built state bag — would get a
 * value frozen at first read, silently and permanently.
 *
 * A WeakSet rather than a stamped symbol: `unwrap` copies own symbol keys into
 * the snapshot, so a marker property would leak into every materialised result.
 */
const TREE_STORES = new WeakSet<object>();

/** @internal Registers a store created by `createSignalStore` as memoisable. */
export function markTreeStore(store: object): void {
  TREE_STORES.add(store);
}

function isMemoisable(node: object): boolean {
  return TREE_STORES.has(node) || isNodeAccessor(node);
}

function memoKey(node: object): object {
  const store = (node as Record<symbol, unknown>)[NODE_STORE_SYMBOL];
  return store !== undefined && store !== null ? (store as object) : node;
}

function materialized<T>(node: object, build: () => T): T {
  const key = memoKey(node);
  let memo = MATERIALIZED.get(key) as Signal<T> | undefined;
  if (memo === undefined) {
    memo = computed(() => {
      const built = build();
      // Snapshots were always meant to be read-only; with the memo in place it
      // is load-bearing, because a mutated result IS the cache and the change
      // would silently survive into every later read. Freezing each node in dev
      // turns that into an immediate TypeError in strict mode (all ES modules)
      // instead of a corrupted tree discovered much later.
      //
      // Shallow, per node: the node's own object is frozen, and every child
      // node is frozen by its own memo. A deep freeze would have to walk leaf
      // VALUES too, which is O(state) — exactly the cost this exists to avoid.
      // Leaf values are already defensive copies (see the isSignal branch in
      // unwrap), so mutating one cannot reach live state; it can only corrupt
      // that snapshot.
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        if (built !== null && typeof built === 'object') Object.freeze(built);
      }
      return built;
    });
    MATERIALIZED.set(key, memo as Signal<unknown>);
  }
  return memo();
}

/**
 * @internal Materialise one tree node, memoised. This is the entry point the
 * tree callables use — see {@link materialized} for why it is a `computed`.
 */
export function materializeNode<T>(store: object): T {
  if (!isMemoisable(store)) return unwrap<T>(store);
  return materialized(store, () => unwrap<T>(store));
}

/** @internal The uncached build for one NodeAccessor. See {@link materialized}. */
function buildFromAccessor<T>(node: NodeAccessor<unknown>): T {
    const result = {} as Record<string, unknown>;

    for (const key in node as unknown as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

      const value = (node as unknown as Record<string, unknown>)[key];

      // A node IS a function, so `length`, `name` and `prototype` may be the
      // function's own intrinsics rather than state. Distinguish by VALUE, not
      // by name: state always arrives as a leaf signal or a child accessor, so
      // anything else under these keys is the intrinsic and is skipped.
      // Name-only skipping silently deleted real state — `{ cfg: { length: 3 } }`
      // unwrapped to `{ cfg: {} }`.
      if (
        (key === 'length' || key === 'prototype' || key === 'name') &&
        !isSignal(value) &&
        !isNodeAccessor(value)
      ) {
        continue;
      }

      if (isNodeAccessor(value)) {
        result[key] = unwrap(value);
      } else if (isSignal(value)) {
        const unwrappedValue = (value as Signal<unknown>)();
        if (
          typeof unwrappedValue === 'object' &&
          unwrappedValue !== null &&
          !Array.isArray(unwrappedValue) &&
          !isBuiltInObject(unwrappedValue)
        ) {
          result[key] = unwrap(unwrappedValue);
        } else {
          result[key] = unwrappedValue;
        }
      } else if (typeof value === 'function') {
        // Skip functions so snapshots stay plain-data. A materialized marker
        // that is a plain callable lands here too, so its VALUE silently
        // vanishes from the snapshot rather than being unwrapped.
        if (typeof ngDevMode === 'undefined' || ngDevMode) {
          warnUnwrapSkipped(key);
        }
        continue;
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !isBuiltInObject(value)
      ) {
        result[key] = unwrap(value);
      } else {
        result[key] = value;
      }
    }

  return result as T;
}

/**
 * Unwraps a signal or signal tree into a plain JS value shaped as T.
 * NOTE: Runtime strips the dynamic set/update helpers; call sites receive T.
 */
export function unwrap<T>(node: TreeNode<T>): T;
export function unwrap<T>(node: NodeAccessor<T> & TreeNode<T>): T;
export function unwrap<T>(node: NodeAccessor<T>): T;
export function unwrap<T>(node: unknown): T;
export function unwrap<T>(node: unknown): T {
  if (node === null || node === undefined) {
    return node as T;
  }

  // Handle callable signals first
  if (isNodeAccessor(node)) {
    // Memoised per node — see materialized(). Clean subtrees are returned by
    // reference, so a one-leaf write does not rebuild the whole tree.
    return isMemoisable(node)
      ? materialized(node, () =>
          buildFromAccessor<T>(node as NodeAccessor<unknown>)
        )
      : buildFromAccessor<T>(node as NodeAccessor<unknown>);
  }
  if (isSignal(node)) {
    const value = (node as Signal<unknown>)();
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      return unwrap(value) as T;
    }
    return value as T;
  }

  if (typeof node !== 'object') {
    return node as T;
  }

  if (Array.isArray(node)) {
    return node as T;
  }

  if (isBuiltInObject(node)) {
    return node as T;
  }

  const result = {} as Record<string, unknown>;

  for (const key in node as Record<string, unknown>) {
    if (!Object.prototype.hasOwnProperty.call(node, key)) continue;

    const value = (node as Record<string, unknown>)[key];

    // NOTE: there was a name-based skip for `set`/`update` here. A leaf signal
    // IS a function, so it dropped state stored under those keys — `set` and
    // `update` are ordinary words (permission sets, an `update` timestamp) and
    // they vanished from every snapshot, every persisted payload and every
    // structuredClone, silently. The general plain-function skip below already
    // covers the case it was written for, and covers it by value rather than
    // by name.

    if (
      typeof value === 'function' &&
      !isNodeAccessor(value) &&
      !isSignal(value)
    ) {
      // Skip plain functions so snapshots stay plain-data.
      continue;
    }

    if (isNodeAccessor(value)) {
      // Take the child's materialisation AS IS. Calling `unwrap()` on it again
      // deep-copied a plain object that was already plain — pure waste, and it
      // destroyed the structural sharing the memo exists to produce: every
      // parent read minted a fresh copy of every child, so NO subtree was ever
      // reference-stable and a one-leaf write still cost O(state) downstream.
      // (The identical-looking recursion in the `isSignal` branch below IS
      // load-bearing: a leaf's VALUE is user data, and copying it is what keeps
      // a snapshot from aliasing live state.)
      result[key] = value();
    } else if (isSignal(value)) {
      const unwrappedValue = (value as Signal<unknown>)();
      if (
        typeof unwrappedValue === 'object' &&
        unwrappedValue !== null &&
        !Array.isArray(unwrappedValue) &&
        !isBuiltInObject(unwrappedValue)
      ) {
        result[key] = unwrap(unwrappedValue);
      } else {
        result[key] = unwrappedValue;
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      result[key] = unwrap(value);
    } else {
      result[key] = value;
    }
  }

  const symbols = Object.getOwnPropertySymbols(node as object);
  for (const sym of symbols) {
    const value = (node as Record<symbol, unknown>)[sym];

    if (
      typeof value === 'function' &&
      !isNodeAccessor(value) &&
      !isSignal(value)
    ) {
      // Skip plain functions so snapshots stay plain-data.
      continue;
    }

    if (isNodeAccessor(value)) {
      // Take the child's materialisation AS IS. Calling `unwrap()` on it again
      // deep-copied a plain object that was already plain — pure waste, and it
      // destroyed the structural sharing the memo exists to produce: every
      // parent read minted a fresh copy of every child, so NO subtree was ever
      // reference-stable and a one-leaf write still cost O(state) downstream.
      // (The identical-looking recursion in the `isSignal` branch below IS
      // load-bearing: a leaf's VALUE is user data, and copying it is what keeps
      // a snapshot from aliasing live state.)
      (result as Record<symbol, unknown>)[sym] = value();
    } else if (isSignal(value)) {
      const unwrappedValue = (value as Signal<unknown>)();
      if (
        typeof unwrappedValue === 'object' &&
        unwrappedValue !== null &&
        !Array.isArray(unwrappedValue) &&
        !isBuiltInObject(unwrappedValue)
      ) {
        (result as Record<symbol, unknown>)[sym] = unwrap(unwrappedValue);
      } else {
        (result as Record<symbol, unknown>)[sym] = unwrappedValue;
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !isBuiltInObject(value)
    ) {
      (result as Record<symbol, unknown>)[sym] = unwrap(value);
    } else {
      (result as Record<symbol, unknown>)[sym] = value;
    }
  }

  return result as unknown as T;
}

/**
 * Snapshot the current tree state into a plain JS object by unwrapping signals.
 */
export function snapshotState<T>(state: TreeNode<T>): T {
  // Routed through the memo, not bare `unwrap`. Every snapshot consumer —
  // time travel, devtools, serialisation — was rebuilding the entire tree on
  // every call while `tree()` next door returned a memoised result, because
  // this took the raw store and `unwrap`'s uncached path.
  return state !== null && typeof state === 'object'
    ? materializeNode<T>(state as unknown as object)
    : (unwrap(state as unknown) as T);
  // materializeNode falls back to a plain walk for anything that is not a
  // registered tree store or a node accessor — see isMemoisable().
}

/**
 * Apply a plain JS snapshot onto a TreeNode (state.$) by writing into signals or node accessors.
 * This is a shallow/apply operation suitable for devtools/time-travel use-cases.
 */
export function applyState<T>(stateNode: TreeNode<T>, snapshot: T): void {
  if (snapshot === null || snapshot === undefined) return;
  if (typeof snapshot !== 'object') return;

  // Special-case EntitySignal-like nodes: restore via setAll() when possible
  // so internal storage stays consistent.
  if (
    stateNode &&
    typeof stateNode === 'object' &&
    typeof (stateNode as any).setAll === 'function' &&
    snapshot &&
    typeof snapshot === 'object' &&
    Array.isArray((snapshot as any).all)
  ) {
    try {
      (stateNode as any).setAll((snapshot as any).all);
      return;
    } catch {
      // fall back to generic application
    }
  }

  for (const key of Object.keys(snapshot as Record<string, unknown>)) {
    // SECURITY: `snapshot` is untrusted. The devtools channel reaches here via
    // a bare JSON.parse of a window.postMessage payload, and JSON.parse creates
    // a real OWN `__proto__` key, so Object.keys yields it. Reading
    // `stateNode['__proto__']` then handed back Object.prototype, which is an
    // object, so the branch below RECURSED INTO Object.prototype and the next
    // level assigned onto it — full process-wide pollution from one message,
    // with no enterprise package and no lazy tree involved.
    //
    // Own-ness is the load-bearing guard — without it applyState walks into
    // ANYTHING on the prototype chain, not just a named few — and `__proto__`
    // is refused by name on top, because a minted own `__proto__` would
    // otherwise satisfy own-ness forever. `constructor`/`prototype` need no
    // name check: own-ness already stops the fall-through, and blocking them by
    // name would delete legitimate state under those keys.
    if (key === '__proto__') continue;
    if (!Object.prototype.hasOwnProperty.call(stateNode, key)) continue;

    const val = (snapshot as Record<string, unknown>)[key];
    const target = (stateNode as Record<string, unknown>)[key];

    if (isNodeAccessor(target)) {
      if (val && typeof val === 'object') {
        try {
          applyState(
            target as unknown as TreeNode<unknown>,
            val as unknown as any
          );
        } catch {
          try {
            (target as any)(val);
          } catch {
            // swallow
          }
        }
      } else {
        try {
          (target as any)(val);
        } catch {
          // ignore
        }
      }
    } else if (isSignal(target)) {
      try {
        (target as any).set?.(val);
      } catch {
        try {
          (target as any)(val);
        } catch {
          // ignore
        }
      }
    } else if (
      target &&
      typeof target === 'object' &&
      val &&
      typeof val === 'object' &&
      !Array.isArray(target) &&
      !Array.isArray(val)
    ) {
      try {
        applyState(
          target as unknown as TreeNode<unknown>,
          val as unknown as any
        );
      } catch {
        try {
          (stateNode as Record<string, unknown>)[key] = val as unknown;
        } catch {
          // ignore
        }
      }
    } else {
      // Neither a writable signal nor a traversable node: this assignment
      // REPLACES whatever lives at that key with a raw value. If it was a
      // materialized marker (a plain callable), the live signal is destroyed
      // and subsequent reads of it throw.
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        warnApplyStateOverwrite(key, target);
      }
      try {
        (stateNode as Record<string, unknown>)[key] = val as unknown;
      } catch {
        // ignore
      }
    }
  }
}

export function deepCloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
