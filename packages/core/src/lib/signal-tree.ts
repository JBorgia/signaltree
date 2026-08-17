import {
  computed,
  isSignal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';

import { installMaterializationRealization } from './internals/materialization-realization';

// Angular supplies the two reactive operations marker materialization needs.
// Installed once at module load: for this release `@signaltree/core` IS the
// Angular adapter, so the binding lives here rather than in the neutral
// materializer. See `internals/materialization-realization.ts` for why this is
// two named semantic operations and not a signals shim.
installMaterializationRealization({
  isReactiveNode: (node) => isSignal(node),
  memoizeSnapshot: (_node, compute) => computed(compute),
});

import { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './constants';
import { resolveEnhancerOrder } from '../enhancers';
import { batchScope } from './internals/batch-scope';
import {
  SignalTreeBuilder,
  SignalTreePlanBuilder,
} from './internals/builder-types';
import { ProcessDerived } from './internals/derived-types';
import {
  createMaterializationContext,
  _recordTreeConstruction,
  isRegisteredMarker,
  materializeMarkers,
} from './internals/materialize-markers';
import { definePositionRegistry } from './internals/position-registry';
import {
  defineOwnedOwnerPath,
  defineOwnedPositionIds,
  wrapOwnedWritableSignal,
} from './internals/owned-mutation';
import {
  createMutationCaptureRuntime,
  MUTATION_CAPTURE_RUNTIME,
  type MutationCaptureRuntime,
} from './internals/mutation-capture-runtime';
import {
  createTreeScalarSlotRuntime,
  defineTreeScalarSlotRuntime,
  type TreeScalarSlotRuntime,
} from './internals/tree-scalar-slot-angular-runtime';
import {
  createPhysicalCommitClock,
  definePhysicalCommitClock,
} from './internals/physical-commit-clock';
import {
  collectRequestedTreeCapabilities,
  resolveTreeCapabilities,
} from './internals/tree-capabilities';
import type { MaterializationContext } from './internals/materialize-markers';
import { applyDerivedFactories } from './internals/merge-derived';
import { isComparedMarker } from './markers/compared';
import { hydrateMarkerNode } from './internals/materialize-markers';
import { getActiveWriteContext } from './write-context';
import { getPathNotifier } from './path-notifier';
import {
  deepEqual,
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
  EnhancerWithMeta,
  EnhancerMeta,
  TreeCapability,
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
const PLANNED_TREE_BUILD_SYMBOL = Symbol.for('SignalTree:PlannedBuild');
// =============================================================================

type TreeBuildPlan = {
  requestedCapabilities: readonly TreeCapability[];
  capabilities: readonly TreeCapability[];
  has(capability: TreeCapability): boolean;
  leafMetadataStorage: 'property' | 'sidecar';
};

function createTreeBuildPlan(
  requestedCapabilities: readonly TreeCapability[],
  leafMetadataStorage: 'property' | 'sidecar'
): TreeBuildPlan {
  const resolved = resolveTreeCapabilities(requestedCapabilities);
  return {
    requestedCapabilities: resolved.requestedCapabilities,
    capabilities: resolved.resolvedCapabilities,
    has(capability: TreeCapability): boolean {
      return resolved.resolvedCapabilities.includes(capability);
    },
    leafMetadataStorage,
  };
}

const LEGACY_TREE_BUILD_PLAN = createTreeBuildPlan(
  ['causal-runtime', 'temporal-snapshots'],
  'property'
);

// Public signalTree() now has one default scalar substrate: tree-owned slots
// with Angular tokens as the reactive adapter. Optional capabilities layer
// additional metadata/runtime services on top; they no longer choose between
// fundamentally different scalar storage implementations.

function finalizeLeafSignal<TValue>(
  leaf: WritableSignal<TValue>,
  path: string,
  positionIds: readonly number[] | undefined,
  buildPlan: TreeBuildPlan,
  captureRuntime: MutationCaptureRuntime
): void {
  if (buildPlan.has('mutation-capture')) {
    wrapOwnedWritableSignal(leaf, {
      path,
      ownerPath: path,
      positionIds,
      metadataStorage: buildPlan.leafMetadataStorage,
      captureRuntime,
    });
    return;
  }

  if (buildPlan.has('position-topology')) {
    defineOwnedPositionIds(leaf as object, positionIds);
  }
}

function getEnhancerMeta(
  enhancer: unknown
): EnhancerMeta | undefined {
  return (
    (enhancer as Record<symbol, EnhancerMeta | undefined>)[ENHANCER_META] ??
    (enhancer as { metadata?: EnhancerMeta }).metadata
  );
}

function buildTreePlan(
  enhancers: EnhancerWithMeta<unknown>[]
): TreeBuildPlan {
  const requestedCapabilities = collectRequestedTreeCapabilities(
    enhancers.map((enhancer) => getEnhancerMeta(enhancer))
  );
  return createTreeBuildPlan(requestedCapabilities, 'sidecar');
}

function materializeTreeMarkers<T extends object>(
  tree: ISignalTree<T>,
  materializationContext: MaterializationContext
): void {
  materializeMarkers(tree.$, undefined, [], materializationContext);
  _recordTreeConstruction();
}

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
  return useShallowComparison ? Object.is : deepEqual;
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
 * leaf-vs-node table — and note that a LEAF takes no such call: calling an
 * Angular signal is a read, and since 14.0.0 that is a compile error rather
 * than a silent no-op.
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
function makeNodeAccessor<T>(
  store: TreeNode<T>,
  ownerPath?: string,
  positionIds?: readonly number[]
): NodeAccessor<T> {
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

  if (positionIds && positionIds.length > 0) {
    defineOwnedPositionIds(accessor as object, positionIds);
  }

  if (ownerPath !== undefined) {
    defineOwnedOwnerPath(accessor as object, ownerPath);
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
 * ST2021 — a marker inside an array.
 *
 * Array elements are never traversed, so a marker in one is never materialised:
 * it stays a raw marker object for the life of the tree. `tree.$.list()[0]` is
 * a plain `{ key, defaultValue }`, not a signal, and every write to it is lost.
 * Silent, and it looks like it should work.
 *
 * "Store the array as a Map so elements CAN be traversed" is the natural fix and
 * is already built — it is what `entityMap` is, and it measures 28.5x faster
 * than an immutable store on the keyed-collection task. Applying it to EVERY
 * array is what does not survive measurement: a per-node Map index cost +12.1%
 * on subtree reads and 310B/node in this repo (built, measured, reverted), an
 * index-keyed structure pays O(n) to reindex on any insert or reorder, and
 * `tree()` has to hand back a real Array regardless. Most arrays in a tree are
 * ordered lists of primitives and would pay that for nothing.
 *
 * So: a keyed collection is an `entityMap`; an ordered list is an array leaf;
 * and a marker in an array is the first case wearing the second's clothes.
 *
 * Bounded scan, dev only, deduped per key.
 */
const MARKER_IN_ARRAY_WARNED = new Set<string>();

function warnMarkerInArray(key: string, value: readonly unknown[]): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  if (MARKER_IN_ARRAY_WARNED.has(key)) return;

  const limit = Math.min(value.length, ENTITY_ARRAY_SAMPLE);
  for (let i = 0; i < limit; i++) {
    const item = value[i];
    if (item === null || typeof item !== 'object') continue;
    if (!isEntityMapMarker(item) && !isRegisteredMarker(item)) continue;

    MARKER_IN_ARRAY_WARNED.add(key);
    console.warn(
      `SignalTree: "${key}[${i}]" holds a MARKER inside an array. Array ` +
        `elements are never traversed, so the marker is never materialised — ` +
        `it stays a raw object, it is not a signal, and writes to it are lost. ` +
        `Markers belong at object positions; for a keyed collection use ` +
        `entityMap({ selectId }). [ST2021]`
    );
    return;
  }
}

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

  // Kept SHORT deliberately: this string sits in the dev-mode floor that
  // tools/check-bundle-budget.mjs measures, and an earlier draft inlining the
  // full benchmark table cost ~0.8KB gzip across every bundle. The numbers and
  // the "when an array leaf is right" case live in docs/errors/README.md and
  // the entity cookbook, which the code points at.
  console.warn(
    `SignalTree: "${key}" holds ${value.length} objects with a stable ` +
      `"${idKey}" — use entityMap({ selectId: (e) => e.${idKey} }). An array ` +
      `leaf rebuilds and re-compares the whole array on every update — two ` +
      `orders of magnitude at 50k. Read-only or replaced wholesale? ` +
      `compared() silences this. [ST2018]`
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

/**
 * @internal Which hydrate mode a write through `recursiveUpdate` represents.
 *
 * `recursiveUpdate` serves BOTH `tree(partial)` and `timeTravel` undo/redo —
 * `restoreState` falls through to `this.tree(state)` — so the two cannot be
 * told apart by call shape. They are told apart by the write context that
 * time travel already tags every replay with (`source: 'time-travel'`), which
 * exists for exactly this kind of question and needed no new plumbing.
 *
 * The distinction is not cosmetic. An UNDO must land the user in the state they
 * were in, exactly; a REHYDRATE crosses a process boundary where nothing is in
 * flight and some state must be normalised rather than believed. See
 * docs/architecture/undo-redo-vs-devtools.md.
 */
function currentHydrateMode(): 'merge' | 'restore' {
  return getActiveWriteContext()?.source === 'time-travel'
    ? 'restore'
    : 'merge';
}

/** Dev-mode: paths already warned about for ref-identical no-op writes. */
const warnedNoopPaths = new Set<string>();
/** @internal Dedupe for ST2027. Separate from ST2003 — different mistakes. */
const warnedNoopCopyPaths = new Set<string>();

/**
 * @internal Is this value big enough that a wasted deep-equal walk matters?
 *
 * 32 matches ST2018's collection threshold so the two diagnostics agree on what
 * counts as "a lot". Deliberately shallow — an O(1) length/key count, never a
 * walk, because a diagnostic that has to traverse the value to decide whether
 * traversing the value was wasteful is its own punchline.
 */
function isLargeEnoughToMatter(value: object): boolean {
  if (Array.isArray(value)) return value.length >= 32;
  if (value instanceof Map || value instanceof Set) return value.size >= 32;
  return Object.keys(value).length >= 32;
}

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

    // A materialised marker hydrates ITSELF. Without this, a marker whose node
    // is an unbranded callable (`form`) or a plain object with its own API
    // (`entityMap`, `status`) falls through to the branch/leaf logic below,
    // which has no idea how to write it — so `tree(partial)` silently no-ops,
    // and `timeTravel` undo silently leaves the marker at its post-change
    // value, landing the user in a state that never existed and reporting
    // success. Measured before this: `n=3 rows=3` → undo → `n=2 rows=3`.
    if (hydrateMarkerNode(prop, value, currentHydrateMode())) {
      if (out) out.push(childPath);
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
        if (
          !Object.is(
            untracked(() => sig()),
            current
          )
        )
          out.push(childPath);
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
    // ST2005 — attempted and REVERTED, deliberately. Recorded here so the
    // next person does not re-derive it.
    //
    // Its 13.x removal note said a diagnostic here "would fire on
    // `tree(tree())`, the ordinary snapshot-restore pattern", and that markers
    // "do not accept merge writes BY DESIGN". Both were true then. Neither is
    // now: every marker declares `hydrate`, the branch above routes to it, and
    // `tree(tree())` is pinned by a round-trip test that reads LIVE node values
    // (the naive snapshot-vs-snapshot form passes vacuously when both sides
    // drop the same key).
    //
    // So the reasoning did expire — but restoring the diagnostic at THIS site
    // still cries wolf, measured: it fired on an ordinary leaf write
    // (`tree({known: 2})`) and on `{ user: undefined }`, which is type-legal
    // `Partial<T>` and exactly what `{ ...defaults, ...patch }` produces for an
    // absent optional key. This is the tail of the outer dispatch, not the
    // "matched neither guard" branch the note described.
    //
    // RESOLVED — the narrow site is not on this path at all, and the code is
    // not ST2005. That number is taken: `@signaltree/ng-forms` throws [ST2005]
    // for a bridged `form()` marker carrying its own `asyncValidators`. It has
    // shipped since v12 and is documented; reusing it in core would have
    // collided.
    //
    // The real remaining gap was narrower than this note assumed. A marker that
    // declares `snapshot` but no `hydrate`, whose node is not a writable
    // signal, snapshots perfectly and silently discards every write — measured:
    // `tree()` gave `{"p":1}`, `tree({p: 99})` left it at `1`, nothing reported
    // at either end. [ST2022] stays quiet because `snapshot` IS declared.
    //
    // That is now [ST2023], reported at MATERIALISATION (materialize-markers.ts),
    // where the node exists so its shape is knowable, once per processor, off
    // the write path entirely. Its predicate is the exact mirror of this
    // function's fall-through, which is what keeps it from crying wolf the way
    // a diagnostic at THIS site did. If the fall-through widens, widen ST2023
    // with it.
  }
}

// =============================================================================
// SIGNAL STORE CREATION
// =============================================================================

/**
 * @internal The comparator a LEAF is created with.
 *
 * In production this IS `base` — the ternary at each call site folds and this
 * function becomes unreferenced, so `check-devmode-foldable` reclaims all of
 * it. In dev it wraps `base` to catch ST2027.
 *
 * Why here rather than in `recursiveUpdate`, where ST2003 lives: a direct
 * `tree.$.rows.set(v)` goes STRAIGHT to the Angular signal and never enters
 * `recursiveUpdate` at all. That is the most common write form, and it is the
 * one the corrupted benchmarks used — a diagnostic that only covers merge
 * writes would have missed the case that motivated it. The comparator is the
 * one place every write funnels through, and it already knows both halves of
 * the answer: whether the values compared equal, and whether the references
 * differed.
 */
function leafEqual(
  base: (a: unknown, b: unknown) => boolean,
  path: string
): (a: unknown, b: unknown) => boolean {
  return (a: unknown, b: unknown): boolean => {
    const eq = base(a, b);
    // A no-op write, and NOT the reference kind (ST2003 covers that): a new
    // object that deep-equals the current value. `deepEqual` cannot
    // short-circuit on it, so the whole structure was walked to conclude
    // nothing changed — and then nothing notifies.
    if (
      eq &&
      a !== b &&
      a !== null &&
      typeof a === 'object' &&
      isLargeEnoughToMatter(a) &&
      !warnedNoopCopyPaths.has(path)
    ) {
      warnedNoopCopyPaths.add(path);
      console.warn(
        `SignalTree: a write to "${path || '(root leaf)'}" changed NOTHING — ` +
          `the new value is a different object but deep-equals the current ` +
          `one, so the whole structure was compared and the write discarded. ` +
          `A re-fetched payload does this. Skip the write when the data is ` +
          `unchanged, or use compared() to pick a cheaper equality. [ST2027]`
      );
    }
    return eq;
  };
}

function wrapLeafSignal<TValue>(
  leaf: WritableSignal<TValue>,
  path: string,
  positionIds: readonly number[] | undefined
): void {
  wrapOwnedWritableSignal(leaf, {
    path,
    ownerPath: path,
    positionIds,
  });
}

function createSignalStore<T>(
  obj: T,
  equalityFn: (a: unknown, b: unknown) => boolean,
  materializationContext: MaterializationContext,
  buildPlan: TreeBuildPlan,
  captureRuntime: MutationCaptureRuntime,
  scalarSlotRuntime: TreeScalarSlotRuntime | undefined,
  positionIds?: readonly number[],
  /**
   * Dot-path to this node, used ONLY to name the leaf in ST2027. Threaded
   * rather than reconstructed because the walk already knows it, and a
   * diagnostic that cannot say WHICH leaf is most of the way to useless.
   */
  path = ''
): TreeNode<T> {
  const createLeafSignal = <TValue>(
    value: TValue,
    leafPath: string,
    leafPositionIds: readonly number[] | undefined,
    equal: (a: unknown, b: unknown) => boolean
  ): WritableSignal<TValue> => {
    if (scalarSlotRuntime && leafPositionIds?.[0] !== undefined) {
      return scalarSlotRuntime.createLeaf(
        value,
        equal as (current: TValue, next: TValue) => boolean,
        leafPositionIds[0]
      );
    }

    return signal(value, { equal });
  };

  // Primitives, null, undefined
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    const equal =
      typeof ngDevMode === 'undefined' || ngDevMode
        ? leafEqual(equalityFn, path)
        : equalityFn;
    const leaf = createLeafSignal(obj, path, positionIds, equal);
    finalizeLeafSignal(leaf, path, positionIds, buildPlan, captureRuntime);
    return leaf as unknown as TreeNode<T>;
  }

  // Arrays
  if (Array.isArray(obj)) {
    const equal =
      typeof ngDevMode === 'undefined' || ngDevMode
        ? leafEqual(equalityFn, path)
        : equalityFn;
    const leaf = createLeafSignal(obj, path, positionIds, equal);
    finalizeLeafSignal(leaf, path, positionIds, buildPlan, captureRuntime);
    return leaf as unknown as TreeNode<T>;
  }

  // Built-in objects (Date, Map, Set, etc.)
  if (isBuiltInObject(obj)) {
    const equal =
      typeof ngDevMode === 'undefined' || ngDevMode
        ? leafEqual(equalityFn, path)
        : equalityFn;
    const leaf = createLeafSignal(obj, path, positionIds, equal);
    finalizeLeafSignal(leaf, path, positionIds, buildPlan, captureRuntime);
    return leaf as unknown as TreeNode<T>;
  }

  // Regular object - recursive
  const store: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    let childPositionIds: number[] | undefined;
    const getChildPositionIds = (): number[] | undefined => {
      if (!materializationContext.positionTopologyEnabled) {
        return undefined;
      }

      return (childPositionIds ??= [
        materializationContext.allocatePositionId(positionIds?.[0]),
      ]);
    };
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
      const leaf = signal(value.value, {
        equal: value.equal as (a: unknown, b: unknown) => boolean,
      });
      wrapLeafSignal(leaf, childPath, getChildPositionIds());
      store[key] = leaf;
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
      const childPositionIds = getChildPositionIds();
      const equal =
        typeof ngDevMode === 'undefined' || ngDevMode
          ? leafEqual(equalityFn, childPath)
          : equalityFn;
      const leaf = createLeafSignal(value, childPath, childPositionIds, equal);
      finalizeLeafSignal(
        leaf,
        childPath,
        childPositionIds,
        buildPlan,
        captureRuntime
      );
      store[key] = leaf;
      continue;
    }

    // Arrays, built-ins
    if (Array.isArray(value) || isBuiltInObject(value)) {
      if (Array.isArray(value)) {
        warnMarkerInArray(key, value);
        warnEntityArrayLeaf(key, value);
      }
      const childPositionIds = getChildPositionIds();
      const equal =
        typeof ngDevMode === 'undefined' || ngDevMode
          ? leafEqual(equalityFn, childPath)
          : equalityFn;
      const leaf = createLeafSignal(value, childPath, childPositionIds, equal);
      finalizeLeafSignal(
        leaf,
        childPath,
        childPositionIds,
        buildPlan,
        captureRuntime
      );
      store[key] = leaf;
      continue;
    }

    // Nested object - recurse and wrap in NodeAccessor
    const nested = createSignalStore(
      value,
      equalityFn,
      materializationContext,
      buildPlan,
      captureRuntime,
      scalarSlotRuntime,
      getChildPositionIds(),
      // Folds to '' in production — the path exists only to name a leaf in
      // ST2027, so a prod build should not spend a string concat per node
      // building one nothing will read.
      typeof ngDevMode === 'undefined' || ngDevMode
        ? path
          ? `${path}.${key}`
          : key
        : ''
    );
    store[key] = makeNodeAccessor(nested, childPath, getChildPositionIds());
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
  config: TreeConfig,
  materializationContext: MaterializationContext,
  buildPlan: TreeBuildPlan = LEGACY_TREE_BUILD_PLAN,
  captureRuntime: MutationCaptureRuntime = createMutationCaptureRuntime()
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
  const scalarSlotRuntime = buildPlan.has('causal-runtime')
    ? createTreeScalarSlotRuntime(materializationContext.physicalCommitClock)
    : undefined;
  const rootPositionIds = materializationContext.positionTopologyEnabled
    ? [materializationContext.allocatePositionId()]
    : undefined;

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
      signalState = createSignalStore(
        initialState,
        equalityFn,
        materializationContext,
        buildPlan,
        captureRuntime,
        scalarSlotRuntime,
        rootPositionIds
      );
      disposeLazy = undefined;
    }
  } else {
    signalState = createSignalStore(
      initialState,
      equalityFn,
      materializationContext,
      buildPlan,
      captureRuntime,
      scalarSlotRuntime,
      rootPositionIds
    );
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
  (tree as unknown as Record<symbol, MutationCaptureRuntime>)[
    MUTATION_CAPTURE_RUNTIME
  ] = captureRuntime;
  if (rootPositionIds) {
    defineOwnedPositionIds(tree as object, rootPositionIds);
    defineOwnedPositionIds(signalState as object, rootPositionIds);
  }
  if (buildPlan.has('mutation-capture')) {
    defineOwnedOwnerPath(tree as object, '');
    defineOwnedOwnerPath(signalState as object, '');
  }
  if (materializationContext.positionTopologyEnabled) {
    definePositionRegistry(
      tree as object,
      materializationContext.positionRegistry
    );
    definePositionRegistry(
      signalState as object,
      materializationContext.positionRegistry
    );
  }
  if (materializationContext.physicalCommitClock) {
    definePhysicalCommitClock(
      tree as object,
      materializationContext.physicalCommitClock
    );
    definePhysicalCommitClock(
      signalState as object,
      materializationContext.physicalCommitClock
    );
  }
  if (scalarSlotRuntime && scalarSlotRuntime.slotCount() > 0) {
    defineTreeScalarSlotRuntime(tree as object, scalarSlotRuntime);
    defineTreeScalarSlotRuntime(signalState as object, scalarSlotRuntime);
  }

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
   *   .with(devTools({ name: 'MyTree' }));
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
   *   - Options: `name`, `enableBrowserDevTools`, `enableLogging`, `performanceThreshold`, `enabled`.
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

  // `batchUpdate()` was REMOVED in 14.1.1. Its body was
  // `recursiveUpdate(signalState, arg)` — exactly what the tree callable
  // `tree(partial)` / `tree(updater)` already does. With `batching()` attached it
  // additionally wrapped in `batch()`, so `tree.batchUpdate(x)` was precisely
  // `tree.batch(() => tree(x))`. MEASURED equivalent before removal: 0.921 vs
  // 0.925 us at 10 fields, 16.585 vs 16.475 us at 100 (medians of 9 x 2000).

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

  const physicalCommitClock = createPhysicalCommitClock();
  const materializationContext = createMaterializationContext(
    true,
    (capability) => LEGACY_TREE_BUILD_PLAN.has(capability),
    physicalCommitClock
  );
  const captureRuntime = createMutationCaptureRuntime();
  const baseTree = create(
    initialState,
    config,
    materializationContext,
    LEGACY_TREE_BUILD_PLAN,
    captureRuntime
  );
  const builder = createBuilder<T, TreeNode<T>>(
    baseTree,
    materializationContext
  );

  // If derived factory provided, apply it immediately
  if (isFactory) {
    return builder.derived(
      configOrDerived as ($: TreeNode<T>) => TDerived
    ) as unknown as SignalTreeBuilder<T, TreeNode<T>>;
  }

  return builder;
}

export function plannedSignalTree<T extends object>(
  initialState: T,
  config: TreeConfig = {}
): SignalTreePlanBuilder<T> {
  return createPlannedBuilder(initialState, config);
}

function createPlannedBuilder<TSource extends object, TAdded extends object = object>(
  initialState: TSource,
  config: TreeConfig,
  enhancers: EnhancerWithMeta<unknown>[] = []
): SignalTreePlanBuilder<TSource, TAdded> {
  let builtTree: (ISignalTree<TSource> & TAdded) | undefined;

  const planner: SignalTreePlanBuilder<TSource, TAdded> = {
    with<TNextAdded>(
      enhancer: (tree: ISignalTree<TSource>) => ISignalTree<TSource> & TNextAdded
    ): SignalTreePlanBuilder<TSource, TAdded & TNextAdded> {
      if (builtTree) {
        throw new Error(
          'SignalTree: plannedSignalTree() cannot add capabilities after build().'
        );
      }

      return createPlannedBuilder<TSource, TAdded & TNextAdded>(
        initialState,
        config,
        [...enhancers, enhancer as EnhancerWithMeta<unknown>]
      );
    },

    build(): ISignalTree<TSource> & TAdded {
      if (builtTree) {
        return builtTree;
      }

      const orderedEnhancers = resolveEnhancerOrder(
        [...enhancers],
        new Set<string>(),
        Boolean(config.debugMode)
      );
      const buildPlan = buildTreePlan(orderedEnhancers);
      const physicalCommitClock = buildPlan.has('causal-runtime')
        ? createPhysicalCommitClock()
        : undefined;
      const materializationContext = createMaterializationContext(
        buildPlan.has('position-topology'),
        (capability) => buildPlan.has(capability),
        physicalCommitClock
      );
      const captureRuntime = createMutationCaptureRuntime();

      let tree = create(
        initialState,
        config,
        materializationContext,
        buildPlan,
        captureRuntime
      ) as ISignalTree<TSource>;

      materializeTreeMarkers(tree, materializationContext);

      for (const enhancer of orderedEnhancers) {
        tree = tree.with(
          enhancer as (tree: ISignalTree<TSource>) => ISignalTree<TSource>
        );
      }

      Object.defineProperty(tree, 'with', {
        value: () => {
          throw new Error(
            'SignalTree: Capabilities are fixed at build() time for plannedSignalTree().'
          );
        },
        enumerable: false,
        writable: false,
        configurable: true,
      });

      Object.defineProperty(tree, PLANNED_TREE_BUILD_SYMBOL, {
        value: buildPlan,
        enumerable: false,
        configurable: true,
      });

      builtTree = tree as ISignalTree<TSource> & TAdded;
      return builtTree;
    },
  };

  return planner;
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
  baseTree: ISignalTree<TSource>,
  materializationContext: MaterializationContext
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
    materializeMarkers(baseTree.$, undefined, [], materializationContext);
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
        enhanced as unknown as ISignalTree<TSource>,
        materializationContext
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
      for (const symbolKey of Object.getOwnPropertySymbols(enhanced)) {
        const descriptor = Object.getOwnPropertyDescriptor(enhanced, symbolKey);
        if (!descriptor) {
          continue;
        }
        try {
          Object.defineProperty(newBuilder, symbolKey, descriptor);
        } catch {
          /* ignore non-configurable symbols */
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

  // The `batchUpdate` forward was REMOVED in 14.1.1 along with the method it
  // forwarded. Use `tree(partial)`, or `tree.batch(() => tree(partial))`.

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
