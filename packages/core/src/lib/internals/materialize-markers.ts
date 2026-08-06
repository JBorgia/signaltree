import { isSignal } from '@angular/core';

import { getPathNotifier, PathNotifier } from '../path-notifier';
import { isNodeAccessor, isTraversableNode } from '../utils';

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
 *
 * @internal
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
 * - `rehydrate` — `deserialize`, SSR transfer, localStorage. A process boundary
 *                 was crossed, so nothing is in flight and transient state must
 *                 be normalised rather than believed.
 */
export type HydrateMode = 'merge' | 'restore' | 'rehydrate';

interface MarkerProcessor {
  check: (value: unknown) => boolean;
  create: (marker: unknown, notifier: PathNotifier, path: string) => unknown;
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
 * Stamped on every materialised node so `owns()` is O(1).
 *
 * A linear scan over the registry would put every marker author's `owns()` on
 * the hot path of every node materialisation, letting one slow third-party
 * predicate degrade trees that do not contain that marker. A stamp makes a
 * marker's cost payable only by trees that use it — the same boundary lazy
 * self-registration already draws for bundle size. Isolation is the point;
 * speed is incidental.
 *
 * The `SignalTree:` prefix is load-bearing: `unwrap`'s symbol loop skips that
 * prefix by identity, so a correctly-named stamp cannot leak into a snapshot.
 * Name it anything else and it lands in every persisted payload.
 */
const PROCESSOR_STAMP = Symbol.for('SignalTree:MarkerProcessor');

/** @internal Returns the processor that materialised this node, if any. */
export function getNodeProcessor(node: unknown): MarkerProcessor | undefined {
  if (!isTraversableNode(node)) return undefined;
  return (node as Record<symbol, MarkerProcessor | undefined>)[
    PROCESSOR_STAMP
  ];
}

/**
 * @internal Snapshot a materialised marker node, or `undefined` if the node is
 * not a marker or its processor declines to define a snapshot.
 */
export function snapshotMarkerNode(
  node: unknown
): { value: unknown } | undefined {
  const proc = getNodeProcessor(node);
  return proc?.snapshot ? { value: proc.snapshot(node) } : undefined;
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
  create: (marker: T, notifier: PathNotifier, path: string) => R,
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
  create: (marker: T, notifier: PathNotifier, path: string) => R,
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
  if (isSignal(node) && 'set' in (node as object)) return;
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
  create: (marker: T, notifier: PathNotifier, path: string) => R,
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
      path: string
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
  path: string[] = []
): void {
  if (!isTraversableNode(node)) return;
  if (isSignal(node)) return;

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
          const materialized = processor.create(
            value,
            getNotifier(),
            pathString
          );
          // Stamp the owning processor so `owns()` is an O(1) property read
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
        materializeMarkers(value, notifier, currentPath);
      } else if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !isSignal(value)
      ) {
        // Plain object - recurse
        materializeMarkers(value, notifier, currentPath);
      }
    }
  }
}

/**
 * Check if a tree has any markers that need processing.
 * Used for optimization - skip materialization if no markers present.
 */
export function hasMarkers(
  node: unknown,
  visited = new WeakSet<object>()
): boolean {
  if (!isTraversableNode(node)) return false;
  if (isSignal(node)) return false;

  // Prevent infinite loops
  if (typeof node === 'object' && visited.has(node as object)) return false;
  if (typeof node === 'object') visited.add(node as object);

  const keys = Object.keys(node as object);

  for (const key of keys) {
    const value = (node as Record<string, unknown>)[key];

    // Check all registered processors
    for (const processor of MARKER_PROCESSORS) {
      if (processor.check(value)) {
        return true;
      }
    }

    // Recurse into nested objects/accessors
    if (isTraversableNode(value)) {
      if (hasMarkers(value, visited)) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// TESTING UTILITIES
// =============================================================================

/**
 * Exposed for testing tree-shaking behavior.
 * DO NOT USE IN PRODUCTION CODE.
 *
 * @internal
 */
export const MARKER_PROCESSORS_FOR_TESTING = MARKER_PROCESSORS;
