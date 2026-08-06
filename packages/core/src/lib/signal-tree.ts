import { isSignal, signal, untracked, WritableSignal } from '@angular/core';

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { batchScope } from './internals/batch-scope';
import { SignalTreeBuilder } from './internals/builder-types';
import { ProcessDerived } from './internals/derived-types';
import {
  _recordTreeConstruction,
  isRegisteredMarker,
  materializeMarkers,
} from './internals/materialize-markers';
import { applyDerivedFactories } from './internals/merge-derived';
import { isComparedMarker } from './markers/compared';
import { getPathNotifier } from './path-notifier';
import {
  equal,
  isBuiltInObject,
  isTraversableNode,
  markTreeStore,
  materializeNode,
  unwrap,
} from './utils';

import type {
  TreeNode,
  TreeConfig,
  NodeAccessor,
  EntityMapMarker,
  ISignalTree,
  EnhancerMeta,
} from './types';

import { ENHANCER_META } from './types';
// =============================================================================
// INTERNAL SYMBOLS
// =============================================================================
const NODE_ACCESSOR_SYMBOL = Symbol.for('SignalTree:NodeAccessor');

/** ST2018 tuning — see warnEntityArrayLeaf(). */
const ENTITY_ARRAY_MIN_LENGTH = 32;
const ENTITY_ARRAY_SAMPLE = 64;
const ENTITY_ID_KEYS = ['id', '_id', 'uuid', 'key'] as const;
/**
 * ST2018 fires at CONSTRUCTION, and a tree is commonly constructed once per
 * component instance — so a list rendering 500 rows would print 500 identical
 * warnings and the console becomes unusable. Deduped by key+identity so the
 * advice is given once and stays readable. Capped so a pathological app cannot
 * grow this without bound; past the cap the diagnostic simply goes quiet, which
 * is the right failure direction for a dev hint.
 */
const ENTITY_ARRAY_WARNED = new Set<string>();
const ENTITY_ARRAY_WARN_CAP = 256;
/**
 * @internal Back-reference from an accessor to the TreeNode its call path
 * closes over. `makeNodeAccessor` COPIES the store's properties onto the
 * accessor, so the two drift the moment anything replaces a property on one of
 * them — which is exactly what marker materialization does. Exposing the store
 * lets `materializeMarkers` update both, instead of leaving the closed-over
 * store holding a raw marker forever. Non-enumerable so it never reaches a
 * snapshot.
 */
const NODE_STORE_SYMBOL = Symbol.for('SignalTree:NodeStore');

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isNodeAccessor(value: unknown): value is NodeAccessor<unknown> {
  return (
    typeof value === 'function' &&
    (value as unknown as Record<symbol, unknown>)[NODE_ACCESSOR_SYMBOL] === true
  );
}

function isEntityMapMarker(
  value: unknown
): value is EntityMapMarker<unknown, string | number> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)['__isEntityMap'] === true
  );
}

// =============================================================================
// UTILITIES
// =============================================================================

function createEqualityFn(useShallowComparison: boolean) {
  return useShallowComparison ? Object.is : equal;
}

function estimateObjectSize(
  obj: unknown,
  maxDepth = SIGNAL_TREE_CONSTANTS.ESTIMATE_MAX_DEPTH,
  currentDepth = 0
): number {
  if (currentDepth >= maxDepth) return 1;
  if (obj === null || obj === undefined) return 0;
  if (typeof obj !== 'object') return 1;

  let size = 0;

  try {
    if (Array.isArray(obj)) {
      size = obj.length;
      const sampleSize = Math.min(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_ARRAY,
        obj.length
      );
      for (let i = 0; i < sampleSize; i++) {
        size += estimateObjectSize(obj[i], maxDepth, currentDepth + 1) * 0.1;
      }
    } else {
      const keys = Object.keys(obj);
      size = keys.length;
      const sampleSize = Math.min(
        SIGNAL_TREE_CONSTANTS.ESTIMATE_SAMPLE_SIZE_OBJECT,
        keys.length
      );
      for (let i = 0; i < sampleSize; i++) {
        const value = (obj as Record<string, unknown>)[keys[i]];
        size += estimateObjectSize(value, maxDepth, currentDepth + 1) * 0.5;
      }
    }
  } catch {
    return 1;
  }

  return Math.floor(size);
}

function shouldUseLazy(
  obj: unknown,
  config: TreeConfig,
  precomputedSize?: number
): boolean {
  if (config.useLazySignals !== undefined) return config.useLazySignals;
  if (config.debugMode || config.enableDevTools) return false;
  const estimatedSize = precomputedSize ?? estimateObjectSize(obj);
  return estimatedSize > SIGNAL_TREE_CONSTANTS.LAZY_THRESHOLD;
}

// =============================================================================
// SECURITY VALIDATION
// =============================================================================

function validateTree<T>(obj: T, config: TreeConfig): void {
  // Security is injected (v11+): the validator + its recursive walk live in
  // `@signaltree/core/security` and are carried on `config.security` by the
  // `security()` helper. Core no longer statically imports SecurityValidator,
  // so it tree-shakes out of every bundle that doesn't opt in. Validation still
  // runs synchronously here during construction.
  const security = config.security;
  if (!security) return;

  // Fail-closed: a present-but-malformed `security` (e.g. a pre-v11 raw config
  // object passed by an untyped/JS consumer who didn't migrate to `security()`)
  // must NOT silently skip validation — that is fail-open for a security
  // control. TS consumers get a compile error from the `SecurityFeature` type;
  // this guard catches the JS/`any`/dynamic case and fails loudly instead.
  const sec = security as {
    __signalTreeSecurity?: unknown;
    validate?: unknown;
  };
  if (sec.__signalTreeSecurity !== true || typeof sec.validate !== 'function') {
    throw new Error(SIGNAL_TREE_MESSAGES.SECURITY_INVALID);
  }

  security.validate(obj);
}

// =============================================================================
// NODE ACCESSOR CREATION
// =============================================================================

/**
 * Creates a NodeAccessor function that wraps a TreeNode.
 *
 * NodeAccessors are functions that:
 * - Can be called with no args to get the unwrapped state
 * - Can be called with a value to set state
 * - Can be called with an updater function to transform state
 * - Have enumerable properties for child nodes (signals or nested accessors)
 *
 * **This is a plain function, NOT an Angular signal.** Only leaves are signals.
 * The accessor deliberately has no `.set()`/`.update()` — being callable for
 * reads *and* both write forms is the whole point, and adding those methods
 * would both duplicate the call signatures and collide with any state key
 * named `set` or `update`. See the `NodeAccessor` docs in ./types.ts for the
 * leaf-vs-node table and why `@signaltree/callable-syntax` targets leaves only.
 *
 * ## Auto-Batching for Partial Updates
 *
 * When called with an object argument (partial update), all child signal
 * writes are wrapped in a batchScope, resulting in a single change detection
 * cycle instead of multiple cycles.
 *
 * ```typescript
 * // Single CD cycle (auto-batched)
 * $.tickets({ startDate, endDate, count });
 *
 * // Individual CD cycles (not batched)
 * $.tickets.startDate.set(startDate);
 * $.tickets.endDate.set(endDate);
 * $.tickets.count.set(count);
 * ```
 *
 * ## Writable Properties for Deep Merge
 *
 * Properties are defined with `writable: true` to support the deep merge pattern.
 * When derived state is merged into a namespace and then processed by
 * materializeMarkers(), it needs to replace markers with their signal forms.
 */
function makeNodeAccessor<T>(store: TreeNode<T>): NodeAccessor<T> {
  // Declared as a METHOD SHORTHAND, not `function () {}`, and this is
  // load-bearing. A node carries the user's state keys as its own enumerable
  // properties, so every own property name a function already has is a name
  // the user cannot use for state. Ordinary function expressions own a
  // NON-CONFIGURABLE `prototype`, which made `signalTree({ a: { prototype: 1 } })`
  // die inside the copy loop below with "Cannot redefine property: prototype".
  // Concise methods are not constructors and have no `prototype` at all, while
  // still binding `arguments` (which an arrow function would not). That takes
  // the reserved-name list for state keys down to zero — `length`, `name`,
  // `caller` and `arguments` are all configurable and were already fine.
  const accessor = {
    node(arg?: unknown): T | void {
      // GET - no argument. Memoised per node: a clean subtree comes back BY
      // REFERENCE instead of being rebuilt, so one leaf write no longer costs
      // O(state) to observe. See materialized() in utils.ts.
      if (arguments.length === 0) {
        return materializeNode(store as object) as unknown as T;
      }

      // UPDATE with function - auto-batch
      if (typeof arg === 'function') {
        const updater = arg as (current: T) => T;
        const current = unwrap(store) as T;
        batchScope(() => recursiveUpdate(store, updater(current)));
        return;
      }

      // PARTIAL UPDATE with object - auto-batch
      if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        batchScope(() => recursiveUpdate(store, arg as Partial<T>));
        return;
      }

      // FULL SET with primitive/array - single value, no batch needed
      recursiveUpdate(store, arg);
    },
  }.node as NodeAccessor<T>;

  (accessor as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;
  Object.defineProperty(accessor, NODE_STORE_SYMBOL, {
    value: store,
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // Copy store properties onto accessor
  // CRITICAL: Properties must be writable to allow materializeMarkers()
  // to replace markers with their signal forms. Without writable: true,
  // this assignment silently fails in non-strict mode, causing runtime errors
  // like "$.users.upsertOne is not a function".
  for (const key of Object.keys(store as object)) {
    Object.defineProperty(accessor, key, {
      value: (store as Record<string, unknown>)[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return accessor;
}

/**
 * @internal Dev-mode notice that a write to a BRANCH position was discarded
 * because its value is not an object. Reached both directly (`{ user: null }`)
 * and via an updater that returned one (`{ user: () => null }`) — the second
 * used to vanish in silence, including the forgotten-`await` case where the
 * updater returns a Promise.
 */
/**
 * ST2018 — an array of entities is being stored as a plain array leaf.
 *
 * This is the most expensive idiom mistake available in SignalTree, and it does
 * not look like a mistake. Measured on the same task (1000 updates to a
 * 50,000-row collection, with a dependent read):
 *
 *   entityMap                1.63 ms
 *   plain array leaf        49.80 ms      <- this
 *   NgRx SignalStore        46.56 ms
 *
 * An array leaf lands at PARITY with the immutable store SignalTree beats 28x
 * with the right container, because every update rebuilds the array (`slice()`
 * alone is ~41 ms of that 49.80 ms) and every equality check walks it.
 * `entityMap` writes one entity in O(1) and reads it back through a per-entity
 * signal.
 *
 * Documentation did not prevent this: SignalTree's OWN demo benchmark shipped
 * the array-leaf idiom while `docs/guides/entity-collection-cookbook.md` sat in
 * the repo. Hence a diagnostic rather than another guide.
 *
 * Deliberately conservative, because a false positive on every small array
 * would train developers to ignore it:
 *   - at least ENTITY_ARRAY_MIN_LENGTH elements (below that, O(N) is noise)
 *   - every sampled element is a non-null, non-array object
 *   - every sampled element carries the SAME identity key with a primitive
 *     value, and no duplicates within the sample
 * The scan is bounded and runs once per array at construction, in dev only.
 */
function warnEntityArrayLeaf(key: string, value: readonly unknown[]): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  if (value.length < ENTITY_ARRAY_MIN_LENGTH) return;

  const first = value[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    return;
  }

  const idKey = ENTITY_ID_KEYS.find((candidate) => {
    const v = (first as Record<string, unknown>)[candidate];
    return typeof v === 'string' || typeof v === 'number';
  });
  if (!idKey) return;

  const sampleSize = Math.min(value.length, ENTITY_ARRAY_SAMPLE);
  const seen = new Set<unknown>();
  for (let i = 0; i < sampleSize; i++) {
    const item = value[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return;
    }
    const id = (item as Record<string, unknown>)[idKey];
    if (typeof id !== 'string' && typeof id !== 'number') return;
    if (seen.has(id)) return; // not a stable identity — say nothing
    seen.add(id);
  }

  const seenKey = `${key}:${idKey}`;
  if (ENTITY_ARRAY_WARNED.has(seenKey)) return;
  if (ENTITY_ARRAY_WARNED.size >= ENTITY_ARRAY_WARN_CAP) return;
  ENTITY_ARRAY_WARNED.add(seenKey);

  console.warn(
    `SignalTree: "${key}" holds ${value.length} objects with a stable ` +
      `"${idKey}" — consider entityMap({ selectId: (e) => e.${idKey} }).\n` +
      `  As a plain array leaf, every update rebuilds the whole array and every ` +
      `equality check walks it. Measured on 1000 updates to a 50k collection: ` +
      `array leaf 49.80ms vs entityMap 1.63ms (~30x).\n` +
      `  If this array is read-only or always replaced wholesale, that is fine — ` +
      `wrap it in compared() with your own comparator to silence this. See ` +
      `docs/guides/entity-collection-cookbook.md [ST2018]`
  );
}

function warnDiscardedBranchWrite(path: string, value: unknown): void {
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    console.error(
      `SignalTree: write to "${path}" DISCARDED — a branch cannot be replaced ` +
        `by a non-object value (received ${
          value === null ? 'null' : typeof value
        }). Write the leaves, or use a marker if this position should hold a ` +
        `value. [ST2014]`
    );
  }
}

/**
 * @internal Dev-mode notice that a builder could not forward a method to its
 * base tree — which means an enhancer in the chain returned a tree missing it.
 *
 * The cause every time so far has been `Object.assign(newTree, tree)` inside an
 * enhancer: it copies only ENUMERABLE own properties, and every tree method is
 * defined `enumerable: false`. The forwarder then returned an empty result,
 * which reads exactly like "nothing changed" — so a dropped write looked
 * healthy. Fail loudly instead.
 */
function warnMissingForward(method: string): void {
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    console.error(
      `SignalTree: "${method}" could not be forwarded — an enhancer in the ` +
        `chain returned a tree without it, so this call did NOTHING. An ` +
        `enhancer that builds a new tree object must copy own property ` +
        `DESCRIPTORS (see copyTreeProperties), not Object.assign, which skips ` +
        `non-enumerable methods. [ST2017]`
    );
  }
}

/** Dev-mode: paths already warned about for ref-identical no-op writes. */
const warnedNoopPaths = new Set<string>();

function recursiveUpdate(
  target: unknown,
  updates: unknown,
  out?: string[],
  pathPrefix = ''
): void {
  if (!updates || typeof updates !== 'object') return;

  const targetObj = isNodeAccessor(target)
    ? (target as unknown as Record<string, unknown>)
    : (target as Record<string, unknown>);

  for (const [key, rawValue] of Object.entries(
    updates as Record<string, unknown>
  )) {
    // Reassignable: an updater FUNCTION at either a leaf or a branch is
    // resolved to its result below, and everything downstream then sees one
    // shape rather than each branch re-implementing the updater case.
    let value = rawValue;
    const prop = targetObj[key];
    const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (prop === undefined) {
      // A tree's signal graph is built from its INITIAL shape, so a write to a
      // key that was never in that shape has nowhere to go and is discarded.
      // Silently, until now: this is what made a guardrails rule look broken
      // for hours when the demo wrote an optional key it had never seeded.
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.error(
          `SignalTree: write to "${childPath}" DISCARDED — key is not in the ` +
            `tree's initial shape. [ST2010]`
        );
      }
      continue;
    }

    if (isSignal(prop) && 'set' in prop) {
      const sig = prop as WritableSignal<unknown>;
      // NOTE: a function value is STORED, never invoked. Updaters are supported
      // at branches and at the root, NOT at leaves — `tree.$.count.update(fn)`
      // is the leaf form, mirroring Angular's own signal API.
      //
      // A previous revision tried to resolve leaf updaters, guarded on "the
      // current value is not a function". That predicate is unknowable at
      // runtime: the right question is whether the leaf's DECLARED TYPE is a
      // function, and a leaf typed `null | (() => void)` sitting at `null` is
      // the ordinary callback field. Assigning a handler to one then INVOKED it
      // (running `() => this.submit()` at write time), stored its return value,
      // and reported the path as landed; a class constructor threw out of the
      // middle of the write loop, committing earlier keys and dropping later
      // ones while reporting nothing. Strictly worse than the inert
      // stored-function it replaced, so it is gone.
      // Ref-equality short-circuit: skip the .set() entirely when the
      // incoming value is identical to the current value. Saves the
      // function-call + Angular's internal equality check + any glitch
      // tracking. Wrapped in untracked() so reading the current value
      // never accidentally creates a reactive dependency.
      const current = untracked(() => sig());
      if (current === value) {
        // Dev-mode footgun guard: a merge write whose value is reference-
        // identical to the current value is a no-op. For objects/arrays this
        // almost always means the caller mutated the value in place and re-set
        // the SAME reference, expecting an update — which silently does
        // nothing. Warn once per path. (Primitives re-set to the same value
        // are normal idempotent writes and are not flagged.)
        if (
          (typeof ngDevMode === 'undefined' || ngDevMode) &&
          value !== null &&
          typeof value === 'object' &&
          !warnedNoopPaths.has(childPath)
        ) {
          warnedNoopPaths.add(childPath);
          console.warn(
            `SignalTree: write at "${childPath}" was skipped — the value is ` +
              `reference-identical to the current value. If you mutated an ` +
              `object/array in place, create a NEW reference (spread/slice/map) ` +
              `so the change is observed. [ST2003]`
          );
        }
        continue;
      }
      sig.set(value);
      if (out) {
        // Report only what LANDED. Leaves are created with a deep `equal`, so
        // a new-reference-but-deep-equal value — the ordinary shape of a
        // re-fetched server payload — is rejected by the signal and notifies
        // nobody. Pushing the path anyway told audit trails, change logs and
        // targeted-persistence callers to do work for a write that never
        // happened.
        //
        // Compare against the PREVIOUS value, not the incoming one: "the leaf
        // now holds `value`" is also true when the leaf already held it, which
        // is exactly the no-op case (and Object.is(NaN, NaN) makes that
        // indistinguishable). "The leaf no longer holds what it held" is the
        // question actually being asked.
        if (!Object.is(untracked(() => sig()), current)) out.push(childPath);
      }
    } else if (isNodeAccessor(prop)) {
      if (typeof value === 'function') {
        // Updater function aimed at a BRANCH, e.g. tree({ user: u => ({...}) }).
        // Resolve it here and recurse rather than handing it to the accessor:
        // the accessor's own updater path drops `out` and `pathPrefix`, so the
        // reported path was the branch ('user') instead of the leaves that
        // changed ('user.name'), and a pure no-op updater still reported a
        // change. Resolving here keeps one code path for reporting — and one
        // code path for the discard diagnostic below, which the resolved value
        // now falls through to. Without that, `u => null` and a forgotten
        // `await` (an async updater returns a Promise, whose Object.entries is
        // empty) were both SILENT no-ops.
        const updater = value as (current: unknown) => unknown;
        value = updater(unwrap(prop));
        // Only a PLAIN object merges into a branch. Everything else an updater
        // can return is a discard, and each used to be silent:
        //   - a Promise, from a forgotten `await` — it IS an object, so
        //     `Object.entries()` on it is empty and the whole write vanished.
        //     A previous revision claimed to diagnose this and did not.
        //   - a Date/Map/Set/array, which merge key-by-key into nonsense.
        //   - `undefined`, which differs from a LITERAL `undefined` in the
        //     payload: that legitimately means "no change" for an absent
        //     optional key, whereas an updater returning it is a mistake.
        const mergeable =
          isTraversableNode(value) &&
          typeof value !== 'function' &&
          !isBuiltInObject(value) &&
          !Array.isArray(value) &&
          typeof (value as { then?: unknown }).then !== 'function';
        if (!mergeable) {
          warnDiscardedBranchWrite(childPath, value);
          continue;
        }
      }
      if (typeof value === 'function') {
        // An updater that returned another function. Nothing sane to do.
        warnDiscardedBranchWrite(childPath, value);
      } else if (value && typeof value === 'object') {
        batchScope(() => recursiveUpdate(prop, value, out, childPath));
      } else if (value === undefined) {
        // `{ user: undefined }` is type-legal for Partial<T> and is exactly what
        // `{ ...defaults, ...patch }` produces for an absent optional key. It
        // means "no change", so it is skipped WITHOUT a diagnostic — warning
        // here cried wolf on correct, type-checked code.
        continue;
      } else {
        // A primitive, null or undefined aimed at a BRANCH. This has always
        // been discarded — the accessor forwards to recursiveUpdate, which
        // returns immediately for a non-object — but the path was reported as
        // changed anyway. That is the same defect the leaf branch above was
        // fixed for, and it is the shape a server payload takes when it sends
        // `null` for a whole object. Report nothing, and say why in dev.
        warnDiscardedBranchWrite(childPath, value);
      }
    }
    // NOTE: no diagnostic for "matched neither guard". Since stored() became a
    // real signal, the only values reaching here are materialized markers
    // (entityMap/status/form), which do not accept merge writes BY DESIGN —
    // each has its own API. Warning would fire on `tree(tree())`, the ordinary
    // snapshot-restore pattern, and the obvious remediation (`.set()`) does not
    // exist on those markers. A diagnostic that cries wolf on documented usage
    // is worse than none — the same bar that rejected the duplicate-key warning.
  }
}

// =============================================================================
// SIGNAL STORE CREATION
// =============================================================================

function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean
): TreeNode<T> {
  // Primitives, null, undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  // Arrays
  if (Array.isArray(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  // Built-in objects (Date, Map, Set, etc.)
  if (isBuiltInObject(obj)) {
    return signal(obj, { equal: equalityFn }) as unknown as TreeNode<T>;
  }

  // Regular object - recursive
  const store: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // SECURITY: every `store[key] = …` below is a plain assignment, so a key
    // named `__proto__` invokes the Object.prototype SETTER on the store rather
    // than adding a property. `JSON.parse` creates a real own `__proto__` key,
    // and rehydrating from localStorage / SSR transfer state / a fetch body is
    // the ordinary way that input reaches `signalTree()`.
    //
    // The damage is contained but real: the ROOT store IS `tree.$`, so its
    // prototype became an attacker-controlled node. `tree.$.isAdmin` then read
    // back a live signal holding `true` while `tree()` reported only the
    // legitimate keys — invisible to snapshots, serialization, persistence,
    // devtools and time-travel — and a later `tree({ isAdmin: … })` wrote
    // THROUGH to it, bypassing the ST2010 not-in-initial-shape discard.
    // Nested branches were safe (each accessor gets a fresh Function.prototype);
    // the root is the only victim, which is exactly why it was easy to miss.
    if (key === '__proto__') {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.error(
          `SignalTree: dropped a "__proto__" key from the initial state — it ` +
            `cannot be a state key. If this came from JSON.parse, the payload ` +
            `is attempting prototype pollution. [ST2016]`
        );
      }
      continue;
    }

    // Entity map markers - preserve for entities() enhancer
    if (isEntityMapMarker(value)) {
      store[key] = value;
      continue;
    }

    // compared() — this position supplies its own equality function. Checked
    // before the registered-marker lookup and before the Symbol-key warning
    // below, because it needs no processor: it only swaps the `equal` option.
    // Note this makes the position a LEAF even when the value is an object,
    // which is the intent (the object is compared as a unit).
    if (isComparedMarker(value)) {
      store[key] = signal(value.value, {
        equal: value.equal as (a: unknown, b: unknown) => boolean,
      });
      continue;
    }

    // All markers (built-in status/stored/form/asyncSource + user-registered)
    // are caught here via the dynamic processor registry. Built-in markers
    // self-register when their factory runs — and the factory always runs
    // inside the state literal (`signalTree({ x: status() })` evaluates
    // `status()` before `signalTree()`), so the processor is registered before
    // this check. Detecting them through the registry (instead of importing
    // `isStatusMarker`/`isStoredMarker` directly) keeps `markers/status` and
    // `markers/stored` out of the bundle when those markers are never used.
    if (isRegisteredMarker(value)) {
      store[key] = value;
      continue;
    }

    // Dev-mode warning: object has Symbol keys but no registered processor
    // This catches the common mistake of forgetting to register before tree creation
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.getOwnPropertySymbols(value).length > 0
      ) {
        console.warn(
          `SignalTree: Object at "${key}" has Symbol keys but doesn't match any ` +
            `registered marker processor. If this is a custom marker, ensure ` +
            `registerMarkerProcessor() is called BEFORE creating the tree.`
        );
      }
    }

    // Existing signals - preserve
    if (isSignal(value)) {
      store[key] = value;
      continue;
    }

    // Null, undefined, primitives
    if (value === null || value === undefined || typeof value !== 'object') {
      store[key] = signal(value, { equal: equalityFn });
      continue;
    }

    // Arrays, built-ins
    if (Array.isArray(value) || isBuiltInObject(value)) {
      if (Array.isArray(value)) warnEntityArrayLeaf(key, value);
      store[key] = signal(value, { equal: equalityFn });
      continue;
    }

    // Nested object - recurse and wrap in NodeAccessor
    const nested = createSignalStore(value, equalityFn);
    store[key] = makeNodeAccessor(nested);
  }

  // Register as memoisable. Only stores built here are reactive all the way
  // down, which is the precondition for caching their materialisation in a
  // computed — see isMemoisable() in utils.ts.
  markTreeStore(store as object);

  return store as TreeNode<T>;
}

// =============================================================================
// CORE CREATE FUNCTION
// =============================================================================

function create<T extends object>(
  initialState: T,
  config: TreeConfig
): ISignalTree<T> {
  if (initialState === null || initialState === undefined) {
    throw new Error(SIGNAL_TREE_MESSAGES.NULL_OR_UNDEFINED);
  }

  // Security validation
  validateTree(initialState, config);

  const equalityFn = createEqualityFn(config.useShallowComparison ?? false);
  // Lazy mode is opt-in (v11): it only runs when the `lazy` feature is injected
  // via `@signaltree/core/lazy`. Without it the size estimate is skipped and the
  // tree is always eager, so the lazy proxy + memory manager tree-shake out.
  const lazyFeature = config.lazy;
  const useLazy = lazyFeature
    ? shouldUseLazy(initialState, config, estimateObjectSize(initialState))
    : false;

  // Dev-mode: `useLazySignals: true` is a silent no-op without the lazy feature.
  // Warn rather than let a perf-sensitive opt-in vanish unnoticed on upgrade.
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    config.useLazySignals === true &&
    !lazyFeature
  ) {
    console.warn(SIGNAL_TREE_MESSAGES.LAZY_NOT_INJECTED);
  }

  // Create signal store
  let signalState: TreeNode<T>;
  let disposeLazy: (() => void) | undefined;

  // Configure global PathNotifier batching based on tree config (opt-out via config.batchUpdates=false)
  // Default: batching enabled unless explicitly disabled
  try {
    getPathNotifier().setBatchingEnabled(
      Boolean(config.batchUpdates !== false)
    );
  } catch {
    // ignore failures (shouldn't happen)
  }

  if (lazyFeature && useLazy && typeof initialState === 'object') {
    try {
      const built = lazyFeature.build(initialState, equalityFn);
      signalState = built.tree as TreeNode<T>;
      disposeLazy = built.dispose;
    } catch (error) {
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(SIGNAL_TREE_MESSAGES.LAZY_FALLBACK, error);
      }
      signalState = createSignalStore(initialState, equalityFn);
      disposeLazy = undefined;
    }
  } else {
    signalState = createSignalStore(initialState, equalityFn);
  }

  // Create root callable function
  const tree = function (arg?: unknown): T | void {
    if (arguments.length === 0) {
      return materializeNode(signalState as object) as unknown as T;
    }

    if (typeof arg === 'function') {
      const updater = arg as (current: T) => T;
      const current = unwrap(signalState) as T;
      recursiveUpdate(signalState, updater(current));
    } else {
      recursiveUpdate(signalState, arg);
    }
  } as ISignalTree<T>;

  // Mark as NodeAccessor
  (tree as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Lifecycle: cleanup registry and destroyed flag
  const cleanupFns: Array<() => void> = [];
  const destroyedSig = signal(false);
  const appliedEnhancers = new Set<string>();

  // Add core properties
  Object.defineProperty(tree, '$', {
    value: signalState,
    enumerable: false,
    writable: false,
  });

  /**
   * Apply a single enhancer to this SignalTree instance and return the enhanced tree.
   *
   * Enhancers extend the tree with additional capabilities (batching, time travel, dev tools, entities, serialization, etc).
   *
   * Usage:
   * ```ts
   * const enhanced = tree.with(batching());
   * // Chain multiple enhancers:
   * const fullyEnhanced = tree
   *   .with(batching())
   *   .with(timeTravel({ maxHistorySize: 100 }))
   *   .with(devTools({ treeName: 'MyTree' }));
   * ```
   *
   * Supported enhancers and their options:
   *
   * - `batching(config?: BatchingConfig)`
   *   - Batches change detection notifications for performance.
   *   - Signal writes are always synchronous.
   *   - Options: `enabled`, `notificationDelayMs`.
   *
   * - `timeTravel(config?: TimeTravelConfig)`
   *   - Enables undo/redo and state history.
   *   - Options: `maxHistorySize`, `includePayload`, `actionNames`, `enabled`.
   *
   * - `devTools(config?: DevToolsConfig)`
   *   - Integrates with browser devtools and logs state changes.
   *   - Options: `treeName`, `enableBrowserDevTools`, `enableLogging`, `performanceThreshold`, `enabled`.
   *
   * - `serialization(config?: SerializationConfig)`
   *   - Adds state serialization and persistence helpers.
   *   - Options: `includeMetadata`, `replacer`, `reviver`, `preserveTypes`, `maxDepth`.
   *
   * @template R The return type of the enhancer (usually the enhanced tree).
   * @param enhancer A function that takes the current tree and returns an enhanced tree.
   * @returns The enhanced tree with additional methods or capabilities.
   * @see BatchingConfig, TimeTravelConfig, DevToolsConfig, SerializationConfig
   */
  Object.defineProperty(tree, 'with', {
    value: function <R>(enhancer: (tree: ISignalTree<T>) => R): R {
      if (typeof enhancer !== 'function') {
        throw new Error('Enhancer must be a function');
      }

      // Duplicate detection via enhancer metadata
      const meta =
        (enhancer as unknown as Record<symbol, EnhancerMeta>)[ENHANCER_META] ??
        (enhancer as unknown as { metadata?: EnhancerMeta }).metadata;

      if (meta?.name) {
        if (appliedEnhancers.has(meta.name)) {
          throw new Error(
            `Enhancer "${meta.name}" has already been applied to this tree. ` +
              `Each enhancer can only be applied once.`
          );
        }
        // Dependency validation
        if (meta.requires) {
          for (const dep of meta.requires) {
            if (!appliedEnhancers.has(dep)) {
              throw new Error(
                `Enhancer "${meta.name}" requires "${dep}" to be applied first.`
              );
            }
          }
        }
        appliedEnhancers.add(meta.name);
      }

      return enhancer(tree) as R;
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // bind()
  Object.defineProperty(tree, 'bind', {
    value: function (thisArg?: unknown): NodeAccessor<T> {
      // Use native Function.prototype.bind to avoid calling this custom
      // `bind` property (which would cause infinite recursion).
      return Function.prototype.bind.call(
        tree,
        thisArg
      ) as unknown as NodeAccessor<T>;
    },
    enumerable: false,
    // Allow enhancers or consumers to bind/override if necessary
    writable: true,
    configurable: true,
  });

  // destroy()
  Object.defineProperty(tree, 'destroy', {
    value: function (): void {
      if (destroyedSig()) return; // Already destroyed
      destroyedSig.set(true);
      // Run registered cleanup functions (enhancers, subscriptions, etc.)
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {
          // Swallow errors during cleanup to ensure all cleanups run
        }
      }
      cleanupFns.length = 0;
      if (disposeLazy) {
        disposeLazy();
      }
      if (config.debugMode) {
        console.log(SIGNAL_TREE_MESSAGES.TREE_DESTROYED);
      }
    },
    enumerable: false,
    // Allow enhancers (like guardrails) to override/replace `destroy` at runtime.
    writable: true,
    configurable: true,
  });

  // destroyed (readonly signal)
  Object.defineProperty(tree, 'destroyed', {
    value: destroyedSig.asReadonly(),
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // registerCleanup()
  Object.defineProperty(tree, 'registerCleanup', {
    value: function (fn: () => void): void {
      if (typeof fn === 'function') {
        cleanupFns.push(fn);
      }
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // clearCache(): compatibility stub for older DX and enhancers that expect
  // a global clearCache helper on the tree. Enhancers may replace this with
  // a real implementation (e.g. memoization). Default is a no-op.
  Object.defineProperty(tree, 'clearCache', {
    value: () => {
      /* no-op default */
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // batchUpdate(): default pass-through for when batching is not enabled.
  // Applies the update immediately using the same internal recursiveUpdate
  // logic so consumers can call `tree.batchUpdate(...)` regardless of
  // whether the batching enhancer is active.
  Object.defineProperty(tree, 'batchUpdate', {
    value: function (arg?: unknown): void {
      if (arguments.length === 0) return;

      if (typeof arg === 'function') {
        const updater = arg as (current: T) => T;
        const current = unwrap(signalState) as T;
        recursiveUpdate(signalState, updater(current));
      } else {
        recursiveUpdate(signalState, arg);
      }
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // updateAndReport(): apply a partial update and return the dot-paths of
  // signals that actually changed (after ref-equality short-circuit).
  // Useful for partial server-payload sync, change-log/audit trails, and
  // targeted persistence without pulling in the @signaltree/enterprise
  // diff engine.
  Object.defineProperty(tree, 'updateAndReport', {
    value: function (arg?: unknown): string[] {
      if (arguments.length === 0) return [];
      const out: string[] = [];
      if (typeof arg === 'function') {
        const updater = arg as (current: T) => T;
        const current = unwrap(signalState) as T;
        batchScope(() => recursiveUpdate(signalState, updater(current), out));
      } else if (
        typeof arg === 'object' &&
        arg !== null &&
        !Array.isArray(arg)
      ) {
        batchScope(() => recursiveUpdate(signalState, arg, out));
      } else {
        recursiveUpdate(signalState, arg, out);
      }
      return out;
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // Copy state properties to root for direct access (DEPRECATED - will be removed in v7)
  // Consumers should use tree.$ for state access
  for (const key of Object.keys(signalState as object)) {
    if (!(key in tree)) {
      Object.defineProperty(tree, key, {
        value: (signalState as Record<string, unknown>)[key],
        enumerable: true,
        configurable: true,
      });
    }
  }

  return tree;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create a minimal SignalTree.
 *
 * Returns ISignalTree<T> with only core functionality.
 * Use .with() to add enhancers for additional features.
 *
 * @example
 * ```typescript
 * import { computed } from '@angular/core';
 * import { signalTree } from '@signaltree/core';
 *
 * // Minimal tree
 * const tree = signalTree({ count: 0 });
 *
 * // With multiple enhancers
 * const tree = signalTree({ count: 0 })
 *   .with(timeTravel())
 *   .with(batching());
 *
 * // With derived state (v7) - chained syntax
 * const tree = signalTree({ count: 0 })
 *   .derived(($) => ({
 *     doubled: computed(() => $.count() * 2)
 *   }));
 *
 * // With derived state (v7) - second argument syntax
 * const tree = signalTree(
 *   { count: 0 },
 *   ($) => ({
 *     doubled: computed(() => $.count() * 2)
 *   })
 * );
 * ```
 */
// Overload: with derived factory as second argument
export function signalTree<T extends object, TDerived extends object>(
  initialState: T,
  derivedFactory: ($: TreeNode<T>) => TDerived
): SignalTreeBuilder<T, TreeNode<T> & ProcessDerived<TDerived>>;

// Overload: with config object
export function signalTree<T extends object>(
  initialState: T,
  config?: TreeConfig
): SignalTreeBuilder<T, TreeNode<T>>;

// Implementation
export function signalTree<T extends object, TDerived extends object>(
  initialState: T,
  configOrDerived?: TreeConfig | (($: TreeNode<T>) => TDerived)
): SignalTreeBuilder<T, TreeNode<T>> {
  // Determine if second arg is a derived factory or config
  const isFactory = typeof configOrDerived === 'function';
  const config: TreeConfig = isFactory ? {} : configOrDerived ?? {};

  const baseTree = create(initialState, config);
  const builder = createBuilder<T, TreeNode<T>>(baseTree);

  // If derived factory provided, apply it immediately
  if (isFactory) {
    return builder.derived(
      configOrDerived as ($: TreeNode<T>) => TDerived
    ) as unknown as SignalTreeBuilder<T, TreeNode<T>>;
  }

  return builder;
}

// =============================================================================
// BUILDER FACTORY
// =============================================================================

/**
 * Creates a SignalTreeBuilder that wraps an ISignalTree and adds:
 * - .derived() method for adding derived state layers
 * - Lazy finalization (derived factories run on first $ access)
 */
function createBuilder<TSource extends object, TAccum = TreeNode<TSource>>(
  baseTree: ISignalTree<TSource>
): SignalTreeBuilder<TSource, TAccum> {
  const derivedQueue: Array<($: unknown) => object> = [];
  let isFinalized = false;

  let markersMaterialized = false;

  /**
   * Materialize markers only — idempotent, and deliberately does NOT latch
   * `isFinalized`, so it stays legal to add `.derived()` afterwards. Reading
   * or writing through the tree needs real signals; it does not need the
   * derived queue applied.
   */
  const materializeOnly = () => {
    if (markersMaterialized) return;
    markersMaterialized = true;
    materializeMarkers(baseTree.$);
    _recordTreeConstruction();
  };

  const finalize = () => {
    if (isFinalized) return;
    isFinalized = true;

    // Step 1: Materialize ALL markers (entityMap, status, stored, etc.)
    // This must happen BEFORE derived processing so that derived factories
    // can reference entity methods, status signals, and stored signals.
    materializeOnly();

    // Step 2: Apply all queued derived factories
    if (derivedQueue.length > 0) {
      applyDerivedFactories(baseTree.$, derivedQueue);
    }
  };

  // Create callable builder function that delegates to baseTree
  const builder = function (arg?: unknown): TSource | void {
    // Materialize markers WITHOUT finalizing. Calling tree() used to return
    // raw markers because this path skipped materialization entirely; but a
    // full finalize() here would also latch `isFinalized`, and `.derived()`
    // throws on that flag — so `tree(); tree.derived(...)` would start failing
    // with a message about `$` that the caller never touched.
    materializeOnly();

    // Delegate to baseTree's call signature
    if (arguments.length === 0) {
      return (baseTree as unknown as () => TSource)();
    }
    return (baseTree as unknown as (arg: unknown) => void)(arg);
  } as SignalTreeBuilder<TSource, TAccum>;

  // Mark as NodeAccessor
  (builder as unknown as Record<symbol, boolean>)[NODE_ACCESSOR_SYMBOL] = true;

  // Copy all properties from baseTree to builder
  Object.defineProperty(builder, '$', {
    get() {
      finalize();
      return baseTree.$;
    },
    enumerable: false,
    configurable: true,
  });

  // Override 'with' method to maintain builder chain
  Object.defineProperty(builder, 'with', {
    value: function <TAdded>(
      enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TAdded
    ): SignalTreeBuilder<TSource, TAccum> & TAdded {
      // Finalize markers BEFORE passing to enhancer so form(), entityMap(), etc. are materialized
      finalize();
      // Apply enhancer to base tree
      const enhanced = baseTree.with(enhancer);
      // Create a new builder wrapping the enhanced tree
      const newBuilder = createBuilder<TSource, TAccum>(
        enhanced as unknown as ISignalTree<TSource>
      );
      // Copy any additional properties from the enhancer result
      for (const key of Object.keys(enhanced)) {
        if (
          key !== '$' &&
          key !== 'state' &&
          key !== 'with' &&
          key !== 'bind' &&
          key !== 'destroy' &&
          key !== 'destroyed' &&
          key !== 'registerCleanup' &&
          key !== 'derived'
        ) {
          try {
            (newBuilder as unknown as Record<string, unknown>)[key] = (
              enhanced as unknown as Record<string, unknown>
            )[key];
          } catch {
            /* ignore read-only */
          }
        }
      }
      return newBuilder as SignalTreeBuilder<TSource, TAccum> & TAdded;
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // Copy 'bind' method from baseTree (if it exists)
  if (typeof baseTree.bind === 'function') {
    Object.defineProperty(builder, 'bind', {
      value: baseTree.bind.bind(baseTree),
      enumerable: false,
      writable: false,
      configurable: true,
    });
  } else {
    Object.defineProperty(builder, 'bind', {
      value: () => builder,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Copy 'destroy' method from baseTree (if it exists)
  // Note: writable: true allows enhancers like guardrails() to override destroy
  if (typeof baseTree.destroy === 'function') {
    Object.defineProperty(builder, 'destroy', {
      value: baseTree.destroy.bind(baseTree),
      enumerable: false,
      writable: true,
      configurable: true,
    });
  } else {
    Object.defineProperty(builder, 'destroy', {
      value: () => {
        /* noop */
      },
      enumerable: false,
      writable: true,
      configurable: true,
    });
  }

  // Copy 'destroyed' signal from baseTree
  if (baseTree.destroyed) {
    Object.defineProperty(builder, 'destroyed', {
      value: baseTree.destroyed,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Copy 'registerCleanup' from baseTree
  if (typeof baseTree.registerCleanup === 'function') {
    Object.defineProperty(builder, 'registerCleanup', {
      value: baseTree.registerCleanup.bind(baseTree),
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // Forward 'updateAndReport' from baseTree (apply partial update +
  // return changed paths). Defined as non-enumerable on baseTree, so it
  // isn't picked up by the generic key copy above.
  Object.defineProperty(builder, 'updateAndReport', {
    value: function (this: unknown, arg?: unknown): string[] {
      finalize();
      const fn = (baseTree as unknown as Record<string, unknown>)[
        'updateAndReport'
      ] as ((a?: unknown) => string[]) | undefined;
      if (!fn) {
        // This is what made the enhancer bug SILENT: a missing method meant an
        // empty report and a dropped write, indistinguishable from "nothing
        // changed". A missing forward target is a broken enhancer chain, never
        // a legitimate state, so say so.
        warnMissingForward('updateAndReport');
        return [];
      }
      return fn.call(baseTree, arg);
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  // Forward 'batchUpdate' from baseTree (mirrors the existing internal
  // helper; needed because non-enumerable properties don't reach the
  // builder via the generic copy loop).
  Object.defineProperty(builder, 'batchUpdate', {
    value: function (this: unknown, arg?: unknown): void {
      finalize();
      const fn = (baseTree as unknown as Record<string, unknown>)[
        'batchUpdate'
      ] as ((a?: unknown) => void) | undefined;
      if (!fn) {
        warnMissingForward('batchUpdate');
        return;
      }
      fn.call(baseTree, arg);
    },
    enumerable: false,
    writable: true,
    configurable: true,
  });

  // Add derived() method
  Object.defineProperty(builder, 'derived', {
    value: function <TDerived extends object>(
      factory: ($: TAccum) => TDerived
    ): SignalTreeBuilder<TSource, TAccum & ProcessDerived<TDerived>> {
      if (isFinalized) {
        throw new Error(
          'SignalTree: Cannot add derived() after tree.$ has been accessed. ' +
            'Chain all .derived() calls before accessing $.'
        );
      }
      derivedQueue.push(factory as ($: unknown) => object);
      // Return same builder - types are updated at compile time
      return builder as unknown as SignalTreeBuilder<
        TSource,
        TAccum & ProcessDerived<TDerived>
      >;
    },
    enumerable: false,
    writable: false,
    configurable: true,
  });

  return builder;
}
