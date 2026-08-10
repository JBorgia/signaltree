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
import {
  hydrateMarkerNode,
  snapshotMarkerNode,
} from './internals/materialize-markers';

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

/**
 * Marks a materialised node as excluded from TIME-TRAVEL capture only.
 *
 * Set by `entityMap({ history: false })`. Every other snapshot consumer —
 * `serialization()`, `persistence()`, devtools, audit — still sees the node in
 * full; only `timeTravel()` prunes it from the entry it records. See RFC 0012
 * for why the two needed separating: `transient: true` opted out of BOTH, so a
 * large streaming collection either paid O(collection) per recorded write or
 * did not persist at all.
 *
 * `SignalTree:`-prefixed deliberately — `buildFromStore`'s symbol loop skips
 * that prefix by identity, so the mark can never itself reach a payload.
 */
export const HISTORY_EXCLUDED = Symbol.for('SignalTree:HistoryExcluded');

/**
 * @internal Remove history-excluded nodes from an already-built snapshot.
 *
 * Walks the LIVE tree and the PLAIN snapshot in step: the mark lives on the
 * live node, the keys to drop live in the snapshot. Returns the same object
 * when nothing is excluded, so a tree without the flag pays one shallow walk
 * and allocates nothing — and structural sharing downstream is preserved
 * because the identical reference comes back.
 *
 * Restore is symmetric and needs no counterpart: a pruned key is simply absent
 * from the entry, and `recursiveUpdate` already leaves absent keys alone.
 */
const PRUNED = new WeakMap<object, unknown>();

export function pruneHistoryExcluded<T>(snapshot: T, liveNode: unknown): T {
  // Memoised on the INPUT snapshot, and this is load-bearing rather than an
  // optimisation. `addEntry` dedupes history by REFERENCE — `tree()` hands back
  // the identical object when nothing changed, so `last.state === entry.state`
  // is an exact O(1) test for "no-op write". Pruning built a fresh object every
  // call, which made that test never fire: duplicate entries accumulated and
  // `undo()` stepped onto one and appeared to do nothing.
  //
  // Same input snapshot -> same pruned output preserves the contract. The
  // WeakMap is keyed on the memoised snapshot, so entries die with it.
  if (snapshot !== null && typeof snapshot === 'object') {
    const hit = PRUNED.get(snapshot as object);
    if (hit !== undefined) return hit as T;
  }
  const result = pruneUncached(snapshot, liveNode);
  if (snapshot !== null && typeof snapshot === 'object') {
    PRUNED.set(snapshot as object, result);
  }
  return result;
}

/**
 * @internal Are two PRUNED snapshots the same observable state?
 *
 * Exists because `history: false` produced PHANTOM undo steps. The dedupe in
 * `addEntry` is `last.state === entry.state`, which is exact for unpruned
 * snapshots — structural sharing hands back the identical object when nothing
 * changed. Pruning breaks that identity: a write to an EXCLUDED collection still
 * makes a new root, and `pruneUncached` copies every node on the path down to the
 * excluded key, so two snapshots that differ only inside excluded state come back
 * as structurally identical but referentially distinct objects. The `===` missed
 * them and each one became an entry.
 *
 * MEASURED before this: five writes to an `entityMap({ history: false })` produced
 * five entries with `canUndo() === true`, and the undo changed nothing a user could
 * see — a dead Ctrl+Z, which is worse than no undo because it spends a step the
 * user believes they had.
 *
 * NOT a deep equal. Reference identity short-circuits at every level, and recursion
 * happens ONLY where both sides are plain objects whose references already differ —
 * which, given structural sharing, is exactly the copied path that pruning created.
 * A tree with no exclusions never gets here at all (the `===` fast path in
 * `addEntry` catches it), and a real change short-circuits false on the first
 * differing reference.
 */
export function prunedEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false;
  }
  // Arrays and built-ins are LEAF values here: a differing reference means a
  // differing value. Only plain objects are on a pruned copy path.
  if (Array.isArray(a) || Array.isArray(b)) return false;
  if (isBuiltInObject(a) || isBuiltInObject(b)) return false;

  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (
      !prunedEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k]
      )
    ) {
      return false;
    }
  }
  return true;
}

function pruneUncached<T>(snapshot: T, liveNode: unknown): T {
  if (
    snapshot === null ||
    typeof snapshot !== 'object' ||
    Array.isArray(snapshot) ||
    !isTraversableNode(liveNode)
  ) {
    return snapshot;
  }

  const live = liveNode as Record<string, unknown>;
  let copy: Record<string, unknown> | undefined;

  for (const key of Object.keys(snapshot as Record<string, unknown>)) {
    const liveChild = live[key];
    if (liveChild === undefined || liveChild === null) continue;

    if (
      typeof liveChild === 'object' &&
      (liveChild as Record<symbol, unknown>)[HISTORY_EXCLUDED] === true
    ) {
      copy ??= { ...(snapshot as Record<string, unknown>) };
      delete copy[key];
      continue;
    }

    // Recurse only into branches — a leaf's value cannot carry the mark.
    if (isNodeAccessor(liveChild) || isTraversableNode(liveChild)) {
      const child = (snapshot as Record<string, unknown>)[key];
      if (
        child !== null &&
        typeof child === 'object' &&
        !Array.isArray(child)
      ) {
        const pruned = pruneUncached(child, liveChild);
        if (pruned !== child) {
          copy ??= { ...(snapshot as Record<string, unknown>) };
          copy[key] = pruned;
        }
      }
    }
  }

  return (copy ?? snapshot) as T;
}

/** Symbol to mark callable signals - must match symbol used by signal-tree */
const CALLABLE_SIGNAL_SYMBOL = Symbol.for('SignalTree:NodeAccessor');

/**
 * SignalTree Utility Functions v1.1.6
 * Core utilities for signal tree operations
 */

export { deepEqual };
// `export { deepEqual as equal }` was REMOVED in 15.0.0. See
// shared/src/lib/deep-equal.ts for why: `equal` is the OPTION key throughout the
// library and cannot also be a function export.
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
 * @internal A materialised marker snapshots ITSELF.
 *
 * This replaces two hardcoded duck-type tests (`isStatusNode`, `isEntityNode`)
 * that no user-registered marker could ever join, and that had to guess at what
 * each marker considered state. The marker registry already knew — it just had
 * no way to say so until `snapshot()` existed.
 *
 * The lookup is an O(1) read of a symbol stamped at `create()` time, not a scan
 * over registered processors: this runs on every node of every materialisation,
 * and a scan would let one slow third-party predicate degrade trees that do not
 * contain that marker.
 *
 * (An earlier revision of this comment attributed that lookup to an `owns()`
 * hook. There is no such hook and there never was — see the note on
 * PROCESSOR_STAMP in materialize-markers.ts. The name leaked out of a design
 * proposal into three comments and then into a research document that repeated
 * it as fact; this was the last copy.)
 *
 * Returns `undefined` for anything that is not a marker, or whose processor
 * declines a snapshot — `stored()` is already a real signal, so the ordinary
 * walk handles it.
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
      // ⚠️ THE FREEZE IS PER NODE AND DOES NOT REACH LEAF VALUES.
      //
      // `snapshot.a = x` throws. `snapshot.someDate.setFullYear(1999)` does
      // not — and it corrupts LIVE STATE, because a leaf holding a Date, Map,
      // Set or Array is handed out BY REFERENCE. Measured: mutating any of the
      // four through a snapshot changes what the tree returns. Only plain
      // object leaves are copied (see the isSignal branch in unwrap).
      //
      // Deliberately not fixed, on measurement rather than principle:
      //  - Copying leaf values costs +54us against 1.0us on a 50k array —
      //    55x, which is precisely the materialisation tax the memo exists to
      //    remove, paid on every read.
      //  - Freezing them does not work. `Object.freeze` protects Array.push
      //    and nothing else here: Date.setFullYear, Map.set and Set.add all
      //    mutate through internal slots and ignore it entirely. Half a
      //    guarantee reads as a whole one.
      //  - Freezing would also freeze LIVE state, since the value is shared.
      //
      // So this is contract, not enforcement: a snapshot is read-only ALL THE
      // WAY DOWN. Mutating a value you got out of `tree()` is the same class of
      // mistake as mutating a signal's value in place, which is already ST2003.
      // Pinned by snapshot-aliasing.spec.ts so it stays known rather than
      // rediscovered.
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

/**
 * Marks a signal as DERIVED, so `unwrap()` leaves it out of every snapshot.
 *
 * A snapshot carries state. A derived value is by definition recomputable from
 * state, so freezing one into a payload produces a number that was true once —
 * the `map: {}` failure in a different costume: not absent data, WRONG data.
 *
 * Before this stamp, whether a derived appeared in `tree()` depended on TOUCH
 * ORDER, which nothing documented and no test covered:
 *
 *   tree() first, never touch `$`  → absent   (correct, by accident)
 *   touch `$` at all, then tree()  → PRESENT  (wrong)
 *
 * because `finalize()` (the `$` getter) runs `applyDerivedFactories`, while the
 * `tree()` call path runs only `materializeOnly()`. Every real application is
 * the second case — you write state through `$`, then persist. So in practice
 * derived values were being persisted, and going stale in storage.
 *
 * The `SignalTree:` prefix is load-bearing for the same reason it is on
 * `PROCESSOR_STAMP`: `unwrap`'s symbol loop skips that prefix by identity, so
 * the stamp itself can never leak into a payload.
 *
 * Only NON-WRITABLE signals are stamped. `.derived()` is for derived state, but
 * a writable signal placed there is real state and must still be captured —
 * excluding it would trade one silent data loss for another.
 */
const DERIVED_STAMP = Symbol.for('SignalTree:Derived');

/** @internal Stamp a derived signal so snapshots skip it. Returns it. */
export function stampDerived<T>(sig: T): T {
  if (
    isTraversableNode(sig) &&
    typeof (sig as { set?: unknown }).set !== 'function'
  ) {
    Object.defineProperty(sig, DERIVED_STAMP, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }
  return sig;
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

  // Handle callable signals first.
  //
  // ONE BUILDER. An accessor is materialised by walking its BACKING STORE, not
  // the accessor itself. There used to be a second builder (buildFromAccessor)
  // that walked the accessor, and because memoKey() resolves an accessor to its
  // store, both wrote to the SAME memo cell — so whichever entry point read a
  // node first decided its snapshot, permanently. That made ST2008 fire or not
  // depending on read order, and made the two builders disagree on symbol keys.
  //
  // The store direction is the correct one to keep, for three reasons:
  //   - a store carries NO own symbols, while an accessor carries its
  //     `SignalTree:NodeAccessor` and `SignalTree:NodeStore` brands, which a
  //     symbol-copying walk would stamp into every snapshot;
  //   - a store is a plain object, so the `length`/`name`/`prototype` intrinsic
  //     skip that only existed because an accessor IS a function is no longer
  //     needed;
  //   - the store walk takes a child accessor's materialisation BY REFERENCE
  //     (`value()`), where the accessor walk re-copied it via `unwrap()` and
  //     destroyed the structural sharing the memo exists to produce.
  if (isNodeAccessor(node)) {
    // Memoised per node — see materialized(). Clean subtrees are returned by
    // reference, so a one-leaf write does not rebuild the whole tree.
    // memoKey() IS the accessor->store resolution, so reusing it here is not a
    // convenience: it guarantees the object we BUILD FROM is the same object the
    // memo is KEYED ON. Two different answers to that question is what produced
    // the shared-cell bug in the first place.
    const target = memoKey(node as object);
    return isMemoisable(node)
      ? materialized(node, () => buildFromStore<T>(target))
      : buildFromStore<T>(target);
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

  return buildFromStore<T>(node as object);
}

/**
 * @internal THE builder. Every snapshot of a tree node is produced here —
 * `tree()`, `snapshotState()`, `unwrap()` of an accessor, and every nested
 * child — so there is exactly one place that decides what a property
 * contributes to a snapshot.
 *
 * This used to be two near-duplicate loops (this one, plus `buildFromAccessor`
 * for the accessor side) that shared a single memo cell and had already drifted:
 * only one of them carried the ST2008 diagnostic, and only one of them copied
 * symbol keys. See the comment on the accessor branch of `unwrap()`.
 */
function buildFromStore<T>(node: object): T {
  // A materialised marker snapshots itself — see snapshotMarkerNode().
  const own = snapshotMarkerNode(node);
  if (own) return own.value as T;

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

    // A materialised marker may be an unbranded CALLABLE (form, asyncSource):
    // neither signal nor accessor, so the function-skip below would drop it and
    // its value with it. Ask the registry first — that is the whole reason
    // `snapshot()` exists.
    // A DERIVED value is recomputable from state, so it is not state. Freezing
    // one into a payload yields a number that was true once. Skipped silently:
    // this is the documented rule, not a mistake worth reporting.
    if (
      value &&
      (typeof value === 'function' || typeof value === 'object') &&
      (value as Record<symbol, unknown>)[DERIVED_STAMP] === true
    ) {
      continue;
    }

    const markerSnapshot = snapshotMarkerNode(value);
    if (markerSnapshot) {
      result[key] = markerSnapshot.value;
      continue;
    }

    if (
      typeof value === 'function' &&
      !isNodeAccessor(value) &&
      !isSignal(value)
    ) {
      // Skip plain functions so snapshots stay plain-data — but SAY SO. A
      // materialized marker that is an unbranded callable (`form`,
      // `asyncSource`) lands here, so its value vanishes from the snapshot and
      // from everything built on one: serialize, persistence, devtools, audit,
      // time travel. ST2008 previously existed only on the accessor builder,
      // which is not the one that runs for a marker behind a store, so this
      // was silent in practice for the whole class it was written for.
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        warnUnwrapSkipped(key);
      }
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
    // Never copy SignalTree's own brands into a snapshot.
    //
    // A store carries no own symbols, so this cannot fire on the normal path —
    // it is defence-in-depth for the fallback where an accessor is walked
    // directly. An accessor owns `SignalTree:NodeAccessor` and
    // `SignalTree:NodeStore`, and the second one's VALUE IS THE BACKING STORE,
    // so copying it would drag a full walk of the store into the payload under
    // a symbol key.
    //
    // Descriptors are NOT a defence here: `Object.getOwnPropertySymbols`
    // returns non-enumerable symbols too, so marking a brand
    // `enumerable: false` does nothing. It has to be skipped by identity.
    // (Same hazard TREE_STORES is a WeakSet to avoid — see its comment.)
    if (
      typeof sym.description === 'string' &&
      sym.description.startsWith('SignalTree:')
    ) {
      continue;
    }

    const value = (node as Record<symbol, unknown>)[sym];

    // A DERIVED value is recomputable from state, so it is not state. Freezing
    // one into a payload yields a number that was true once. Skipped silently:
    // this is the documented rule, not a mistake worth reporting.
    if (
      value &&
      (typeof value === 'function' || typeof value === 'object') &&
      (value as Record<symbol, unknown>)[DERIVED_STAMP] === true
    ) {
      continue;
    }

    // Same as the string-key loop: ask the registry before skipping a callable.
    const markerSnapshotSym = snapshotMarkerNode(value);
    if (markerSnapshotSym) {
      (result as Record<symbol, unknown>)[sym] = markerSnapshotSym.value;
      continue;
    }

    if (
      typeof value === 'function' &&
      !isNodeAccessor(value) &&
      !isSignal(value)
    ) {
      // Skip plain functions so snapshots stay plain-data. See the string-key
      // loop above for why this reports rather than vanishing.
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        warnUnwrapSkipped(String(sym));
      }
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

  // A rehydrated tree has NO REQUEST IN FLIGHT.
  //
  // `LOADING` describes an in-flight operation, and an operation cannot survive
  // serialisation — the process that owned it is gone. Restoring it verbatim
  // deadlocks the node: `loading()` is true so a "don't fetch while loading"
  // guard blocks forever, `idle()` is false so an idle-gated fetch never fires,
  // and `settled()` is false so anything awaiting settlement waits forever.
  // Nothing is running to ever change it. Permanent spinner, no retry.
  //
  // Normalised HERE rather than at capture, so the snapshot stays faithful to
  // the moment it was taken (devtools can still show that the node WAS loading)
  // while every restore path lands somewhere a tree can actually operate from.
  // This is equally true of a time-travel undo INTO a loading moment: there is
  // no request there either.
  //
  // `Loaded` and `Error` both survive: they describe a finished operation, and
  // `Error` is what lets a retry guard know the last attempt failed.
  // A materialised marker hydrates itself, and decides for itself what a
  // process boundary means for its transient state. `applyState` is the
  // devtools REPLAY path — same process — so it passes `restore`, under which
  // an in-flight `Loading` is kept verbatim because the request may genuinely
  // still be running. `deserialize` and SSR pass `rehydrate` instead.
  if (hydrateMarkerNode(stateNode, snapshot, 'restore')) return;

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

    // A materialised marker hydrates ITSELF, before any of the shape-guessing
    // below. Without this, a marker whose node is an unbranded callable (form,
    // asyncSource) falls through to the raw assignment at the bottom and its
    // live signal is REPLACED by a plain object — which is exactly what ST2009
    // was built to catch, and did.
    if (hydrateMarkerNode(target, val, 'restore')) continue;

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
