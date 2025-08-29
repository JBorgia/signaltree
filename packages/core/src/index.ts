/**
 * SignalTree v1.1.6
 * A reactive state management library for Angular
 *
 * @packageDocumentation
 */

// ============================================
// CORE EXPORTS
// ============================================

export { signalTree } from './lib/signal-tree';

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // Core types
  SignalTree,
  DeepSignalify,
  RemoveSignalMethods,
  Primitive,
  BuiltInObject,

  // Configuration
  TreeConfig,
  TreePreset,

  // Enhancer system
  Enhancer,
  EnhancerMeta,
  EnhancerWithMeta,
  ChainResult,
  WithMethod,

  // Features
  Middleware,
  PerformanceMetrics,
  EntityHelpers,
  AsyncActionConfig,
  AsyncAction,
  TimeTravelEntry,
} from './lib/types';

// ============================================
// UTILITY EXPORTS
// ============================================

export {
  // Core utilities
  unwrap,
  equal,
  deepEqual,

  // Signal utilities
  terminalSignal,

  // Helper functions
  parsePath,
  composeEnhancers,
  isBuiltInObject,

  // Advanced utilities (for library extensions)
  createLazySignalTree,
} from './lib/utils';

// ============================================
// ENHANCER EXPORTS
// ============================================

export { createEnhancer, resolveEnhancerOrder } from './lib/enhancers';

export { ENHANCER_META } from './lib/types';

// ============================================
// CONSTANTS EXPORTS (for library extensions)
// ============================================

export { SIGNAL_TREE_CONSTANTS, SIGNAL_TREE_MESSAGES } from './lib/constants';
