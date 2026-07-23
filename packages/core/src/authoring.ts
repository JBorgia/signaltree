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

// Custom-marker extensibility — register a processor for your own marker type
// BEFORE any signalTree() is constructed.
export { registerMarkerProcessor } from './lib/internals/materialize-markers';

// Enhancer authoring — create enhancers with metadata, resolve dependency
// order, and compose several enhancers into one.
export { createEnhancer, resolveEnhancerOrder } from './enhancers/index';
export { composeEnhancers } from './lib/utils';

// Enhancer metadata symbol (third-party compatibility) + its shape.
export { ENHANCER_META } from './lib/types';
export type { EnhancerMeta } from './lib/types';

// Marker signal factories — the raw builders behind form()/asyncSource()/
// asyncQuery() markers, for authors building custom marker processors on top
// of the built-in signal shapes.
export { createFormSignal } from './lib/markers/form';
export { createAsyncSourceSignal } from './lib/markers/async-source';
export { createAsyncQuerySignal } from './lib/markers/async-query';
