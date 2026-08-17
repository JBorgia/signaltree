import {
  getMaterializationRealization,
} from './materialization-realization';

/**
 * "Has the adapter already realized this node?" — see
 * `materialization-realization.ts`. Without an adapter this answers `false`,
 * which is the conservative direction: the walk treats the node as ordinary
 * data rather than skipping it.
 */
function isReactiveNode(node: unknown): boolean {
  return getMaterializationRealization()?.isReactiveNode(node) ?? false;
}

import {
  createPositionRegistry,
  type PositionRegistry,
} from './position-registry';
import type { PhysicalCommitClock } from './physical-commit-clock';
import { getPathNotifier, PathNotifier } from '../path-notifier';
import { isNodeAccessor, isTraversableNode } from './node-shape';

/** @internal Must match the symbol set by `makeNodeAccessor`. */
const NODE_STORE_SYMBOL = Symbol.for('SignalTree:NodeStore');

/**
 * Unified Marker Processing
 *
 * Processes all markers in a signal tree during finalization.
 * Markers are processed in a single pass, converting placeholder objects
 * into their materialized signal forms.
 *
 * Processing order (in finalize()):
 * 1. materializeMarkers() - entityMap, status, stored markers → signals
 * 2. applyDerivedFactories() - derived factories → computed signals
 *
 * TREE-SHAKING: This module has NO side effects at import time.
 * Built-in markers (entityMap, status, stored) self-register when
 * their factory functions are first called. If you never use a marker,
 * its code is completely tree-shaken from your bundle.
 */

// =============================================================================
// MARKER PROCESSOR REGISTRY
// =============================================================================

/**
 * How a snapshot is being applied. A property of the CALL SITE, not of the
 * data — the call site is the only place that knows whether a process boundary
 * was crossed.
 *
 * - `merge`     — `tree(partial)`. A partial write from application code.
 * - `restore`   — `timeTravel` undo/redo/jumpTo. Same process; an in-flight
 *                 request may genuinely still be running, so transient state is
 *                 restored VERBATIM.
 * - `rehydrate` — `deserialize` from storage. A process boundary was crossed and
 *                 the payload may be OLD, so a marker that owns a live source
 *                 is entitled to prefer its own fresher result.
 * - `transfer`  — SSR/`TransferState`. A process boundary was crossed and the
 *                 payload is FRESHER than anything here, because nothing in
 *                 this process has run yet. RFC 0014: `rehydrate` used to cover
 *                 both, and the two want OPPOSITE answers — `asyncSource`
 *                 correctly declines a day-old localStorage payload and
 *                 wrongly declined a server payload from milliseconds ago,
 *                 shipping 54.3KB into the page and then refetching anyway.
 *                 was crossed, so nothing is in flight and transient state must
 *                 be normalised rather than believed.
 */
export type HydrateMode = 'merge' | 'restore' | 'rehydrate' | 'transfer';

export interface MaterializationContext {
  positionRegistry: PositionRegistry;
  positionTopologyEnabled: boolean;
  physicalCommitClock?: PhysicalCommitClock;
  hasCapability: (capability: 'mutation-capture' | 'position-topology') => boolean;
  allocatePositionId: (parentPositionId?: number) => number;
}

export function createMaterializationContext(
  positionTopologyEnabled = true,
  hasCapability: (capability: 'mutation-capture' | 'position-topology') => boolean =
    (capability) =>
      capability === 'position-topology' ? positionTopologyEnabled : true,
  physicalCommitClock?: PhysicalCommitClock
): MaterializationContext {
  const positionRegistry = createPositionRegistry();
  return {
    positionRegistry,
    positionTopologyEnabled,
    physicalCommitClock,
    hasCapability,
    allocatePositionId: (parentPositionId?: number) =>
      positionRegistry.allocate(parentPositionId),
  };
}

interface MarkerProcessor {
  check: (value: unknown) => boolean;
  create: (
    marker: unknown,
    notifier: PathNotifier,
    path: string,
    context: MaterializationContext,
    parentPositionId?: number
  ) => unknown;
  /**
   * Live node → the payload that represents its STATE. Anything the node can
   * recompute must be omitted: a derived value frozen into a snapshot is stale
   * the moment anything changes, and a snapshot exists to rehydrate a tree that
   * already knows how to derive.
   *
   * Omitting this means "my node is already a plain signal, the normal walk
   * handles me" — which is true of `stored()` and nothing else today.
   */
  snapshot?: (node: unknown) => unknown;
  /** Payload → live node. See {@link HydrateMode}. */
  hydrate?: (node: unknown, value: unknown, mode: HydrateMode) => void;
}

/**
 * Stamped on every materialised node so finding its processor is O(1).
 *
 * ⚠️ There is NO `owns()` hook. Earlier revisions of this comment referred to
 * one as though it existed, and a research doc then repeated it as fact — the
 * exact stale-comment-becomes-canon failure this codebase keeps hitting.
 * Source ownership is decided INSIDE each marker's `hydrate`, which already
 * receives the mode: `entityMap` declines when `typeof node.load === 'function'`,
 * `asyncSource` declines on `rehydrate` outright. A separate hook would add
 * surface for a decision the existing one can already express.
 *
 * The stamp matters for isolation, not just speed. A linear scan over the
 * registry would put every marker author's predicate on the hot path of every
 * node materialisation, letting one slow third-party check degrade trees that
 * do not contain that marker. A stamp makes a marker's cost payable only by
 * trees that use it — the same boundary lazy self-registration already draws
 * for bundle size.
 *
 * The `SignalTree:` prefix is load-bearing: `unwrap`'s symbol loop skips that
 * prefix by identity, so a correctly-named stamp cannot leak into a snapshot.
 * Name it anything else and it lands in every persisted payload.
 */
const PROCESSOR_STAMP = Symbol.for('SignalTree:MarkerProcessor');

/** @internal Returns the processor that materialised this node, if any. */
export function getNodeProcessor(node: unknown): MarkerProcessor | undefined {
  if (!isTraversableNode(node)) return undefined;
  return (node as Record<symbol, MarkerProcessor | undefined>)[PROCESSOR_STAMP];
}

/**
 * @internal Snapshot a materialised marker node, or `undefined` if the node is
 * not a marker or its processor declines to define a snapshot.
 */
/**
 * Memoised per node, because the wrapper churned on UNRELATED writes.
 *
 * `unwrap` calls this on every parent rebuild, and `isMemoisable` cannot accept
 * a marker node (it recognises tree stores and node accessors only), so each
 * call re-ran `proc.snapshot(node)` and allocated a fresh `{ value }`. Measured:
 * after changing an unrelated leaf, `tree().rows !== previous.rows` even though
 * the collection had not changed — while the `all` array INSIDE it was
 * correctly stable. Only the wrapper churned, and that is enough to make a
 * `computed(() => tree().rows)` recompute and an OnPush component bound to the
 * whole marker re-render on every unrelated write.
 *
 * A `computed` is the right memo here rather than a hand-rolled cache: the
 * marker's snapshot reads the marker's own signals, so Angular's graph already
 * knows exactly when it is stale. Cost is O(1) per marker, not per entity —
 * this is a REFERENCE-STABILITY fix, and it does not touch the per-entity
 * figures in docs/architecture/memory-profile.md, which are the entityMap's id
 * index and storage.
 */
const SNAPSHOT_MEMO = new WeakMap<object, () => { value: unknown }>();

export function snapshotMarkerNode(
  node: unknown
): { value: unknown } | undefined {
  const proc = getNodeProcessor(node);
  if (!proc?.snapshot) return undefined;
  if (!isTraversableNode(node)) return { value: proc.snapshot(node) };

  const realization = getMaterializationRealization();
  if (!realization) {
    // No adapter: still correct, just recomputed. Reference stability is an
    // optimisation the adapter's dependency graph provides, not a semantic.
    return { value: proc.snapshot(node) };
  }

  let memo = SNAPSHOT_MEMO.get(node as object);
  if (!memo) {
    const snapshot = proc.snapshot;
    memo = realization.memoizeSnapshot(node as object, () => ({
      value: snapshot(node),
    }));
    SNAPSHOT_MEMO.set(node as object, memo);
  }
  return memo();
}

/** @internal Hydrate a materialised marker node. Returns false if unhandled. */
export function hydrateMarkerNode(
  node: unknown,
  value: unknown,
  mode: HydrateMode
): boolean {
  const proc = getNodeProcessor(node);
  if (!proc?.hydrate) return false;
  proc.hydrate(node, value, mode);
  return true;
}

// =============================================================================
// HYDRATION DECISIONS — §5.5
// =============================================================================

/**
 * What a marker DID with a payload, when it did not simply accept it.
 *
 * - `declined`   — the marker owns a source and refused a `rehydrate` payload.
 *                  Its own loader is the authority on that data.
 * - `normalised` — the payload was accepted but adjusted, because a value that
 *                  described this process cannot describe a new one (a
 *                  `LOADING` status after a process boundary).
 *
 * Accepting is the default and is NOT reported: a report on every restored leaf
 * is noise, and noise is how the interesting lines get missed.
 */
export type HydrateDecision = 'declined' | 'normalised';

/**
 * WHY a marker decided what it did — stable, machine-readable, and it SHIPS.
 *
 * Split from the prose deliberately, following the rule in
 * docs/performance/dropping-dev-code.md: *advisory prose is removable, identity
 * is not.* A listener in production needs to know a rehydrate was declined and
 * why; it does not need the paragraph explaining it to a human. So `reason` is
 * a stable union that survives a production build, and `detail` is prose that
 * folds away with `ngDevMode`.
 */
export type HydrateReason =
  /** A loader owns this data and is the authority on its freshness. */
  | 'loader-owns-source'
  /** No in-flight request survives a process boundary. */
  | 'no-request-survives-boundary';

export interface HydrateDecisionEvent {
  /** Which marker decided, e.g. `entityMap`, `status`. */
  marker: string;
  decision: HydrateDecision;
  mode: HydrateMode;
  /** Stable and greppable. Present in production. */
  reason: HydrateReason;
  /** Human prose. DEV ONLY — folds away under `ngDevMode: false`. */
  detail?: string;
}

const hydrateListeners = new Set<(e: HydrateDecisionEvent) => void>();

/**
 * Observe hydration decisions. Returns an unsubscribe function.
 *
 * `hydrate` makes real choices now — it declines a payload when a loader owns
 * the source, and normalises `LOADING` to `NotLoaded` across a process
 * boundary — and until 14.0.0 it reported NONE of them. A developer whose
 * payload was silently declined had no way to see it.
 *
 * This is deliberately NOT a warning. Declining is CORRECT, and warning on
 * correct behaviour trains people to ignore the channel — which is how the four
 * bugs behind this release stayed invisible. It is an observation seam, the
 * same shape as `getPathNotifier`.
 *
 * **Listeners fire in production too.** An earlier revision guarded the call
 * sites with `ngDevMode` to keep the prose out of the bundle, which made this a
 * public API that silently did nothing in a production build — the exact defect
 * class 14.0.0 removed `tree.$.count(5)` for. A declined rehydrate is a real
 * operational event ("my offline-first cache was ignored"), and telemetry is a
 * legitimate reason to want it. Only `detail` folds; `reason` is stable and
 * always present.
 *
 * Every other silence 14.0.0 fixed was inherited. The loader-declines rule is
 * silence this release INTRODUCES, so it ships with its own way to be seen.
 */
export function onHydrateDecision(
  fn: (e: HydrateDecisionEvent) => void
): () => void {
  hydrateListeners.add(fn);
  return () => hydrateListeners.delete(fn);
}

/** @internal Markers call this instead of returning silently. */
export function reportHydrateDecision(e: HydrateDecisionEvent): void {
  for (const fn of hydrateListeners) fn(e);
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    console.info(
      `SignalTree: ${e.marker} ${e.decision} a ${e.mode} payload ` +
        `[${e.reason}]${e.detail ? ` — ${e.detail}` : ''}`
    );
  }
}

/**
 * Registry of marker processors.
 * Order matters: first match wins.
 */
const MARKER_PROCESSORS: MarkerProcessor[] = [];

/**
 * Check if a value matches any registered marker processor.
 * Used by createSignalStore to preserve markers for later materialization.
 *
 * This enables user-defined markers registered via registerMarkerProcessor()
 * to be preserved during tree creation and materialized later.
 *
 * @param value - The value to check
 * @returns true if the value is a registered marker
 */
export function isRegisteredMarker(value: unknown): boolean {
  // Early exit for non-objects
  if (value === null || typeof value !== 'object') {
    return false;
  }

  // Fast path: most objects don't have Symbol keys
  // Custom markers typically use Symbols for identification
  if (Object.getOwnPropertySymbols(value).length === 0) {
    return false;
  }

  for (const processor of MARKER_PROCESSORS) {
    if (processor.check(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a value has Symbol keys but isn't a registered marker.
 * Used for dev-mode warnings about potential registration timing issues.
 *
 * @param value - The value to check
 * @returns true if value has Symbols but no matching processor
 * @internal
 */
export function hasUnregisteredSymbolKeys(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const symbolKeys = Object.getOwnPropertySymbols(value);
  if (symbolKeys.length === 0) {
    return false;
  }
  // Has Symbols but no registered processor matched
  return !isRegisteredMarker(value);
}

/**
 * Register a marker processor.
 *
 * Built-in markers call this automatically when their factory is first used.
 * Custom markers should call this at app startup, BEFORE creating trees.
 *
 * @param check - Type guard function to identify the marker
 * @param create - Factory function to create the materialized signal
 *
 * @example
 * ```typescript
 * // Custom marker registration (call before creating trees)
 * registerMarkerProcessor(isCounterMarker, createCounterSignal);
 * ```
 */
export function registerMarkerProcessor<T, R>(
  check: (value: unknown) => value is T,
  create: (
    marker: T,
    notifier: PathNotifier,
    path: string,
    context: MaterializationContext,
    parentPositionId?: number
  ) => R,
  hooks?: {
    snapshot?: (node: R) => unknown;
    hydrate?: (node: R, value: unknown, mode: HydrateMode) => void;
    transient?: true;
  }
): void {
  // Public entry point — used for custom markers. Emits the post-construction
  // timing warning, because an imperative custom-marker registration that lands
  // after trees already exist is a genuine footgun.
  registerProcessor(check, create, /* suppressTimingWarning */ false, hooks);
}

/**
 * Register a built-in marker processor (status, entityMap, stored, form,
 * asyncSource, asyncQuery).
 *
 * Built-in markers self-register lazily on first factory call (for tree-shaking).
 * That factory call always happens INSIDE the state literal — `signalTree({ x:
 * status() })` evaluates `status()` before `signalTree()` runs — so the processor
 * is always registered before the tree it belongs to is materialized. The marker
 * is therefore correct-by-construction and the post-construction timing warning
 * does NOT apply, even when earlier trees (that never used this marker) already
 * exist. Suppress it to avoid false alarms in multi-store / lazy-module apps.
 *
 * @internal
 */
export function registerBuiltinMarkerProcessor<T, R>(
  check: (value: unknown) => value is T,
  create: (
    marker: T,
    notifier: PathNotifier,
    path: string,
    context: MaterializationContext,
    parentPositionId?: number
  ) => R,
  hooks?: {
    snapshot?: (node: R) => unknown;
    hydrate?: (node: R, value: unknown, mode: HydrateMode) => void;
    transient?: true;
  }
): void {
  registerProcessor(check, create, /* suppressTimingWarning */ true, hooks);
}

/**
 * ST2022 — a marker registered without saying what of it is state.
 *
 * This is the guard against the defect class that produced FOUR separate bugs:
 * `form()` and the three async markers vanishing from every snapshot,
 * `entityMap` emitting a `map` that JSON rendered as `{}` while holding 10,000
 * entities, and `status()` shipping six computeds plus nine setter METHODS into
 * a payload that then threw on restore. All four share one cause — nothing ever
 * forced a marker author to answer *"what of me is state?"*
 *
 * Enforced at REGISTRATION rather than at materialisation, because
 * `materializeMarkers` swallows `create()` throws (RFC 0005 §7), so a
 * materialiser-level guard fails open — the lesson `entityMap({ load })` already
 * learned with [ST2004].
 *
 * Three answers are valid, and silence is not one of them:
 *   - `snapshot` (+ optional `hydrate`) — here is my state
 *   - `transient: true` — I deliberately have none; omit me, and do not warn
 *   - a node that is already a real Angular signal — the ordinary walk handles
 *     it, and this check does not apply
 *
 * Warns rather than throws, for now: `registerMarkerProcessor` is public and
 * throwing would break every existing third-party marker at runtime rather than
 * at author time. The type signature makes it a compile error for anyone using
 * the types; this catches the ones who cast past them. It should become a throw
 * in the next major.
 */
function warnUndeclaredMarker(): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  console.warn(
    'SignalTree: a marker was registered without `snapshot` or ' +
      '`transient: true`. Its value will be DROPPED from every snapshot — ' +
      'tree(), persistence(), devtools, audit and undo/redo — silently, ' +
      'except for an ST2008 report at read time. Declare what of your marker ' +
      'is state: pass `{ snapshot, hydrate }`, or `{ transient: true }` if it ' +
      'deliberately has none. [ST2022]'
  );
}

/**
 * ST2023 — a marker that can be SNAPSHOTTED but never restored.
 *
 * This is the half of the marker-drop class that [ST2022] cannot see. ST2022
 * asks "what of you is state?" and a `snapshot` hook answers it, so a processor
 * with `snapshot` and no `hydrate` passes registration cleanly — then serializes
 * perfectly and silently discards every write. Measured on a probe marker:
 * `tree()` emitted `{"p":1}`, `tree({p: 99})` left the node at `1`, and NOTHING
 * was reported. `tree(tree())` on such a marker loses data with no diagnostic
 * at either end.
 *
 * Why HERE and not at registration, and not on the write path:
 *
 *  - **Not at registration.** `snapshot` without `hydrate` is perfectly correct
 *    when the node is a writable signal — `recursiveUpdate`'s leaf branch writes
 *    it, no hook needed. Registration cannot know the node's shape, so a guard
 *    there would fire on correct code. That is precisely how the previous
 *    attempt at a write-shape diagnostic (the retired core ST2005) failed: it
 *    sat where ordinary writes reached it and cried wolf on `tree({known: 2})`
 *    and on type-legal `{ user: undefined }`.
 *  - **Not on the write path.** The write path is the thing this design
 *    protects; it should not grow a registry lookup to serve a third-party
 *    authoring mistake.
 *  - **Here**, at materialisation, the node EXISTS, so its shape is knowable,
 *    and the check is one property read per marker node, once — off the write
 *    path entirely. It also fires before the user ever attempts a restore,
 *    which matters because the bug is latent until then.
 *
 * The predicate is deliberately the exact MIRROR of `recursiveUpdate`'s
 * fall-through (`isSignal(node) && 'set' in node`). Anything that branch can
 * write is not dropped and is not reported; anything it cannot write, and that
 * has no `hydrate`, is. Keeping the two in one shape is what makes this
 * incapable of crying wolf — if the fall-through ever widens, this must widen
 * with it.
 *
 * Reachable only by a marker registered through the public
 * `registerMarkerProcessor`; no built-in marker trips it (all declare `hydrate`
 * or are signal-shaped), which is why it costs existing users nothing.
 */
const warnedWriteOnly = new WeakSet<object>();

function warnWriteOnlyMarker(processor: MarkerProcessor, node: unknown): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  if (!processor.snapshot || processor.hydrate) return;
  // Exactly what `recursiveUpdate` falls through to. If that can write the
  // node, no hook is needed and there is nothing to report.
  if (isReactiveNode(node) && 'set' in (node as object)) return;
  if (warnedWriteOnly.has(processor as object)) return;
  warnedWriteOnly.add(processor as object);
  console.warn(
    'SignalTree: a marker declares `snapshot` but no `hydrate`, and its node ' +
      'is not a writable signal. It will be captured by tree(), persistence(), ' +
      'devtools, audit and undo/redo — and every attempt to write it back is ' +
      'SILENTLY DISCARDED, so tree(tree()) loses its value. Add a `hydrate` ' +
      'hook, or mark it `transient: true` if it is genuinely not restorable. ' +
      '[ST2023]'
  );
}

function registerProcessor<T, R>(
  check: (value: unknown) => value is T,
  create: (
    marker: T,
    notifier: PathNotifier,
    path: string,
    context: MaterializationContext
  ) => R,
  suppressTimingWarning: boolean,
  hooks?: {
    snapshot?: (node: R) => unknown;
    hydrate?: (node: R, value: unknown, mode: HydrateMode) => void;
    transient?: true;
  }
): void {
  // Dev-mode validation: prevent invalid argument types with a clear error.
  if (typeof check !== 'function' || typeof create !== 'function') {
    throw new TypeError(
      "registerMarkerProcessor: both 'check' (type guard) and 'create' " +
        '(materializer) must be functions. Received check=' +
        typeof check +
        ', create=' +
        typeof create +
        '. ' +
        'See https://signaltree.io/docs (custom markers section) for usage.'
    );
  }

  // Prevent duplicate registration (same check function)
  const alreadyRegistered = MARKER_PROCESSORS.some((p) => p.check === check);
  if (alreadyRegistered) {
    return;
  }

  // Dev-mode warning when registering after at least one tree has been built.
  // Markers registered AFTER tree construction won't be processed in that tree
  // — they only take effect for trees built after registration. This is one of
  // the top "why isn't my custom marker working?" support questions. Built-in
  // markers route through registerBuiltinMarkerProcessor() and suppress it.
  if (
    !suppressTimingWarning &&
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    treesConstructedCount > 0
  ) {
    console.warn(
      '[SignalTree] registerMarkerProcessor() was called AFTER at least one ' +
        `signalTree() had already been constructed (${treesConstructedCount} trees so far). ` +
        'Existing trees will NOT pick up this marker — only trees built after ' +
        'this point will use it. To process your custom marker in existing ' +
        'trees, register it at module load time (before any signalTree() call), ' +
        'or rebuild the tree after registration.'
    );
  }

  if (!hooks?.snapshot && !hooks?.transient) warnUndeclaredMarker();

  MARKER_PROCESSORS.push({
    check,
    create: create as (
      marker: unknown,
      notifier: PathNotifier,
      path: string,
      context: MaterializationContext
    ) => unknown,
    snapshot: hooks?.snapshot as ((node: unknown) => unknown) | undefined,
    hydrate: hooks?.hydrate as
      | ((node: unknown, value: unknown, mode: HydrateMode) => void)
      | undefined,
  });
}

/**
 * @internal
 * Incremented every time a tree is materialized. Used to detect
 * post-construction registerMarkerProcessor() calls in dev mode.
 */
let treesConstructedCount = 0;

/**
 * @internal
 * Called by signalTree() to record that a tree has been built. Powers the
 * post-construction warning in registerMarkerProcessor.
 */
export function _recordTreeConstruction(): void {
  treesConstructedCount += 1;
}

// =============================================================================
// MATERIALIZATION
// =============================================================================

/**
 * Process all markers in a tree node.
 * Walks recursively, replacing markers with materialized signals.
 *
 * @param node - The tree node to process (usually tree.$)
 * @param notifier - PathNotifier for entity signals
 * @param path - Current path for nested processing
 */
export function materializeMarkers(
  node: unknown,
  notifier?: PathNotifier,
  path: string[] = [],
  context: MaterializationContext = createMaterializationContext()
): void {
  if (!isTraversableNode(node)) return;
  if (isReactiveNode(node)) return;

  // Handle NodeAccessors (functions with properties)
  const isAccessor = typeof node === 'function' && isNodeAccessor(node);
  if (typeof node === 'function' && !isAccessor) return;

  // Lazy-init notifier only if needed
  const getNotifier = (): PathNotifier => {
    if (!notifier) {
      notifier = getPathNotifier();
    }
    return notifier;
  };

  const keys = Object.keys(node as object);

  for (const key of keys) {
    const value = (node as Record<string, unknown>)[key];
    const currentPath = [...path, key];
    const pathString = currentPath.join('.');

    // Check each registered marker processor
    let processed = false;
    for (const processor of MARKER_PROCESSORS) {
      if (processor.check(value)) {
        try {
          const parentPositionId = (
            node as { __positionIds?: number[] }
          ).__positionIds?.[0];
          const materialized = processor.create(
            value,
            getNotifier(),
            pathString,
            context,
            parentPositionId
          );
          // Stamp the owning processor so lookup is an O(1) property read
          // rather than a scan over every registered marker. Non-enumerable so
          // it cannot reach a string-key walk; the `SignalTree:` prefix keeps
          // it out of the symbol walk too.
          if (isTraversableNode(materialized)) {
            Object.defineProperty(materialized, PROCESSOR_STAMP, {
              value: processor,
              enumerable: false,
              writable: false,
              configurable: true,
            });
          }
          // Inline guard, not one inside the callee: esbuild folds the full
          // expression at the CALL SITE and nothing else (docs/performance/
          // dropping-dev-code.md), so a guard hidden in the function body
          // ships its message string to production.
          if (typeof ngDevMode === 'undefined' || ngDevMode) {
            warnWriteOnlyMarker(processor, materialized);
          }
          (node as Record<string, unknown>)[key] = materialized;
          // A node accessor copies its store's properties, but its CALL path
          // closes over the original store. Writing only to the accessor
          // leaves that store holding the raw marker forever — which is why a
          // nested marker used to surface as a raw marker object from `tree()`
          // and why a merge write through a parent never reached it. Update
          // both so the two views agree.
          const backingStore = (node as Record<symbol, unknown>)[
            NODE_STORE_SYMBOL
          ] as Record<string, unknown> | undefined;
          if (backingStore && backingStore !== node) {
            backingStore[key] = materialized;
          }
          processed = true;
        } catch (err) {
          if (typeof ngDevMode === 'undefined' || ngDevMode) {
            console.error(
              `SignalTree: Failed to materialize marker at "${pathString}"`,
              err
            );
          }
        }
        break;
      }
    }

    // Recurse into unprocessed objects/accessors
    if (!processed && value != null) {
      if (isNodeAccessor(value)) {
        // NodeAccessor - recurse to find nested markers
        materializeMarkers(value, notifier, currentPath, context);
      } else if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isReactiveNode(value)
      ) {
        // Plain object - recurse
        materializeMarkers(value, notifier, currentPath, context);
      }
    }
  }
}
