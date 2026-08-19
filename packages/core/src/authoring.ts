/**
 * @signaltree/core/authoring
 *
 * Enhancer- and marker-author plumbing. Everything here exists so that
 * enhancers, custom markers, and tooling can hook into a tree's internals —
 * application code should not need any of it. Import from
 * '@signaltree/core/authoring' to keep the root barrel teachable end-to-end.
 */

// Ambient write-context channel — tag writes with UpdateMetadata so enhancers
// (guardrails, validation, time-travel/devtools replay) can observe write
// intent without changing Angular's WritableSignal API.
export { withWriteContext, getActiveWriteContext } from './lib/write-context';

// Leaf signal interception — observe every leaf write (devtools, time-travel,
// validation).
export { interceptLeafSignals } from './lib/internals/intercept-leaf-signals';

// Global path-change notifier — the seam devtools/persistence enhancers
// subscribe to.
export { getPathNotifier } from './lib/path-notifier';
// `PathNotifier.subscribe(pattern, handler)` is the seam this entry point
// exists for, and the handler's type was not exportable.
export type {
  PathNotifierHandler,
  PathNotifierInterceptor,
} from './lib/path-notifier';

// Custom-marker extensibility — register a processor for your own marker type
// BEFORE any signalTree() is constructed.
export { registerMarkerProcessor } from './lib/internals/materialize-markers';

// Hydration decisions — observe when a marker DECLINES a rehydrate payload
// (its loader owns that data) or NORMALISES one (a LOADING status cannot
// survive a process boundary). Not warnings: both are correct. This is the seam
// a devtools panel or a dev-mode summary reads. DEV-ONLY — the call sites are
// ngDevMode-guarded inline, so nothing fires in a production build.
export { onHydrateDecision } from './lib/internals/materialize-markers';
// HydrateMode and HydrateReason ARE part of this surface, not internals:
// HydrateDecisionEvent.mode and .reason are typed with them, and a marker
// processor's `hydrate` hook receives a HydrateMode. Without these a listener
// could receive an event it cannot write a typed handler for, and a marker
// author could not name their own hook's third parameter.
export type {
  HydrateDecision,
  HydrateDecisionEvent,
  HydrateMode,
  HydrateReason,
} from './lib/internals/materialize-markers';

// Enhancer authoring — create enhancers with metadata and resolve dependency
// order. Composition is `tree.with(a).with(b)`; `composeEnhancers` was removed
// in 15.0 because its type erased every enhancer's additions.
export { createEnhancer, resolveEnhancerOrder } from './enhancers/index';

// Enhancer metadata symbol (third-party compatibility) + its shape.
export { ENHANCER_META } from './lib/types';
export type { EnhancerMeta } from './lib/types';

// Marker signal factories — the raw builders behind asyncSource()/asyncQuery()
// markers, for authors building custom marker processors on top of the built-in
// signal shapes.
export { createAsyncSourceSignal } from './lib/markers/async-source';
export { createAsyncQuerySignal } from './lib/markers/async-query';

// Global error observation — every error the library CATCHES, in one place.
// Not a handler: it cannot swallow, retry or transform, because making every
// marker's error path depend on a listener is a far larger promise than "tell
// me when something failed". Local handling is unchanged; this is additive.
export { onTreeError } from './lib/internals/error-reporter';
export type {
  TreeErrorEvent,
  TreeErrorSource,
} from './lib/internals/error-reporter';

// ─────────────────────────────────────────────────────────────────────────────
// Moved here from the root barrel in 14.0.0.
//
// The invariant that exposed it: "everything usable is demoed, so everything
// exported should appear in the demo app." It did not — 26 of 59 root runtime
// exports were absent. The absentees were not a gap in the demo; they were all
// of one kind. The READER allowlists exist to TYPE `asReadonly`, the marker
// symbols are brands for writing a marker processor, and the guards answer
// questions you only ask while walking a tree or building tooling. None of it
// is app code, and all of it sat on the entry point an app imports.
//
// This entry point already existed for exactly this distinction. Nothing was
// deleted and nothing changed shape — the imports move.
// ─────────────────────────────────────────────────────────────────────────────

// Reader-key allowlists — the `Pick` sources behind the readonly views.
export {
  ENTITY_READERS,
  ENTITY_LOADER_READERS,
  STORED_READERS,
  ASYNC_SOURCE_READERS,
  ASYNC_QUERY_READERS,
} from './lib/readonly';

// Marker brand symbols — for recognising a marker you did not create.
export { ASYNC_SOURCE_MARKER } from './lib/markers/async-source.contract';
export { ASYNC_QUERY_MARKER } from './lib/markers/async-query.contract';

// Marker type guards — you ask "is this a marker?" when writing a processor.
export { isStoredMarker } from './lib/markers/stored.contract';
export { isDerivedMarker } from './lib/markers/derived';
export { isAsyncSourceMarker } from './lib/markers/async-source.contract';
export { isAsyncQueryMarker } from './lib/markers/async-query.contract';

// Structural guards and path plumbing — tree-walking tools.
// `isTraversableNode` in particular is what the repo's own lint rule points
// contributors at instead of hand-rolling an "object or function" check.
//
// `isBuiltInObject` and `parsePath` were removed from this surface in the 15.0
// major. They are declared in `@signaltree/shared`, which is `"private": true`
// and bundled at build time — publishing them made a private implementation
// package's internals part of core's public contract, so its utilities could
// not be changed without a breaking change to core. Both remain in use inside
// core; only the public re-export is gone. No compatibility shim: a major is
// exactly when an accidental export should stop existing.
export { isTraversableNode, isNodeAccessor } from './lib/internals/node-shape';
export { isAnySignal } from './lib/utils';
export { isSignalTree } from './lib/types';

// Constants and diagnostic message text.
export { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './lib/constants';
