/**
 * @fileoverview SignalTree - Reactive State Management for Angular
 *
 * A comprehensive reactive state management library built on Angular signals that provides
 * hierarchical state trees with performance optimizations, debugging tools, and developer experience features.
 *
 * ## Key Concepts
 *
 * **Basic vs Enhanced Mode:**
 * - Basic: Core functionality with warnings for advanced features
 * - Enhanced: Full feature set when `enablePerformanceFeatures: true`
 *
 * **Memory Management - `cleanup()` vs `clearCache()`:**
 *
 * ### cleanup()
 * - **Smart optimization**: Only clears cache when size exceeds `maxCacheSize` limit
 * - **Memory tracking**: Updates memory usage metrics when available
 * - **Preserves frequently used cache**: Maintains performance while controlling memory
 * - **Use case**: Routine maintenance, component lifecycle cleanup
 * - **When**: Call periodically or on component destroy
 *
 * ### clearCache()
 * - **Immediate action**: Always clears ALL cached computed values regardless of size
 * - **Complete reset**: Forces fresh computation on next access
 * - **No memory tracking**: Focused only on cache invalidation
 * - **Use case**: Cache invalidation after data source changes or memory pressure
 * - **When**: After bulk data imports, known stale cache situations, or debugging
 *
 * @example
 * ```typescript
 * const tree = signalTree(data, {
 *   enablePerformanceFeatures: true,
 *   useMemoization: true,
 *   maxCacheSize: 50
 * });
 *
 * // Routine maintenance - conditional cleanup
 * ngOnDestroy() {
 *   tree.optimize(); // Only clears if cache > 50 items
 * }
 *
 * // Force invalidation - immediate cleanup
 * onDataImport() {
 *   tree.clearCache(); // Clears ALL cached computations
 *   tree.update(() => ({ data: newImportedData }));
 * }
 * ```
 *
 * ## Performance Features
 *
 * - **Batching**: Combine multiple updates into single render cycle
 * - **Memoization**: Cache expensive computed values with intelligent invalidation
 * - **Time Travel**: Undo/redo functionality for debugging and user features
 * - **DevTools**: Redux DevTools integration for state visualization
 * - **Metrics**: Performance tracking and optimization insights
 * - **Middleware**: Extensible plugin system for custom functionality
 *
 * @author SignalTree Team
 * @version 1.0.0
 */

import {
  Signal,
  WritableSignal,
  isSignal,
  signal,
  computed,
  effect,
  inject,
  DestroyRef,
  Directive,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  ElementRef,
  Renderer2,
  HostListener,
  OnInit,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import isEqual from 'lodash/isEqual';
import { Observable } from 'rxjs';

// ============================================
// CORE TYPES AND INTERFACES
// ============================================

// Define primitive types for better type constraints
type Primitive = string | number | boolean | null | undefined | bigint | symbol;

// Helper type to check if a type is a primitive
type IsPrimitive<T> = T extends Primitive ? true : false;

// Deep signalify type with proper generic constraints
export type DeepSignalify<T> = IsPrimitive<T> extends true
  ? WritableSignal<T>
  : T extends (infer U)[]
  ? WritableSignal<U[]>
  : T extends Record<string, unknown>
  ? T extends Signal<infer TSignal>
    ? WritableSignal<TSignal>
    : { [K in keyof T]: DeepSignalify<T[K]> }
  : WritableSignal<T>;

// Helper type for unwrapping signal states back to original types
export type UnwrapSignalState<T> = T extends WritableSignal<infer U>
  ? U
  : T extends Record<string, unknown>
  ? { [K in keyof T]: UnwrapSignalState<T[K]> }
  : T;

export type SimpleSignalValue = string | number | boolean;

export type SignalValue<T> = T extends ArrayLike<SimpleSignalValue>
  ? SimpleSignalValue[]
  : SimpleSignalValue;

/**
 * Comprehensive configuration options for SignalTree creation and behavior.
 *
 * This interface controls all aspects of tree functionality, from basic features
 * to advanced performance optimizations. Configure only what you need to minimize
 * bundle size and runtime overhead.
 *
 * @example
 * ```typescript
 * // Minimal production config
 * const minimalConfig: TreeConfig = {
 *   enablePerformanceFeatures: true,
 *   batchUpdates: true
 * };
 *
 * // Full development config
 * const devConfig: TreeConfig = {
 *   enablePerformanceFeatures: true,
 *   batchUpdates: true,
 *   useMemoization: true,
 *   trackPerformance: true,
 *   enableTimeTravel: true,
 *   enableDevTools: true,
 *   treeName: 'MyAppState',
 *   maxCacheSize: 150,
 *   useShallowComparison: true
 * };
 *
 * // Performance-focused config
 * const perfConfig: TreeConfig = {
 *   enablePerformanceFeatures: true,
 *   batchUpdates: true,
 *   useMemoization: true,
 *   maxCacheSize: 200,
 *   useShallowComparison: true,
 *   trackPerformance: false // Skip metrics in production
 * };
 * ```
 */
export interface TreeConfig {
  /**
   * Master switch for all advanced functionality.
   *
   * When `false` (default), the tree provides basic state management with
   * warnings for advanced features. When `true`, enables middleware system
   * and unlocks other performance options.
   *
   * **Impact**: Core vs Enhanced mode
   * **Default**: `false`
   * **Bundle Size**: Significant - enables all advanced code paths
   *
   * @example
   * ```typescript
   * // Basic mode - minimal functionality
   * const basic = signalTree(state, { enablePerformanceFeatures: false });
   * basic.batch(() => {}); // ⚠️ Warning + fallback to update()
   *
   * // Enhanced mode - full functionality
   * const enhanced = signalTree(state, { enablePerformanceFeatures: true });
   * enhanced.batch(() => {}); // ✅ Actual batching (if batchUpdates: true)
   * ```
   */
  enablePerformanceFeatures?: boolean;

  /**
   * Enables batching of multiple state updates into single change detection cycles.
   *
   * When enabled, calls to `batch()` will defer updates until the microtask queue,
   * reducing render cycles and improving performance for bulk operations.
   *
   * **Requires**: `enablePerformanceFeatures: true`
   * **Impact**: Reduces unnecessary re-renders during bulk updates
   * **Default**: `false`
   * **Bundle Size**: Small
   *
   * @example
   * ```typescript
   * const tree = signalTree(state, {
   *   enablePerformanceFeatures: true,
   *   batchUpdates: true
   * });
   *
   * // Without batching - 3 render cycles
   * tree.state.loading.set(true);
   * tree.state.error.set(null);
   * tree.state.data.set(newData);
   *
   * // With batching - 1 render cycle
   * tree.batchUpdate(state => ({
   *   loading: false,
   *   error: null,
   *   data: newData
   * }));
   * ```
   */
  batchUpdates?: boolean;

  /**
   * Enables intelligent caching of computed values for performance optimization.
   *
   * When enabled, calls to `computed()` with cache keys will store results
   * and return cached values until dependencies change. Includes automatic
   * cache size management.
   *
   * **Requires**: `enablePerformanceFeatures: true`
   * **Impact**: Prevents redundant expensive computations
   * **Default**: `false`
   * **Bundle Size**: Medium - includes cache management logic
   *
   * @example
   * ```typescript
   * const tree = signalTree(data, {
   *   enablePerformanceFeatures: true,
   *   useMemoization: true,
   *   maxCacheSize: 100
   * });
   *
   * // Expensive computation cached by key
   * const expensiveCalc = tree.memoize(
   *   state => heavyProcessing(state.largeDataset),
   *   'heavy-processing'
   * );
   *
   * expensiveCalc(); // Computed and cached
   * expensiveCalc(); // Served from cache (fast!)
   *
   * // Cache automatically invalidated when dependencies change
   * tree.state.largeDataset.set(newData);
   * expensiveCalc(); // Re-computed with new data
   * ```
   */
  useMemoization?: boolean;

  /**
   * Enables collection of detailed performance metrics and timing data.
   *
   * When enabled, tracks update counts, computation times, cache hit ratios,
   * memory usage, and other performance indicators accessible via `getMetrics()`.
   *
   * **Requires**: `enablePerformanceFeatures: true`
   * **Impact**: Enables performance monitoring and optimization
   * **Default**: `false`
   * **Bundle Size**: Small
   * **Runtime Cost**: Minimal - simple counters and timing
   *
   * @example
   * ```typescript
   * const tree = signalTree(state, {
   *   enablePerformanceFeatures: true,
   *   trackPerformance: true
   * });
   *
   * // Perform operations
   * tree.update(state => ({ count: state.count + 1 }));
   * tree.memoize(state => state.items.length, 'count')();
   *
   * // Analyze performance
   * const metrics = tree.getMetrics();
   * console.log(`
   *   Updates: ${metrics.updates}
   *   Average update time: ${metrics.averageUpdateTime}ms
   *   Cache hit ratio: ${metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)}
   * `);
   *
   * // Production monitoring
   * if (metrics.averageUpdateTime > 16) { // 60fps threshold
   *   console.warn('Performance degradation detected');
   *   tree.cleanup(); // Attempt optimization
   * }
   * ```
   */
  trackPerformance?: boolean;

  /**
   * Uses faster shallow equality comparison instead of deep equality.
   *
   * When enabled, improves performance for primitive values and simple objects
   * at the cost of potentially missing deep changes in complex nested structures.
   *
   * **Impact**: Faster comparisons, but may miss deep nested changes
   * **Default**: `false` (uses deep equality)
   * **Bundle Size**: None - just changes comparison function
   * **Trade-off**: Performance vs change detection accuracy
   *
   * @example
   * ```typescript
   * const tree = signalTree(state, { useShallowComparison: true });
   *
   * // ✅ These changes are detected (shallow)
   * tree.state.count.set(5);
   * tree.state.user.set({ name: 'Alice', age: 30 });
   *
   * // ⚠️ This change might be missed (deep)
   * const user = tree.state.user();
   * user.preferences = { theme: 'dark' }; // Mutates existing object
   * tree.state.user.set(user); // Shallow comparison sees same reference
   *
   * // ✅ Correct way with shallow comparison
   * tree.state.user.set({
   *   ...tree.state.user(),
   *   preferences: { theme: 'dark' }
   * });
   * ```
   */
  useShallowComparison?: boolean;

  /**
   * Maximum number of cached computed values before triggering cleanup.
   *
   * When `useMemoization` is enabled, this controls how many cached computations
   * to retain. The `cleanup()` method removes excess entries when this limit is exceeded.
   *
   * **Requires**: `useMemoization: true`
   * **Impact**: Memory usage vs cache effectiveness trade-off
   * **Default**: `100`
   * **Recommended**: 50-200 depending on application complexity
   *
   * @example
   * ```typescript
   * const tree = signalTree(state, {
   *   enablePerformanceFeatures: true,
   *   useMemoization: true,
   *   maxCacheSize: 50 // Smaller cache for memory-constrained environments
   * });
   *
   * // Create many cached computations
   * for (let i = 0; i < 100; i++) {
   *   tree.computed(state => filterData(state, i), `filter-${i}`);
   * }
   *
   * // Automatic cleanup when exceeded
   * tree.cleanup(); // Clears cache if > 50 entries
   *
   * // Manual cleanup anytime
   * tree.clearCache(); // Clears all cached entries
   * ```
   */
  maxCacheSize?: number;

  /**
   * Enables time travel debugging with undo/redo capabilities.
   *
   * When enabled, maintains a history of state changes that can be navigated
   * using `undo()`, `redo()`, and `getHistory()`. Useful for debugging and
   * providing user-facing undo functionality.
   *
   * **Requires**: `enablePerformanceFeatures: true`
   * **Impact**: Enables debugging and undo/redo user features
   * **Default**: `false`
   * **Bundle Size**: Medium - includes history management
   * **Memory Cost**: Stores state snapshots (can be significant)
   *
   * @example
   * ```typescript
   * const tree = signalTree(gameState, {
   *   enablePerformanceFeatures: true,
   *   enableTimeTravel: true
   * });
   *
   * // Make changes
   * tree.update(state => ({ score: 100 }));
   * tree.update(state => ({ level: 2 }));
   *
   * // Navigate history
   * tree.undo(); // Back to score: 100, level: 1
   * tree.redo(); // Forward to score: 100, level: 2
   *
   * // Inspect history
   * const history = tree.getHistory();
   * console.log('State changes:', history.length);
   *
   * // Implement user-facing undo
   * const canUndo = computed(() => tree.getHistory().length > 1);
   * undoButton.disabled = !canUndo();
   * ```
   */
  enableTimeTravel?: boolean;

  /**
   * Enables integration with Redux DevTools browser extension.
   *
   * When enabled, automatically connects to Redux DevTools and sends state
   * changes for visualization, time travel debugging, and state inspection.
   *
   * **Requires**: `enablePerformanceFeatures: true`
   * **Impact**: Browser-based debugging and state visualization
   * **Default**: `false`
   * **Bundle Size**: Small
   * **Runtime Cost**: Minimal in production (DevTools not present)
   *
   * @example
   * ```typescript
   * const tree = signalTree(appState, {
   *   enablePerformanceFeatures: true,
   *   enableDevTools: true,
   *   treeName: 'AppState' // Shows in DevTools
   * });
   *
   * // All state changes appear in Redux DevTools:
   * tree.update(state => ({ user: newUser })); // Action: UPDATE
   * tree.batch(state => ({ loading: false })); // Action: BATCH_UPDATE
   *
   * // DevTools features available:
   * // - State inspection and diffs
   * // - Time travel debugging
   * // - Action replay
   * // - State import/export
   * // - Performance monitoring
   * ```
   */
  enableDevTools?: boolean;

  /**
   * Human-readable name for the tree used in debugging and DevTools.
   *
   * Appears in console logs, DevTools labels, and error messages to help
   * identify different trees in complex applications.
   *
   * **Impact**: Better debugging experience
   * **Default**: `'SignalTree'`
   * **Bundle Size**: None
   *
   * @example
   * ```typescript
   * // Multiple trees with descriptive names
   * const userTree = signalTree(userState, {
   *   enableDevTools: true,
   *   treeName: 'UserManagement'
   * });
   *
   * const cartTree = signalTree(cartState, {
   *   enableDevTools: true,
   *   treeName: 'ShoppingCart'
   * });
   *
   * // Console logs will show:
   * // 🚀 Enhanced Signal Tree: "UserManagement" with performance features enabled
   * // 🚀 Enhanced Signal Tree: "ShoppingCart" with performance features enabled
   *
   * // DevTools will list both trees separately for easy identification
   * ```
   */
  treeName?: string;
}

/**
 * Comprehensive performance metrics tracked by SignalTree instances.
 *
 * Provides detailed insights into tree usage patterns, performance characteristics,
 * and optimization opportunities. Only populated when `trackPerformance: true`.
 *
 * @example
 * ```typescript
 * const tree = signalTree(state, {
 *   enablePerformanceFeatures: true,
 *   trackPerformance: true,
 *   useMemoization: true,
 *   enableTimeTravel: true
 * });
 *
 * // Perform operations
 * tree.update(state => ({ count: state.count + 1 }));
 * const computation = tree.computed(state => expensiveCalc(state), 'calc');
 * computation(); // Cache miss
 * computation(); // Cache hit
 *
 * // Analyze performance
 * const metrics = tree.getMetrics();
 * console.log(`Performance Report:
 *   Updates: ${metrics.updates}
 *   Computations: ${metrics.computations}
 *   Cache Efficiency: ${(metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) * 100).toFixed(1)}%
 *   Avg Update Time: ${metrics.averageUpdateTime.toFixed(2)}ms
 *   Memory Usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB
 *   History Entries: ${metrics.timeTravelEntries}
 * `);
 *
 * // Performance monitoring
 * if (metrics.averageUpdateTime > 16) { // 60fps = 16.67ms budget
 *   console.warn('Updates slower than 60fps target');
 * }
 *
 * if (metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses) < 0.7) {
 *   console.info('Cache hit ratio below 70% - consider review cache keys');
 * }
 * ```
 */
export interface PerformanceMetrics {
  /**
   * Total number of state updates performed on this tree.
   *
   * Incremented each time `update()` or `batch()` modifies the tree state.
   * Useful for understanding update frequency and identifying hot paths.
   *
   * @example
   * ```typescript
   * tree.update(state => ({ count: 1 })); // updates: 1
   * tree.batch(state => ({ count: 2, name: 'test' })); // updates: 2
   *
   * console.log(tree.getMetrics().updates); // 2
   * ```
   */
  updates: number;

  /**
   * Total number of computed value calculations performed.
   *
   * Incremented each time a computed function actually executes (cache misses).
   * Does not include cache hits. High numbers relative to cache hits may
   * indicate inefficient cache key usage.
   *
   * @example
   * ```typescript
   * const calc = tree.computed(state => expensiveOperation(state), 'calc');
   * calc(); // computations: 1 (cache miss)
   * calc(); // computations: 1 (cache hit, not incremented)
   *
   * tree.state.data.set(newData); // Invalidates cache
   * calc(); // computations: 2 (cache miss after invalidation)
   * ```
   */
  computations: number;

  /**
   * Number of times cached computed values were served instead of recalculated.
   *
   * Higher cache hit ratios indicate effective memoization. Low ratios may
   * suggest cache keys are too specific or dependencies change too frequently.
   *
   * **Target**: > 70% for effective caching
   *
   * @example
   * ```typescript
   * const filtered = tree.computed(state =>
   *   state.items.filter(item => item.active), 'active-items'
   * );
   *
   * filtered(); // cacheHits: 0, cacheMisses: 1
   * filtered(); // cacheHits: 1, cacheMisses: 1
   * filtered(); // cacheHits: 2, cacheMisses: 1
   *
   * const hitRatio = metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses);
   * console.log(`Cache efficiency: ${(hitRatio * 100).toFixed(1)}%`);
   * ```
   */
  cacheHits: number;

  /**
   * Number of times computed values had to be recalculated due to cache misses.
   *
   * Occurs on first computation, after cache invalidation, or when cache
   * keys are not found. High numbers relative to hits may indicate caching issues.
   *
   * @example
   * ```typescript
   * // Each unique cache key starts with a miss
   * tree.computed(state => calc1(state), 'calc1')(); // cacheMisses: 1
   * tree.computed(state => calc2(state), 'calc2')(); // cacheMisses: 2
   *
   * // Cache invalidation causes misses
   * tree.clearCache();
   * tree.computed(state => calc1(state), 'calc1')(); // cacheMisses: 3
   * ```
   */
  cacheMisses: number;

  /**
   * Rolling average time spent in update operations, measured in milliseconds.
   *
   * Tracks the performance cost of state updates including middleware execution.
   * Useful for identifying performance regressions and optimization opportunities.
   *
   * **Target**: < 16ms for 60fps applications
   * **Warning**: > 33ms may cause noticeable lag
   *
   * @example
   * ```typescript
   * // Monitor update performance
   * const metrics = tree.getMetrics();
   *
   * if (metrics.averageUpdateTime > 16) {
   *   console.warn(`Updates averaging ${metrics.averageUpdateTime.toFixed(2)}ms - slower than 60fps target`);
   *
   *   // Potential optimizations:
   *   tree.cleanup(); // Clear excess cached computations
   *   tree.removePlugin('expensive-middleware'); // Remove costly middleware
   * }
   *
   * // Trend analysis
   * setInterval(() => {
   *   const current = tree.getMetrics().averageUpdateTime;
   *   if (current > previousTime * 1.5) {
   *     console.warn('Update performance degrading');
   *   }
   *   previousTime = current;
   * }, 5000);
   * ```
   */
  averageUpdateTime: number;

  /**
   * Current JavaScript heap memory usage in bytes (when available).
   *
   * Only populated in environments that expose `performance.memory` (Chrome).
   * Updated during `cleanup()` operations to track memory optimization effectiveness.
   *
   * **Availability**: Chrome/Chromium browsers only
   * **Unit**: Bytes
   *
   * @example
   * ```typescript
   * const beforeCleanup = tree.getMetrics().memoryUsage;
   * tree.cleanup();
   * const afterCleanup = tree.getMetrics().memoryUsage;
   *
   * if (beforeCleanup && afterCleanup) {
   *   const saved = beforeCleanup - afterCleanup;
   *   console.log(`Cleanup freed ${(saved / 1024 / 1024).toFixed(1)}MB`);
   * }
   *
   * // Memory monitoring
   * const memoryMB = (metrics.memoryUsage || 0) / 1024 / 1024;
   * if (memoryMB > 100) { // 100MB threshold
   *   console.warn(`High memory usage: ${memoryMB.toFixed(1)}MB`);
   *   tree.clearCache(); // Aggressive cleanup
   * }
   * ```
   */
  memoryUsage?: number;

  /**
   * Current number of entries in the time travel history stack.
   *
   * Only populated when `enableTimeTravel: true`. Tracks the memory cost
   * of time travel functionality and helps determine when to call `resetHistory()`.
   *
   * **Availability**: Only when time travel is enabled
   * **Memory Impact**: Each entry stores a complete state snapshot
   *
   * @example
   * ```typescript
   * const tree = signalTree(state, {
   *   enablePerformanceFeatures: true,
   *   enableTimeTravel: true
   * });
   *
   * // Make several changes
   * tree.update(state => ({ count: 1 })); // timeTravelEntries: 2 (initial + update)
   * tree.update(state => ({ count: 2 })); // timeTravelEntries: 3
   * tree.update(state => ({ count: 3 })); // timeTravelEntries: 4
   *
   * // Monitor history growth
   * const metrics = tree.getMetrics();
   * if (metrics.timeTravelEntries > 100) {
   *   console.warn('History growing large, consider resetHistory()');
   *   tree.resetHistory(); // Free memory
   * }
   *
   * // Estimate memory usage
   * const avgStateSize = JSON.stringify(tree.unwrap()).length;
   * const historyMemoryKB = (metrics.timeTravelEntries * avgStateSize) / 1024;
   * console.log(`Estimated history memory: ${historyMemoryKB.toFixed(1)}KB`);
   * ```
   */
  timeTravelEntries?: number;
}

/**
 * Entry in the time travel history
 */
export interface TimeTravelEntry<T> {
  state: T;
  timestamp: number;
  action: string;
  payload?: unknown;
}

/**
 * Middleware interface for intercepting tree operations
 */
export interface Middleware<T> {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
}

/**
 * Entity helpers interface for CRUD operations
 */
export interface EntityHelpers<E extends { id: string | number }> {
  add: (entity: E) => void;
  update: (id: string | number, updates: Partial<E>) => void;
  remove: (id: string | number) => void;
  upsert: (entity: E) => void;
  findById: (id: string | number) => Signal<E | undefined>;
  findBy: (predicate: (entity: E) => boolean) => Signal<E[]>;
  selectIds: () => Signal<Array<string | number>>;
  selectAll: () => Signal<E[]>;
  selectTotal: () => Signal<number>;
}

/**
 * Configuration for async actions
 */
export interface AsyncActionConfig<T, TResult> {
  loadingKey?: string;
  errorKey?: string;
  onSuccess?: (result: TResult, tree: SignalTree<T>) => void;
  onError?: (error: unknown, tree: SignalTree<T>) => void;
  onFinally?: (tree: SignalTree<T>) => void;
}

/**
 * Dev tools integration interface
 */
export interface DevToolsInterface<T> {
  connect: (treeName: string) => void;
  disconnect: () => void;
  send: (action: string, state: T) => void;
  isConnected: () => boolean;
}

/**
 * Main signal tree type that preserves hierarchical structure
 */
type SignalState<T> = T extends Record<string, unknown>
  ? DeepSignalify<T>
  : never;

/**
 * Main signal tree type with comprehensive state management capabilities.
 *
 * SignalTree provides a reactive state container built on Angular signals with
 * hierarchical structure preservation, performance optimizations, and developer tools.
 *
 * @template T - The state object type, must extend Record<string, unknown>
 *
 * @example
 * ```typescript
 * interface AppState {
 *   user: { name: string; email: string };
 *   settings: { theme: 'light' | 'dark' };
 *   counter: number;
 * }
 *
 * const tree = signalTree<AppState>({
 *   user: { name: 'John', email: 'john@example.com' },
 *   settings: { theme: 'light' },
 *   counter: 0
 * });
 *
 * // Access nested signals directly
 * console.log(tree.state.user.name()); // 'John'
 * tree.state.counter.set(5);
 * ```
 */
export type SignalTree<T> = {
  /**
   * The reactive state object with deep signal conversion.
   * Each property becomes a WritableSignal, preserving the original structure.
   *
   * @example
   * ```typescript
   * const tree = signalTree({ count: 0, user: { name: 'Alice' } });
   *
   * // Direct signal access
   * tree.state.count.set(10);
   * tree.state.user.name.set('Bob');
   *
   * // Reactive reads
   * const count = tree.state.count(); // 10
   * const userName = tree.state.user.name(); // 'Bob'
   * ```
   */
  state: SignalState<T>;

  /**
   * Shorthand alias for `state`. Provides the same functionality as `state`
   * but with a more concise syntax for frequent access.
   *
   * @example
   * ```typescript
   * const tree = signalTree({ items: [], loading: false });
   *
   * // Both are equivalent
   * tree.state.loading.set(true);
   * tree.$.loading.set(true);
   *
   * // Useful in templates and computed values
   * const isReady = computed(() => !tree.$.loading() && tree.$.items().length > 0);
   * ```
   */
  $: SignalState<T>;
} & {
  // ==================== CORE API ====================

  /**
   * Extracts the current plain object value from the signal tree.
   * Recursively unwraps all signals to return the original object structure.
   *
   * @returns The current state as a plain object (non-reactive)
   *
   * @example
   * ```typescript
   * const tree = signalTree({
   *   user: { name: 'Alice', age: 30 },
   *   preferences: { theme: 'dark' }
   * });
   *
   * tree.state.user.age.set(31);
   *
   * const currentState = tree.unwrap();
   * console.log(currentState);
   * // { user: { name: 'Alice', age: 31 }, preferences: { theme: 'dark' } }
   *
   * // Note: This is a snapshot, not reactive
   * tree.state.user.age.set(32);
   * console.log(currentState.user.age); // Still 31
   * ```
   */
  unwrap(): T;

  /**
   * Updates the tree state using a partial update function.
   * The updater receives the current unwrapped state and should return
   * partial updates to apply.
   *
   * @param updater - Function that receives current state and returns partial updates
   *
   * @example
   * ```typescript
   * const tree = signalTree({
   *   counter: 0,
   *   user: { name: 'Alice', score: 100 }
   * });
   *
   * // Simple update
   * tree.update(state => ({ counter: state.counter + 1 }));
   *
   * // Nested update
   * tree.update(state => ({
   *   user: { ...state.user, score: state.user.score + 10 }
   * }));
   *
   * // Conditional update
   * tree.update(state =>
   *   state.counter < 10
   *     ? { counter: state.counter + 1 }
   *     : { counter: 0 }
   * );
   * ```
   */
  update(updater: (current: T) => Partial<T>): void;

  // ==================== PERFORMANCE FEATURES ====================

  /**
   * Batches multiple state updates into a single change detection cycle.
   * When performance features are enabled and batching is configured, this
   * optimizes rendering by deferring updates until the microtask queue.
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true` and `batchUpdates: true`
   *
   * @param updater - Function that receives current state and returns partial updates
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { items: [], loading: false, error: null },
   *   { enablePerformanceFeatures: true, batchUpdates: true }
   * );
   *
   * // Without batching - triggers 3 change detection cycles
   * tree.state.loading.set(true);
   * tree.state.error.set(null);
   * tree.state.items.set([1, 2, 3]);
   *
   * // With batching - triggers 1 change detection cycle
   * tree.batchUpdate(state => ({
   *   loading: false,
   *   error: null,
   *   items: [...state.items, 4, 5, 6]
   * }));
   * ```
   */
  batchUpdate(updater: (current: T) => Partial<T>): void;

  /**
   * Creates a memoized computed value with optional cache key for performance.
   * When memoization is enabled, computed values are cached and reused until
   * their dependencies change.
   *
   * **Availability**: Always available, but only memoized when
   * `enablePerformanceFeatures: true` and `useMemoization: true`
   *
   * @param fn - Function that computes the derived value from tree state
   * @param cacheKey - Optional cache key for memoization (auto-generated if not provided)
   * @returns Angular Signal with the computed value
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { items: [1, 2, 3, 4, 5], filter: 'even' },
   *   { enablePerformanceFeatures: true, useMemoization: true }
   * );
   *
   * // Memoized computed with cache key
   * const filteredItems = tree.memoize(
   *   state => state.items.filter(x =>
   *     state.filter === 'even' ? x % 2 === 0 : x % 2 === 1
   *   ),
   *   'filtered-items'
   * );
   *
   * // Expensive computation that benefits from memoization
   * const expensiveCalculation = tree.memoize(
   *   state => state.items.reduce((sum, item, index) => {
   *     return sum + Math.pow(item, index + 1);
   *   }, 0),
   *   'power-sum'
   * );
   *
   * console.log(filteredItems()); // [2, 4] - computed once
   * console.log(filteredItems()); // [2, 4] - served from cache
   * ```
   */
  memoize<R>(fn: (tree: T) => R, cacheKey?: string): Signal<R>;

  /**
   * Creates a side effect that runs when the tree state changes.
   * Requires Angular injection context for proper lifecycle management.
   *
   * @param fn - Effect function that receives the current tree state
   *
   * @example
   * ```typescript
   * const tree = signalTree({ user: { name: 'Alice' }, loggedIn: false });
   *
   * // Inside Angular component or service
   * tree.effect(state => {
   *   if (state.loggedIn) {
   *     console.log(`Welcome ${state.user.name}!`);
   *   }
   * });
   *
   * // Later...
   * tree.update(state => ({ loggedIn: true }));
   * // Console: "Welcome Alice!"
   * ```
   */
  effect(fn: (tree: T) => void): void;

  /**
   * Subscribes to tree state changes with manual unsubscribe control.
   * Prefers Angular injection context for automatic cleanup, but provides
   * fallback for test environments.
   *
   * @param fn - Callback function that receives the current tree state
   * @returns Unsubscribe function to stop listening to changes
   *
   * @example
   * ```typescript
   * const tree = signalTree({ count: 0, history: [] as number[] });
   *
   * // Subscribe to changes
   * const unsubscribe = tree.subscribe(state => {
   *   console.log(`Count changed to: ${state.count}`);
   *
   *   // Could trigger side effects
   *   if (state.count > 10) {
   *     notifyUser('Count is getting high!');
   *   }
   * });
   *
   * tree.state.count.set(5); // Console: "Count changed to: 5"
   * tree.state.count.set(12); // Console: "Count changed to: 12" + notification
   *
   * // Clean up when done
   * unsubscribe();
   * ```
   */
  subscribe(fn: (tree: T) => void): () => void;

  // ==================== OPTIMIZATION METHODS ====================

  /**
   * Performs intelligent optimization of cached data and memory management.
   * This method performs conditional cleanup based on cache size limits and
   * updates memory usage metrics when available.
   *
   * **Key Differences from invalidateCache()**:
   * - **Conditional**: Only clears cache when it exceeds `maxCacheSize` limit
   * - **Memory tracking**: Updates memory usage metrics in performance object
   * - **Smart optimization**: Preserves frequently used cached items when possible
   * - **Performance-aware**: Designed for routine maintenance, not full reset
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true`
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { data: [] },
   *   {
   *     enablePerformanceFeatures: true,
   *     useMemoization: true,
   *     maxCacheSize: 50,
   *     trackPerformance: true
   *   }
   * );
   *
   * // Create many computed values
   * for (let i = 0; i < 100; i++) {
   *   tree.memoize(state => state.data.filter(x => x > i), `filter-${i}`);
   * }
   *
   * // Routine optimization - only clears if cache > 50 items
   * tree.optimize();
   *
   * const metrics = tree.getMetrics();
   * console.log(`Memory usage: ${metrics.memoryUsage} bytes`);
   *
   * // Use in component lifecycle
   * ngOnDestroy() {
   *   this.tree.optimize(); // Clean up before component destruction
   * }
   * ```
   */
  optimize(): void;

  /**
   * Immediately clears all cached computed values regardless of cache size.
   * This method performs aggressive cleanup by removing all memoized computations,
   * forcing fresh calculations on next access.
   *
   * **Key Differences from optimize()**:
   * - **Immediate**: Always clears cache regardless of size limits
   * - **Complete**: Removes ALL cached items, not just excess ones
   * - **No memory tracking**: Doesn't update memory metrics
   * - **Reset-focused**: Designed for full cache invalidation scenarios
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true` and `useMemoization: true`
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { dataset: [], filters: { category: '', price: 0 } },
   *   { enablePerformanceFeatures: true, useMemoization: true }
   * );
   *
   * // Create cached computations
   * const filteredData = tree.memoize(
   *   state => state.dataset.filter(item =>
   *     item.category.includes(state.filters.category) &&
   *     item.price >= state.filters.price
   *   ),
   *   'filtered-data'
   * );
   *
   * filteredData(); // Computed and cached
   * filteredData(); // Served from cache
   *
   * // Complete cache invalidation when data source changes
   * tree.clearCache();
   *
   * filteredData(); // Computed fresh (cache miss)
   *
   * // Use cases:
   * // - After bulk data imports
   * // - When cache might be stale
   * // - Memory pressure situations
   * // - Before critical performance measurements
   * ```
   */
  clearCache(): void;

  /**
   * Retrieves comprehensive performance metrics and statistics.
   * Provides insights into tree usage patterns, cache efficiency, and timing data.
   *
   * **Availability**: Always available, but only tracks meaningful data when
   * `enablePerformanceFeatures: true` and `trackPerformance: true`
   *
   * @returns PerformanceMetrics object with detailed statistics
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { users: [], posts: [], comments: [] },
   *   {
   *     enablePerformanceFeatures: true,
   *     trackPerformance: true,
   *     useMemoization: true,
   *     enableTimeTravel: true
   *   }
   * );
   *
   * // Perform various operations
   * tree.update(state => ({ users: [...state.users, newUser] }));
   * tree.computed(state => state.users.length, 'user-count')();
   * tree.computed(state => state.users.length, 'user-count')(); // Cache hit
   *
   * const metrics = tree.getMetrics();
   * console.log(`
   *   Updates: ${metrics.updates}
   *   Computations: ${metrics.computations}
   *   Cache hit ratio: ${metrics.cacheHits / (metrics.cacheHits + metrics.cacheMisses)}
   *   Average update time: ${metrics.averageUpdateTime}ms
   *   Memory usage: ${metrics.memoryUsage} bytes
   *   Time travel entries: ${metrics.timeTravelEntries}
   * `);
   *
   * // Performance monitoring in production
   * if (metrics.averageUpdateTime > 16) { // 60fps threshold
   *   console.warn('Updates are slower than 60fps target');
   *   tree.cleanup(); // Attempt optimization
   * }
   * ```
   */
  getMetrics(): PerformanceMetrics;

  // ==================== TAP SYSTEM ====================

  /**
   * Adds a tap to observe and optionally intercept tree operations.
   * Taps can observe, modify, or prevent state changes through
   * before/after hooks, providing a lightweight way to extend functionality.
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true`
   *
   * @param middleware - Middleware object with id and optional before/after hooks
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { count: 0, history: [] },
   *   { enablePerformanceFeatures: true }
   * );
   *
   * // Validation tap
   * tree.addTap({
   *   id: 'validator',
   *   before: (action, payload, state) => {
   *     if (action === 'UPDATE' && payload.count < 0) {
   *       console.warn('Negative count prevented');
   *       return false; // Prevent the update
   *     }
   *     return true;
   *   }
   * });
   *
   * // Audit trail tap
   * tree.addTap({
   *   id: 'audit',
   *   after: (action, payload, oldState, newState) => {
   *     auditLog.push({
   *       timestamp: Date.now(),
   *       action,
   *       changes: getDiff(oldState, newState)
   *     });
   *   }
   * });
   *
   * // Built-in taps
   * tree.addTap(loggingMiddleware('MyTree'));
   * tree.addTap(performanceMiddleware());
   * ```
   */
  addTap(middleware: Middleware<T>): void;

  /**
   * Removes a registered tap by its ID.
   * Useful for dynamic tap management and cleanup.
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true`
   *
   * @param id - The unique identifier of the tap to remove
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { data: [] },
   *   { enablePerformanceFeatures: true }
   * );
   *
   * // Add conditional tap
   * if (isDevelopment) {
   *   tree.addTap(loggingMiddleware('DevTree'));
   * }
   *
   * // Later, in production build or when no longer needed
   * tree.removeTap('logging');
   *
   * // Remove validation in specific contexts
   * if (bulkOperationMode) {
   *   tree.removeTap('validator'); // Skip validation for performance
   *   performBulkUpdates();
   *   tree.addTap(validationMiddleware(validateState)); // Re-add when done
   * }
   * ```
   */
  removeTap(id: string): void;

  // ==================== DATA REPOSITORY ====================

  /**
   * Creates a specialized repository for managing collections of entities.
   * Provides database-like CRUD operations, queries, and reactive selections
   * for array-based state properties.
   *
   * **Availability**: Always available (lightweight utility)
   *
   * @param entityKey - The key in the state object that contains the entity array
   * @returns EntityHelpers object with CRUD and query methods
   *
   * @example
   * ```typescript
   * interface User {
   *   id: string;
   *   name: string;
   *   email: string;
   *   role: 'admin' | 'user';
   * }
   *
   * const tree = signalTree({
   *   users: [] as User[],
   *   selectedUserId: null as string | null
   * });
   *
   * const userCrud = tree.asCrud<User>('users');
   *
   * // CRUD operations
   * userCrud.add({ id: '1', name: 'Alice', email: 'alice@example.com', role: 'user' });
   * userCrud.update('1', { role: 'admin' });
   * userCrud.upsert({ id: '2', name: 'Bob', email: 'bob@example.com', role: 'user' });
   * userCrud.remove('1');
   *
   * // Reactive queries
   * const adminUsers = userCrud.findBy(user => user.role === 'admin');
   * const userById = userCrud.findById('2');
   * const allUsers = userCrud.selectAll();
   * const userCount = userCrud.selectTotal();
   *
   * // Use in components
   * const isAdmin = computed(() => {
   *   const user = userById();
   *   return user?.role === 'admin';
   * });
   * ```
   */
  asCrud<E extends { id: string | number }>(
    entityKey: keyof T
  ): EntityHelpers<E>;

  // ==================== ASYNC OPERATIONS ====================

  /**
   * Creates async action factories with built-in loading/error state management.
   * Automatically handles loading states, error handling, and success callbacks
   * while integrating with the tree's reactive state.
   *
   * **Availability**: Always available (lightweight utility)
   *
   * @param operation - Async function that performs the operation
   * @param config - Configuration for loading/error state keys and callbacks
   * @returns Configured async function that manages state automatically
   *
   * @example
   * ```typescript
   * interface AppState {
   *   users: User[];
   *   loading: { users: boolean; posts: boolean };
   *   errors: { users: string | null; posts: string | null };
   * }
   *
   * const tree = signalTree<AppState>({
   *   users: [],
   *   loading: { users: false, posts: false },
   *   errors: { users: null, posts: null }
   * });
   *
   * // Create async action
   * const loadUsers = tree.asyncAction(
   *   async (filters: { role?: string }) => {
   *     const response = await fetch(`/api/users?role=${filters.role || ''}`);
   *     if (!response.ok) throw new Error('Failed to load users');
   *     return response.json() as User[];
   *   },
   *   {
   *     loadingKey: 'loading.users',
   *     errorKey: 'errors.users',
   *     onSuccess: (users, tree) => {
   *       tree.update(state => ({ users }));
   *     },
   *     onError: (error, tree) => {
   *       console.error('Failed to load users:', error);
   *     }
   *   }
   * );
   *
   * // Usage
   * try {
   *   await loadUsers({ role: 'admin' });
   *   console.log('Users loaded successfully');
   * } catch (error) {
   *   console.error('Load failed:', error);
   * }
   *
   * // State is automatically managed:
   * // - loading.users set to true when starting
   * // - loading.users set to false when complete
   * // - errors.users cleared on start, set on error
   * // - users updated on success
   * ```
   */
  asyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult>
  ): (input: TInput) => Promise<TResult>;

  // ==================== TIME TRAVEL ====================

  /**
   * Reverts the tree to the previous state in history.
   * Maintains a history stack and redo capability for development and debugging.
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true` and `enableTimeTravel: true`
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { count: 0, name: 'Initial' },
   *   { enablePerformanceFeatures: true, enableTimeTravel: true }
   * );
   *
   * console.log(tree.unwrap()); // { count: 0, name: 'Initial' }
   *
   * tree.update(state => ({ count: 1 }));
   * tree.update(state => ({ name: 'Updated' }));
   * console.log(tree.unwrap()); // { count: 1, name: 'Updated' }
   *
   * tree.undo();
   * console.log(tree.unwrap()); // { count: 1, name: 'Initial' }
   *
   * tree.undo();
   * console.log(tree.unwrap()); // { count: 0, name: 'Initial' }
   * ```
   */
  undo(): void;

  /**
   * Re-applies a previously undone state change.
   * Works in conjunction with undo() to provide full time travel capabilities.
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true` and `enableTimeTravel: true`
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { value: 'A' },
   *   { enablePerformanceFeatures: true, enableTimeTravel: true }
   * );
   *
   * tree.update(() => ({ value: 'B' }));
   * tree.update(() => ({ value: 'C' }));
   *
   * tree.undo(); // Back to 'B'
   * tree.undo(); // Back to 'A'
   *
   * tree.redo(); // Forward to 'B'
   * tree.redo(); // Forward to 'C'
   *
   * console.log(tree.unwrap().value); // 'C'
   * ```
   */
  redo(): void;

  /**
   * Retrieves the complete history of state changes.
   * Useful for debugging, audit trails, and understanding state evolution.
   *
   * **Availability**: Always available, but only populated when
   * `enablePerformanceFeatures: true` and `enableTimeTravel: true`
   *
   * @returns Array of TimeTravelEntry objects with state snapshots and metadata
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { counter: 0 },
   *   { enablePerformanceFeatures: true, enableTimeTravel: true }
   * );
   *
   * tree.update(state => ({ counter: 1 }));
   * tree.update(state => ({ counter: 2 }));
   *
   * const history = tree.getHistory();
   * history.forEach((entry, index) => {
   *   console.log(`${index}: ${entry.action} at ${new Date(entry.timestamp)}`);
   *   console.log('State:', entry.state);
   * });
   *
   * // Output:
   * // 0: INITIAL at [timestamp]
   * // State: { counter: 0 }
   * // 1: UPDATE at [timestamp]
   * // State: { counter: 1 }
   * // 2: UPDATE at [timestamp]
   * // State: { counter: 2 }
   * ```
   */
  getHistory(): TimeTravelEntry<T>[];

  /**
   * Clears all time travel history and resets the undo/redo stacks.
   * Useful for memory management or when starting a new logical session.
   *
   * **Availability**: Always available, but only functional when
   * `enablePerformanceFeatures: true` and `enableTimeTravel: true`
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { data: [] },
   *   { enablePerformanceFeatures: true, enableTimeTravel: true }
   * );
   *
   * // Perform many operations
   * for (let i = 0; i < 100; i++) {
   *   tree.update(state => ({ data: [...state.data, i] }));
   * }
   *
   * console.log(tree.getHistory().length); // 101 (initial + 100 updates)
   *
   * // Clear history to free memory
   * tree.resetHistory();
   *
   * console.log(tree.getHistory().length); // 0
   * // Note: Current state is preserved, only history is cleared
   * ```
   */
  resetHistory(): void;

  // ==================== DEV TOOLS ====================

  /**
   * Internal dev tools interface for Redux DevTools integration.
   * Automatically connects to browser DevTools when available and enabled.
   *
   * **Availability**: Only present when `enableDevTools: true`
   *
   * @example
   * ```typescript
   * const tree = signalTree(
   *   { count: 0 },
   *   {
   *     enablePerformanceFeatures: true,
   *     enableDevTools: true,
   *     treeName: 'CounterTree'
   *   }
   * );
   *
   * // DevTools automatically connects and tracks state changes
   * tree.update(state => ({ count: state.count + 1 }));
   *
   * // View in Redux DevTools browser extension:
   * // - State snapshots
   * // - Action history
   * // - Time travel debugging
   * // - State diff visualization
   *
   * // Manual DevTools interaction (advanced)
   * if (tree.__devTools?.isConnected()) {
   *   tree.__devTools.send('CUSTOM_ACTION', tree.unwrap());
   * }
   * ```
   */
  __devTools?: DevToolsInterface<T>;
};

// ============================================
// EQUALITY FUNCTIONS
// ============================================

export function equal<T>(a: T, b: T): boolean {
  return Array.isArray(a) && Array.isArray(b) ? isEqual(a, b) : a === b;
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (
        (a as Record<string, unknown>)[key] !==
        (b as Record<string, unknown>)[key]
      )
        return false;
    }
    return true;
  }

  return false;
}

// ============================================
// GLOBAL STATE - UPDATED WITH PER-TREE METRICS
// ============================================

const computedCache = new WeakMap<object, Map<string, Signal<unknown>>>();
const middlewareMap = new WeakMap<object, Array<Middleware<unknown>>>();
const timeTravelMap = new WeakMap<object, Array<TimeTravelEntry<unknown>>>();
const redoStack = new WeakMap<object, Array<TimeTravelEntry<unknown>>>();
const treeMetrics = new WeakMap<object, PerformanceMetrics>(); // ADDED THIS
const testSubscribers = new WeakMap<object, Array<(tree: unknown) => void>>(); // For test environment

// ============================================
// BATCHING SYSTEM
// ============================================

let updateQueue: Array<{ fn: () => void; startTime: number }> = [];
let isUpdating = false;

function batchUpdates(fn: () => void): void {
  const startTime = performance.now();
  updateQueue.push({ fn, startTime });

  if (!isUpdating) {
    isUpdating = true;
    queueMicrotask(() => {
      const queue = updateQueue.slice();
      updateQueue = [];
      isUpdating = false;

      queue.forEach(({ fn }) => fn());
    });
  }
}

// ============================================
// TIME TRAVEL MIDDLEWARE
// ============================================

function createTimeTravelMiddleware<T>(
  treeRef: object,
  maxEntries = 50
): Middleware<T> {
  return {
    id: 'timetravel',
    before: (action, payload, state) => {
      // Initialize history with the initial state if it doesn't exist
      if (
        !timeTravelMap.has(treeRef) &&
        action !== 'UNDO' &&
        action !== 'REDO'
      ) {
        const initialHistory: TimeTravelEntry<T>[] = [
          {
            state: structuredClone(state),
            timestamp: Date.now(),
            action: 'INITIAL',
            payload: undefined,
          },
        ];
        timeTravelMap.set(
          treeRef,
          initialHistory as TimeTravelEntry<unknown>[]
        );
      }
      return true;
    },
    after: (action, payload, state, newState) => {
      if (action !== 'UNDO' && action !== 'REDO') {
        let history =
          (timeTravelMap.get(treeRef) as TimeTravelEntry<T>[]) || [];

        history.push({
          state: structuredClone(newState),
          timestamp: Date.now(),
          action,
          payload: payload ? structuredClone(payload) : undefined,
        });

        if (history.length > maxEntries) {
          history = history.slice(-maxEntries);
        }

        timeTravelMap.set(treeRef, history as TimeTravelEntry<unknown>[]);
        redoStack.set(treeRef, [] as TimeTravelEntry<unknown>[]);
      }
    },
  };
}

// ============================================
// DEV TOOLS INTEGRATION
// ============================================

function createDevToolsInterface<T>(treeName: string): DevToolsInterface<T> {
  let devToolsConnection: {
    disconnect: () => void;
    send: (action: string, state: T) => void;
  } | null = null;

  return {
    connect: (name: string) => {
      if (
        typeof window !== 'undefined' &&
        '__REDUX_DEVTOOLS_EXTENSION__' in window
      ) {
        const devToolsExt = (window as unknown as Record<string, unknown>)[
          '__REDUX_DEVTOOLS_EXTENSION__'
        ] as {
          connect: (config: unknown) => {
            disconnect: () => void;
            send: (action: string, state: T) => void;
          };
        };

        devToolsConnection = devToolsExt.connect({
          name: name || treeName,
          features: {
            pause: true,
            lock: true,
            persist: true,
            export: true,
            import: 'custom',
            jump: true,
            skip: true,
            reorder: true,
            dispatch: true,
            test: true,
          },
        });
      }
    },

    disconnect: () => {
      if (devToolsConnection) {
        devToolsConnection.disconnect();
        devToolsConnection = null;
      }
    },

    send: (action: string, state: T) => {
      if (devToolsConnection) {
        devToolsConnection.send(action, state);
      }
    },

    isConnected: () => !!devToolsConnection,
  };
}

// ============================================
// ENTITY HELPERS
// ============================================

function createEntityHelpers<T, E extends { id: string | number }>(
  tree: SignalTree<T>,
  entityKey: keyof T
): EntityHelpers<E> {
  // Type assertion needed here due to generic constraints
  const entitySignal = (tree.state as Record<string, unknown>)[
    entityKey as string
  ] as WritableSignal<E[]>;

  return {
    add: (entity: E) => {
      entitySignal.update((entities) => [...entities, entity]);
    },

    update: (id: string | number, updates: Partial<E>) => {
      entitySignal.update((entities) =>
        entities.map((entity) =>
          entity.id === id ? { ...entity, ...updates } : entity
        )
      );
    },

    remove: (id: string | number) => {
      entitySignal.update((entities) =>
        entities.filter((entity) => entity.id !== id)
      );
    },

    upsert: (entity: E) => {
      entitySignal.update((entities) => {
        const index = entities.findIndex((e) => e.id === entity.id);
        if (index >= 0) {
          return entities.map((e, i) => (i === index ? entity : e));
        } else {
          return [...entities, entity];
        }
      });
    },

    findById: (id: string | number) =>
      computed(() => entitySignal().find((entity) => entity.id === id)),

    findBy: (predicate: (entity: E) => boolean) =>
      computed(() => entitySignal().filter(predicate)),

    selectIds: () => computed(() => entitySignal().map((entity) => entity.id)),

    selectAll: () => entitySignal,

    selectTotal: () => computed(() => entitySignal().length),
  };
}

// ============================================
// ASYNC ACTION FACTORY
// ============================================

function createAsyncActionFactory<T>(tree: SignalTree<T>) {
  return function createAsyncAction<TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult> = {}
  ) {
    return async (input: TInput): Promise<TResult> => {
      const { loadingKey, errorKey, onSuccess, onError, onFinally } = config;

      // Helper function to set nested value
      const setNestedValue = (path: string, value: unknown) => {
        const keys = path.split('.');
        if (keys.length === 1) {
          tree.update((state) => ({ ...state, [path]: value } as Partial<T>));
        } else {
          tree.update((state) => {
            const newState = { ...state } as Record<string, unknown>;
            let current = newState;
            for (let i = 0; i < keys.length - 1; i++) {
              if (
                current[keys[i]] &&
                typeof current[keys[i]] === 'object' &&
                !Array.isArray(current[keys[i]])
              ) {
                // Only spread if it's a plain object
                if (
                  Object.prototype.toString.call(current[keys[i]]) ===
                    '[object Object]' &&
                  typeof current[keys[i]] === 'object' &&
                  current[keys[i]] !== null
                ) {
                  // Ensure the value is an object before spreading
                  current[keys[i]] = {
                    ...(current[keys[i]] as Record<string, unknown>),
                  };
                }
                current = current[keys[i]] as Record<string, unknown>;
              }
            }
            current[keys[keys.length - 1]] = value;
            return newState as Partial<T>;
          });
        }
      };

      // Set loading state
      if (loadingKey) {
        setNestedValue(loadingKey, true);
      }

      // Clear error state
      if (errorKey) {
        setNestedValue(errorKey, null);
      }

      try {
        const result = await operation(input);
        onSuccess?.(result, tree);
        return result;
      } catch (error) {
        if (errorKey) {
          setNestedValue(errorKey, error);
        }
        onError?.(error, tree);
        throw error;
      } finally {
        if (loadingKey) {
          setNestedValue(loadingKey, false);
        }
        onFinally?.(tree);
      }
    };
  };
}

// ============================================
// CORE TREE ENHANCEMENT
// ============================================

// Improved unwrap and update with better typing
function enhanceTreeBasic<T extends Record<string, unknown>>(
  tree: SignalTree<T>
): SignalTree<T> {
  tree.unwrap = (): T => {
    // Recursively unwrap with proper typing
    const unwrapObject = <O extends Record<string, unknown>>(
      obj: DeepSignalify<O>
    ): O => {
      const result = {} as Record<string, unknown>;

      for (const key in obj) {
        const value = obj[key];

        if (isSignal(value)) {
          result[key] = (value as Signal<unknown>)();
        } else if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          // Nested signal state
          result[key] = unwrapObject(
            value as DeepSignalify<Record<string, unknown>>
          );
        } else {
          result[key] = value;
        }
      }

      return result as O;
    };

    return unwrapObject(tree.state as DeepSignalify<T>);
  };

  tree.update = (updater: (current: T) => Partial<T>) => {
    const currentValue = tree.unwrap();
    const partialObj = updater(currentValue);

    // Recursively update with better typing
    const updateObject = <O extends Record<string, unknown>>(
      target: DeepSignalify<O>,
      updates: Partial<O>
    ): void => {
      for (const key in updates) {
        if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;

        const updateValue = updates[key];
        const currentSignalOrState = (target as Record<string, unknown>)[key];

        if (isSignal(currentSignalOrState)) {
          // Direct signal update
          (currentSignalOrState as WritableSignal<unknown>).set(updateValue);
        } else if (
          typeof updateValue === 'object' &&
          updateValue !== null &&
          !Array.isArray(updateValue) &&
          typeof currentSignalOrState === 'object' &&
          currentSignalOrState !== null
        ) {
          // Nested object - recurse
          updateObject(
            currentSignalOrState as DeepSignalify<Record<string, unknown>>,
            updateValue as Partial<Record<string, unknown>>
          );
        }
      }
    };

    updateObject(tree.state as DeepSignalify<T>, partialObj);
  };

  // Add all required methods with bypass logic (will be overridden if enhanced)
  tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
    console.warn(
      '⚠️ batchUpdate() called but batching is not enabled.',
      '\nTo enable batch updates, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, batchUpdates: true })'
    );
    // Fallback: Just call update directly
    tree.update(updater);
  };

  tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
    console.warn(
      '⚠️ memoize() called but memoization is not enabled.',
      '\nTo enable memoized computations, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, useMemoization: true })'
    );
    // Fallback: Use simple Angular computed without memoization
    void cacheKey; // Mark as intentionally unused
    return computed(() => fn(tree.unwrap()));
  };

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree.unwrap()));
    } catch (error) {
      // Fallback for test environments without injection context
      console.warn('Effect requires Angular injection context', error);
    }
  };

  tree.subscribe = (fn: (tree: T) => void): (() => void) => {
    try {
      const destroyRef = inject(DestroyRef);
      let isDestroyed = false;

      const effectRef = effect(() => {
        if (!isDestroyed) {
          fn(tree.unwrap());
        }
      });

      const unsubscribe = () => {
        isDestroyed = true;
        effectRef.destroy();
      };

      destroyRef.onDestroy(unsubscribe);
      return unsubscribe;
    } catch (error) {
      // Fallback for test environment - call once immediately
      console.warn('Subscribe requires Angular injection context', error);
      fn(tree.unwrap());
      return () => {
        // No-op unsubscribe
      };
    }
  };

  tree.optimize = () => {
    console.warn(
      '⚠️ optimize() called but performance optimization is not enabled.',
      '\nTo enable optimization features, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true })'
    );
  };

  tree.clearCache = () => {
    console.warn(
      '⚠️ clearCache() called but caching is not enabled.',
      '\nTo enable caching, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, useMemoization: true })'
    );
  };

  tree.getMetrics = (): PerformanceMetrics => {
    console.warn(
      '⚠️ getMetrics() called but performance tracking is not enabled.',
      '\nTo enable performance tracking, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, trackPerformance: true })'
    );
    // Return minimal metrics when tracking not enabled
    return {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
  };

  tree.addTap = (middleware: Middleware<T>) => {
    console.warn(
      '⚠️ addTap() called but performance features are not enabled.',
      '\nTo enable tap support, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true })'
    );
    void middleware; // Mark as intentionally unused
  };

  tree.removeTap = (id: string) => {
    console.warn(
      '⚠️ removeTap() called but performance features are not enabled.',
      '\nTo enable tap support, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true })'
    );
    void id; // Mark as intentionally unused
  };

  tree.asCrud = <E extends { id: string | number }>(
    entityKey: keyof T
  ): EntityHelpers<E> => {
    // Always provide entity helpers - they're lightweight
    return createEntityHelpers<T, E>(tree, entityKey);
  };

  tree.asyncAction = <TInput, TResult>(
    operation: (input: TInput) => Promise<TResult>,
    config: AsyncActionConfig<T, TResult> = {}
  ) => {
    // Always provide async actions - they're lightweight
    return createAsyncActionFactory(tree)(operation, config);
  };

  tree.undo = () => {
    console.warn(
      '⚠️ undo() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
  };

  tree.redo = () => {
    console.warn(
      '⚠️ redo() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
  };

  tree.getHistory = (): TimeTravelEntry<T>[] => {
    console.warn(
      '⚠️ getHistory() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
    return [];
  };

  tree.resetHistory = () => {
    console.warn(
      '⚠️ resetHistory() called but time travel is not enabled.',
      '\nTo enable time travel, create an enhanced tree:',
      '\nsignalTree(data, { enablePerformanceFeatures: true, enableTimeTravel: true })'
    );
  };

  return tree;
}

function enhanceTree<T>(
  tree: SignalTree<T>,
  config: TreeConfig = {}
): SignalTree<T> {
  const {
    enablePerformanceFeatures = false,
    batchUpdates: useBatching = false,
    useMemoization = false,
    trackPerformance = false,
    maxCacheSize = 100,
    enableTimeTravel = false,
    enableDevTools = false,
    treeName = 'SignalTree',
  } = config;

  if (!enablePerformanceFeatures) {
    return tree; // Use bypass methods from enhanceTreeBasic
  }

  console.log(
    `🚀 Enhanced Signal Tree: "${treeName}" with performance features enabled`
  );

  middlewareMap.set(tree, []);

  // INITIALIZE PER-TREE METRICS
  if (trackPerformance) {
    const initialMetrics: PerformanceMetrics = {
      updates: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageUpdateTime: 0,
    };
    treeMetrics.set(tree, initialMetrics);
  }

  if (enableTimeTravel) {
    const timeTravelMiddleware = createTimeTravelMiddleware<T>(tree);
    const middlewares = middlewareMap.get(tree) || [];
    middlewares.push(timeTravelMiddleware as Middleware<unknown>);
    middlewareMap.set(tree, middlewares);
  }

  if (enableDevTools) {
    const devTools = createDevToolsInterface<T>(treeName);
    devTools.connect(treeName);
    tree.__devTools = devTools;

    const devToolsMiddleware: Middleware<T> = {
      id: 'devtools',
      after: (action, payload, state, newState) => {
        devTools.send(action, newState);
      },
    };

    const middlewares = middlewareMap.get(tree) || [];
    middlewares.push(devToolsMiddleware as Middleware<unknown>);
    middlewareMap.set(tree, middlewares);
  }

  const originalUpdate = tree.update;
  tree.update = (updater: (current: T) => Partial<T>) => {
    const action = 'UPDATE';
    const currentState = tree.unwrap();

    // Calculate the update result to pass to middleware
    const updateResult = updater(currentState);

    const middlewares = middlewareMap.get(tree) || [];
    for (const middleware of middlewares) {
      if (
        middleware.before &&
        !middleware.before(action, updateResult, currentState) // Pass the actual update result
      ) {
        return; // Middleware blocked the update
      }
    }

    const updateFn = () => {
      const startTime = performance.now();
      originalUpdate.call(tree, updater);
      const endTime = performance.now();

      // Track metrics per tree
      const metrics = treeMetrics.get(tree);
      if (metrics) {
        metrics.updates++;
        const updateTime = endTime - startTime;
        metrics.averageUpdateTime =
          (metrics.averageUpdateTime * (metrics.updates - 1) + updateTime) /
          metrics.updates;
      }

      const newState = tree.unwrap();
      for (const middleware of middlewares) {
        if (middleware.after) {
          middleware.after(action, updateResult, currentState, newState);
        }
      }

      // Notify test subscribers if in test environment
      const subscribers = testSubscribers.get(tree);
      if (subscribers) {
        subscribers.forEach((subscriber) => {
          try {
            subscriber(newState);
          } catch (error) {
            // Ignore subscriber errors in test environment
            void error; // Mark as intentionally unused
          }
        });
      }
    };

    if (useBatching) {
      batchUpdates(updateFn);
    } else {
      updateFn();
    }
  };

  if (useBatching) {
    tree.batchUpdate = (updater: (current: T) => Partial<T>) => {
      batchUpdates(() => tree.update(updater));
    };
  }

  if (useMemoization) {
    tree.memoize = <R>(
      fn: (tree: T) => R,
      cacheKey = Math.random().toString()
    ): Signal<R> => {
      let cache = computedCache.get(tree);
      if (!cache) {
        cache = new Map();
        computedCache.set(tree, cache);
      }

      const metrics = treeMetrics.get(tree);

      if (cache.has(cacheKey)) {
        if (metrics) metrics.cacheHits++;
        const cachedSignal = cache.get(cacheKey);
        if (cachedSignal) {
          return cachedSignal as Signal<R>;
        }
      }

      if (metrics) metrics.cacheMisses++;
      const computedSignal = computed(() => {
        if (metrics) metrics.computations++;
        return fn(tree.unwrap());
      });

      cache.set(cacheKey, computedSignal);
      return computedSignal;
    };
  }

  tree.effect = (fn: (tree: T) => void) => {
    try {
      effect(() => fn(tree.unwrap()));
    } catch (error) {
      // Fallback for test environments without injection context
      console.warn('Effect requires Angular injection context', error);
    }
  };

  tree.subscribe = (fn: (tree: T) => void): (() => void) => {
    try {
      const destroyRef = inject(DestroyRef);
      let isDestroyed = false;

      const effectRef = effect(() => {
        if (!isDestroyed) {
          fn(tree.unwrap());
        }
      });

      const unsubscribe = () => {
        isDestroyed = true;
        effectRef.destroy();
      };

      destroyRef.onDestroy(unsubscribe);
      return unsubscribe;
    } catch (error) {
      // Fallback for test environment - use subscriber tracking
      console.warn('Subscribe requires Angular injection context', error);
      const subscribers = testSubscribers.get(tree) || [];
      subscribers.push(fn as (tree: unknown) => void);
      testSubscribers.set(tree, subscribers);

      // Call immediately for initial subscription
      fn(tree.unwrap());

      // Return unsubscribe function
      return () => {
        const currentSubscribers = testSubscribers.get(tree) || [];
        const index = currentSubscribers.indexOf(fn as (tree: unknown) => void);
        if (index > -1) {
          currentSubscribers.splice(index, 1);
          testSubscribers.set(tree, currentSubscribers);
        }
      };
    }
  };

  tree.optimize = () => {
    const cache = computedCache.get(tree);
    if (cache && cache.size > maxCacheSize) {
      cache.clear();
    }

    if ('memory' in performance) {
      const metrics = treeMetrics.get(tree);
      if (metrics) {
        metrics.memoryUsage = (
          performance as { memory: { usedJSHeapSize: number } }
        ).memory.usedJSHeapSize;
      }
    }
  };

  tree.clearCache = () => {
    const cache = computedCache.get(tree);
    if (cache) {
      cache.clear();
    }
  };

  if (trackPerformance) {
    tree.getMetrics = () => {
      const metrics = treeMetrics.get(tree);
      const timeTravelEntries = timeTravelMap.get(tree)?.length || 0;
      return {
        ...(metrics || {
          updates: 0,
          computations: 0,
          cacheHits: 0,
          cacheMisses: 0,
          averageUpdateTime: 0,
        }),
        timeTravelEntries,
      };
    };
  }

  // Override methods when features are enabled

  // Always override addTap and removeTap when enhanced
  tree.addTap = (middleware: Middleware<T>) => {
    const middlewares = middlewareMap.get(tree) || [];
    middlewares.push(middleware as Middleware<unknown>);
    middlewareMap.set(tree, middlewares);
  };

  tree.removeTap = (id: string) => {
    const middlewares = middlewareMap.get(tree) || [];
    const filtered = middlewares.filter((m) => m.id !== id);
    middlewareMap.set(tree, filtered);
  };

  // Always override these when enhanced since repository helpers are always useful
  tree.asCrud = <E extends { id: string | number }>(entityKey: keyof T) => {
    return createEntityHelpers<T, E>(tree, entityKey);
  };

  tree.asyncAction = createAsyncActionFactory(tree);

  if (enableTimeTravel) {
    tree.undo = () => {
      const history = (timeTravelMap.get(tree) as TimeTravelEntry<T>[]) || [];
      if (history.length > 1) {
        const currentEntry = history.pop();
        if (!currentEntry) return;

        const redoHistory = (redoStack.get(tree) as TimeTravelEntry<T>[]) || [];
        redoHistory.push(currentEntry);
        redoStack.set(tree, redoHistory as TimeTravelEntry<unknown>[]);

        const previousEntry = history[history.length - 1];
        if (previousEntry) {
          const action = 'UNDO';
          const currentState = tree.unwrap();

          const middlewares = middlewareMap.get(tree) || [];
          for (const middleware of middlewares) {
            if (
              middleware.id !== 'timetravel' &&
              middleware.before &&
              !middleware.before(action, previousEntry.state, currentState)
            ) {
              return;
            }
          }

          // Update tree directly without triggering middleware
          originalUpdate.call(tree, () => previousEntry.state as Partial<T>);

          const newState = tree.unwrap();
          for (const middleware of middlewares) {
            if (middleware.id !== 'timetravel' && middleware.after) {
              middleware.after(
                action,
                previousEntry.state,
                currentState,
                newState
              );
            }
          }
        }
      }
    };

    tree.redo = () => {
      const redoHistory = (redoStack.get(tree) as TimeTravelEntry<T>[]) || [];
      if (redoHistory.length > 0) {
        const redoEntry = redoHistory.pop();
        if (!redoEntry) return;

        redoStack.set(tree, redoHistory as TimeTravelEntry<unknown>[]);

        const action = 'REDO';
        const currentState = tree.unwrap();

        const middlewares = middlewareMap.get(tree) || [];
        for (const middleware of middlewares) {
          if (
            middleware.id !== 'timetravel' &&
            middleware.before &&
            !middleware.before(action, redoEntry.state, currentState)
          ) {
            return;
          }
        }

        // Update tree directly without triggering middleware
        originalUpdate.call(tree, () => redoEntry.state as Partial<T>);

        // Add the state back to history for future undo operations
        const history = (timeTravelMap.get(tree) as TimeTravelEntry<T>[]) || [];
        history.push(redoEntry);
        timeTravelMap.set(tree, history as TimeTravelEntry<unknown>[]);

        const newState = tree.unwrap();
        for (const middleware of middlewares) {
          if (middleware.id !== 'timetravel' && middleware.after) {
            middleware.after(action, redoEntry.state, currentState, newState);
          }
        }
      }
    };

    tree.getHistory = () => {
      return (timeTravelMap.get(tree) as TimeTravelEntry<T>[]) || [];
    };

    tree.resetHistory = () => {
      timeTravelMap.set(tree, []);
      redoStack.set(tree, []);
    };
  }

  return tree;
}

function create<T extends Record<string, unknown>>(
  obj: T,
  config: TreeConfig = {}
): SignalTree<T> {
  const equalityFn = config.useShallowComparison ? shallowEqual : equal;

  // Recursively create signals for nested objects, but don't wrap them in trees
  const createSignalsFromObject = <O extends Record<string, unknown>>(
    obj: O
  ): DeepSignalify<O> => {
    const result = {} as DeepSignalify<O>;

    for (const [key, value] of Object.entries(obj)) {
      const isObj = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null;

      if (isObj(value) && !Array.isArray(value) && !isSignal(value)) {
        // For nested objects, create nested signal structure directly
        (result as Record<string, unknown>)[key] =
          createSignalsFromObject(value);
      } else if (isSignal(value)) {
        (result as Record<string, unknown>)[key] = value;
      } else {
        (result as Record<string, unknown>)[key] = signal(value, {
          equal: equalityFn,
        });
      }
    }

    return result;
  };

  // Create the signal structure
  const signalState = createSignalsFromObject(obj);

  const resultTree = {
    state: signalState,
    $: signalState, // $ points to the same state object
  } as SignalTree<T>;

  enhanceTreeBasic(resultTree);
  return enhanceTree(resultTree, config);
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Creates a reactive signal tree from a plain object with basic functionality.
 *
 * This overload creates a SignalTree with default configuration, providing core
 * state management without performance optimizations. All advanced features
 * will show warnings when used and fallback to basic implementations.
 *
 * @template T - The state object type, must extend Record<string, unknown>
 * @param obj - The initial state object to convert into a reactive tree
 * @returns A basic SignalTree with core functionality only
 *
 * @example
 * ```typescript
 * // Basic usage - no performance features
 * const tree = signalTree({
 *   user: { name: 'John', age: 30 },
 *   settings: { theme: 'light', notifications: true },
 *   counter: 0
 * });
 *
 * // Core functionality works
 * tree.state.counter.set(5);
 * tree.update(state => ({ counter: state.counter + 1 }));
 *
 * // Advanced features show warnings but provide fallbacks
 * tree.batch(state => ({ counter: 10 })); // ⚠️ Warning: batching not enabled
 * tree.cleanup(); // ⚠️ Warning: optimization not enabled
 * ```
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: T
): SignalTree<T>;

/**
 * Creates a reactive signal tree with comprehensive configuration options.
 *
 * This overload allows full customization of performance features, middleware,
 * time travel, dev tools, and other advanced capabilities. Configure only the
 * features you need to optimize bundle size and runtime performance.
 *
 * @template T - The state object type, must extend Record<string, unknown>
 * @param obj - The initial state object to convert into a reactive tree
 * @param config - Configuration object controlling feature enablement and behavior
 * @returns A fully configured SignalTree with requested features enabled
 *
 * @example
 * ```typescript
 * // Production configuration - optimized for performance
 * const productionTree = signalTree(
 *   {
 *     users: [] as User[],
 *     loading: false,
 *     cache: new Map()
 *   },
 *   {
 *     enablePerformanceFeatures: true,
 *     batchUpdates: true,
 *     useMemoization: true,
 *     trackPerformance: true,
 *     maxCacheSize: 100,
 *     useShallowComparison: true
 *   }
 * );
 *
 * // Development configuration - full debugging capabilities
 * const devTree = signalTree(
 *   { count: 0, history: [] },
 *   {
 *     enablePerformanceFeatures: true,
 *     batchUpdates: true,
 *     useMemoization: true,
 *     trackPerformance: true,
 *     enableTimeTravel: true,
 *     enableDevTools: true,
 *     treeName: 'CounterTree'
 *   }
 * );
 *
 * // Minimal enhanced configuration - just batching
 * const batchedTree = signalTree(
 *   { items: [], filters: {} },
 *   {
 *     enablePerformanceFeatures: true,
 *     batchUpdates: true
 *   }
 * );
 *
 * // Feature-specific configurations
 * const timeTravelTree = signalTree(
 *   { gameState: 'playing', score: 0 },
 *   {
 *     enablePerformanceFeatures: true,
 *     enableTimeTravel: true,
 *     trackPerformance: true
 *   }
 * );
 * ```
 *
 * @see {@link TreeConfig} for detailed configuration options
 * @see {@link PerformanceMetrics} for available performance tracking data
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: T,
  config: TreeConfig
): SignalTree<T>;

/**
 * Implementation of the signalTree factory function.
 *
 * **Key Features by Configuration:**
 *
 * **Basic Mode** (`enablePerformanceFeatures: false` or undefined):
 * - ✅ Core state management with signals
 * - ✅ Reactive updates and subscriptions
 * - ✅ Entity helpers and async actions
 * - ⚠️ Advanced features show warnings and use fallbacks
 * - 📦 Minimal bundle impact
 *
 * **Enhanced Mode** (`enablePerformanceFeatures: true`):
 * - ✅ All basic features
 * - ✅ Middleware system for extensibility
 * - ✅ Conditional performance optimizations based on sub-options
 * - ✅ Time travel debugging (if `enableTimeTravel: true`)
 * - ✅ Redux DevTools integration (if `enableDevTools: true`)
 * - ✅ Performance metrics tracking (if `trackPerformance: true`)
 *
 * **Performance Sub-features:**
 * - `batchUpdates`: Batch multiple state changes into single update cycle
 * - `useMemoization`: Cache computed values with intelligent invalidation
 * - `trackPerformance`: Collect detailed metrics about tree operations
 * - `useShallowComparison`: Use faster shallow equality for primitive values
 *
 * **Memory Management:**
 * - `maxCacheSize`: Limit cached computed values (default: 100)
 * - `cleanup()`: Conditional cache cleanup when size exceeds limit
 * - `clearCache()`: Immediate full cache invalidation
 *
 * @param obj - The initial state object
 * @param config - Optional configuration (defaults to basic mode)
 * @returns Configured SignalTree instance
 *
 * @example
 * ```typescript
 * // Recommended patterns for different use cases:
 *
 * // 1. Simple component state
 * const componentTree = signalTree({
 *   loading: false,
 *   data: null,
 *   error: null
 * });
 *
 * // 2. Complex application state
 * const appTree = signalTree(
 *   {
 *     auth: { user: null, isAuthenticated: false },
 *     ui: { theme: 'light', sidebarOpen: false },
 *     data: { users: [], posts: [], comments: [] }
 *   },
 *   {
 *     enablePerformanceFeatures: true,
 *     batchUpdates: true,
 *     useMemoization: true,
 *     trackPerformance: true,
 *     treeName: 'AppState'
 *   }
 * );
 *
 * // 3. Game state with time travel
 * const gameTree = signalTree(
 *   {
 *     player: { x: 0, y: 0, health: 100 },
 *     enemies: [],
 *     score: 0,
 *     level: 1
 *   },
 *   {
 *     enablePerformanceFeatures: true,
 *     enableTimeTravel: true,
 *     batchUpdates: true,
 *     treeName: 'GameState'
 *   }
 * );
 *
 * // 4. High-performance data processing
 * const dataTree = signalTree(
 *   {
 *     rawData: [],
 *     processedData: [],
 *     filters: {},
 *     aggregations: {}
 *   },
 *   {
 *     enablePerformanceFeatures: true,
 *     useMemoization: true,
 *     batchUpdates: true,
 *     maxCacheSize: 200,
 *     useShallowComparison: true
 *   }
 * );
 * ```
 */
export function signalTree<T extends Record<string, unknown>>(
  obj: T,
  config: TreeConfig = {}
): SignalTree<T> {
  return create(obj, config);
}

// ============================================
// BUILT-IN MIDDLEWARE
// ============================================

export const loggingMiddleware = <T>(treeName: string): Middleware<T> => ({
  id: 'logging',
  before: (action, payload, state) => {
    console.group(`🏪 ${treeName}: ${action}`);
    console.log('Previous state:', state);
    console.log(
      'Payload:',
      typeof payload === 'function' ? 'Function' : payload
    );
    return true;
  },
  after: (action, payload, state, newState) => {
    console.log('New state:', newState);
    console.groupEnd();
  },
});

export const performanceMiddleware = <T>(): Middleware<T> => ({
  id: 'performance',
  before: (action) => {
    console.time(`Tree update: ${action}`);
    return true;
  },
  after: (action) => {
    console.timeEnd(`Tree update: ${action}`);
  },
});

export const validationMiddleware = <T>(
  validator: (state: T) => string | null
): Middleware<T> => ({
  id: 'validation',
  after: (action, payload, state, newState) => {
    const error = validator(newState);
    if (error) {
      console.error(`Validation failed after ${action}:`, error);
    }
  },
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

export function createEntityTree<E extends { id: string | number }>(
  initialEntities: E[] = [],
  config: TreeConfig = {}
) {
  const tree = signalTree(
    {
      entities: initialEntities,
      loading: false,
      error: null as string | null,
      selectedId: null as string | number | null,
    },
    {
      enablePerformanceFeatures: true,
      useMemoization: true,
      batchUpdates: true,
      ...config,
    }
  );

  if (!tree.asCrud) {
    throw new Error('Repository helpers not available');
  }
  const entityHelpers = tree.asCrud<E>('entities');

  return {
    ...tree,
    ...entityHelpers,

    select: (id: string | number) => {
      tree.state.selectedId.set(id);
    },

    deselect: () => {
      tree.state.selectedId.set(null);
    },

    getSelected: () =>
      computed(() => {
        const selectedId = tree.state.selectedId();
        return selectedId ? entityHelpers.findById(selectedId)() : undefined;
      }),

    loadAsync: (() => {
      if (!tree.asyncAction) {
        throw new Error('Async action creator not available');
      }
      return tree.asyncAction(
        async (loader: () => Promise<E[]>) => {
          const entities = await loader();
          return entities;
        },
        {
          loadingKey: 'loading',
          errorKey: 'error',
          onSuccess: (entities) => {
            tree.state.entities.set(entities);
          },
        }
      );
    })(),
  };
}

export type AsyncValidatorFn<T> = (
  value: T
) => Observable<string | null> | Promise<string | null>;

export type EnhancedArraySignal<T> = WritableSignal<T[]> & {
  push: (item: T) => void;
  removeAt: (index: number) => void;
  setAt: (index: number, value: T) => void;
  insertAt: (index: number, item: T) => void;
  move: (from: number, to: number) => void;
  clear: () => void;
};

// ============================================
// FORM TREE TYPES
// ============================================

/**
 * Form tree type that flattens the state access while maintaining form-specific properties
 */
export type FormTree<T extends Record<string, unknown>> = {
  // Flattened state access - direct access to form values as signals
  state: DeepSignalify<T>;
  $: DeepSignalify<T>; // Alias for state

  // Form-specific signals
  errors: WritableSignal<Record<string, string>>;
  asyncErrors: WritableSignal<Record<string, string>>;
  touched: WritableSignal<Record<string, boolean>>;
  asyncValidating: WritableSignal<Record<string, boolean>>;
  dirty: WritableSignal<boolean>;
  valid: WritableSignal<boolean>;
  submitting: WritableSignal<boolean>;

  // Form methods
  unwrap(): T;
  setValue(field: string, value: unknown): void;
  setValues(values: Partial<T>): void;
  reset(): void;
  submit<TResult>(submitFn: (values: T) => Promise<TResult>): Promise<TResult>;
  validate(field?: string): Promise<void>;

  // Field-level helpers
  getFieldError(field: string): Signal<string | undefined>;
  getFieldAsyncError(field: string): Signal<string | undefined>;
  getFieldTouched(field: string): Signal<boolean | undefined>;
  isFieldValid(field: string): Signal<boolean>;
  isFieldAsyncValidating(field: string): Signal<boolean | undefined>;

  // Direct access to field errors
  fieldErrors: Record<string, Signal<string | undefined>>;
  fieldAsyncErrors: Record<string, Signal<string | undefined>>;

  // Keep values tree for backward compatibility
  values: SignalTree<T>;
};

export function createFormTree<T extends Record<string, unknown>>(
  initialValues: T,
  config: {
    validators?: Record<string, (value: unknown) => string | null>;
    asyncValidators?: Record<string, AsyncValidatorFn<unknown>>;
  } & TreeConfig = {}
): FormTree<T> {
  const { validators = {}, asyncValidators = {}, ...treeConfig } = config;

  // Create the underlying signal tree
  const valuesTree = signalTree(initialValues, treeConfig);

  // Ensure the state has the correct type - this is the key fix
  const flattenedState = valuesTree.state as DeepSignalify<T>;

  // Create form-specific signals
  const formSignals = {
    errors: signal<Record<string, string>>({}),
    asyncErrors: signal<Record<string, string>>({}),
    touched: signal<Record<string, boolean>>({}),
    asyncValidating: signal<Record<string, boolean>>({}),
    dirty: signal(false),
    valid: signal(true),
    submitting: signal(false),
  };

  const markDirty = () => formSignals.dirty.set(true);

  // Enhance arrays with natural operations
  const enhanceArray = <U>(
    arraySignal: WritableSignal<U[]>
  ): EnhancedArraySignal<U> => {
    const enhanced = arraySignal as EnhancedArraySignal<U>;

    enhanced.push = (item: U) => {
      arraySignal.update((arr) => [...arr, item]);
      markDirty();
    };

    enhanced.removeAt = (index: number) => {
      arraySignal.update((arr) => arr.filter((_, i) => i !== index));
      markDirty();
    };

    enhanced.setAt = (index: number, value: U) => {
      arraySignal.update((arr) =>
        arr.map((item, i) => (i === index ? value : item))
      );
      markDirty();
    };

    enhanced.insertAt = (index: number, item: U) => {
      arraySignal.update((arr) => [
        ...arr.slice(0, index),
        item,
        ...arr.slice(index),
      ]);
      markDirty();
    };

    enhanced.move = (from: number, to: number) => {
      arraySignal.update((arr) => {
        const newArr = [...arr];
        const [item] = newArr.splice(from, 1);
        if (item !== undefined) {
          newArr.splice(to, 0, item);
        }
        return newArr;
      });
      markDirty();
    };

    enhanced.clear = () => {
      arraySignal.set([]);
      markDirty();
    };

    return enhanced;
  };

  // Recursively enhance all arrays in the state
  const enhanceArraysRecursively = (obj: Record<string, unknown>): void => {
    for (const key in obj) {
      const value = obj[key];
      if (isSignal(value)) {
        const signalValue = (value as Signal<unknown>)();
        if (Array.isArray(signalValue)) {
          (obj as Record<string, unknown>)[key] = enhanceArray(
            value as WritableSignal<unknown[]>
          );
        }
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        enhanceArraysRecursively(value as Record<string, unknown>);
      }
    }
  };

  // Enhance arrays in the state
  enhanceArraysRecursively(flattenedState as Record<string, unknown>);

  // Helper functions for nested paths
  const getNestedValue = (obj: DeepSignalify<T>, path: string): unknown => {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current && typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
        if (isSignal(current)) {
          current = (current as Signal<unknown>)();
        }
      } else {
        return undefined;
      }
    }

    return current;
  };

  const setNestedValue = (path: string, value: unknown): void => {
    const keys = path.split('.');
    let current: unknown = flattenedState;

    for (let i = 0; i < keys.length - 1; i++) {
      current = (current as Record<string, unknown>)[keys[i]];
      if (!current) return;
    }

    const lastKey = keys[keys.length - 1];
    const target = (current as Record<string, unknown>)[lastKey];

    if (isSignal(target) && 'set' in target) {
      (target as WritableSignal<unknown>).set(value);
    }
  };

  const validate = async (field?: string): Promise<void> => {
    const errors: Record<string, string> = {};
    const asyncErrors: Record<string, string> = {};

    const fieldsToValidate = field ? [field] : Object.keys(validators);

    // Sync validation
    for (const fieldPath of fieldsToValidate) {
      const validator = validators[fieldPath];
      if (validator) {
        const value = getNestedValue(flattenedState, fieldPath);
        const error = validator(value);
        if (error) {
          errors[fieldPath] = error;
        }
      }
    }

    formSignals.errors.set(errors);

    // Async validation
    const asyncFieldsToValidate = field
      ? [field]
      : Object.keys(asyncValidators);

    for (const fieldPath of asyncFieldsToValidate) {
      const asyncValidator = asyncValidators[fieldPath];
      if (asyncValidator && (!field || field === fieldPath)) {
        formSignals.asyncValidating.update((v) => ({
          ...v,
          [fieldPath]: true,
        }));

        try {
          const value = getNestedValue(flattenedState, fieldPath);
          const result = await asyncValidator(value);
          if (result && typeof result === 'string') {
            asyncErrors[fieldPath] = result;
          }
        } catch {
          asyncErrors[fieldPath] = 'Validation error';
        }

        formSignals.asyncValidating.update((v) => ({
          ...v,
          [fieldPath]: false,
        }));
      }
    }

    formSignals.asyncErrors.set(asyncErrors);

    // Update validity
    const hasErrors = Object.keys(errors).length > 0;
    const hasAsyncErrors = Object.keys(asyncErrors).length > 0;
    const isValidating = Object.values(formSignals.asyncValidating()).some(
      (v) => v
    );

    formSignals.valid.set(!hasErrors && !hasAsyncErrors && !isValidating);
  };

  // Create computed signals for field errors
  const fieldErrors: Record<string, Signal<string | undefined>> = {};
  const fieldAsyncErrors: Record<string, Signal<string | undefined>> = {};

  // Create error signals for all defined validators
  [...Object.keys(validators), ...Object.keys(asyncValidators)].forEach(
    (fieldPath) => {
      fieldErrors[fieldPath] = computed(() => {
        const errors = formSignals.errors();
        return errors[fieldPath];
      });
      fieldAsyncErrors[fieldPath] = computed(() => {
        const errors = formSignals.asyncErrors();
        return errors[fieldPath];
      });
    }
  );

  // Create the form tree object
  const formTree: FormTree<T> = {
    // Flattened state access
    state: flattenedState,
    $: flattenedState,

    // Form signals
    ...formSignals,

    // Core methods
    unwrap: () => valuesTree.unwrap(),

    setValue: (field: string, value: unknown) => {
      setNestedValue(field, value);
      formSignals.touched.update((t) => ({ ...t, [field]: true }));
      markDirty();
      void validate(field);
    },

    setValues: (values: Partial<T>) => {
      valuesTree.update((v) => ({ ...v, ...values }));
      markDirty();
      void validate();
    },

    reset: () => {
      // Reset each field individually to maintain signal reactivity
      const resetSignals = <TReset extends Record<string, unknown>>(
        current: DeepSignalify<TReset>,
        initial: TReset
      ): void => {
        for (const [key, initialValue] of Object.entries(initial)) {
          const currentValue = (current as Record<string, unknown>)[key];

          if (isSignal(currentValue) && 'set' in currentValue) {
            (currentValue as WritableSignal<unknown>).set(initialValue);
          } else if (
            typeof initialValue === 'object' &&
            initialValue !== null &&
            !Array.isArray(initialValue) &&
            typeof currentValue === 'object' &&
            currentValue !== null &&
            !isSignal(currentValue)
          ) {
            resetSignals(
              currentValue as DeepSignalify<Record<string, unknown>>,
              initialValue as Record<string, unknown>
            );
          }
        }
      };

      resetSignals(flattenedState, initialValues);

      formSignals.errors.set({});
      formSignals.asyncErrors.set({});
      formSignals.touched.set({});
      formSignals.asyncValidating.set({});
      formSignals.dirty.set(false);
      formSignals.valid.set(true);
      formSignals.submitting.set(false);
    },

    submit: async <TResult>(
      submitFn: (values: T) => Promise<TResult>
    ): Promise<TResult> => {
      formSignals.submitting.set(true);

      try {
        await validate();

        if (!formSignals.valid()) {
          throw new Error('Form is invalid');
        }

        const currentValues = valuesTree.unwrap();
        const result = await submitFn(currentValues);
        return result;
      } finally {
        formSignals.submitting.set(false);
      }
    },

    validate,

    // Field helpers
    getFieldError: (field: string) =>
      fieldErrors[field] || computed(() => undefined),

    getFieldAsyncError: (field: string) =>
      fieldAsyncErrors[field] || computed(() => undefined),

    getFieldTouched: (field: string) =>
      computed(() => {
        const touched = formSignals.touched();
        return touched[field];
      }),

    isFieldValid: (field: string) =>
      computed(() => {
        const errors = formSignals.errors();
        const asyncErrors = formSignals.asyncErrors();
        const asyncValidating = formSignals.asyncValidating();
        return !errors[field] && !asyncErrors[field] && !asyncValidating[field];
      }),

    isFieldAsyncValidating: (field: string) =>
      computed(() => {
        const asyncValidating = formSignals.asyncValidating();
        return asyncValidating[field];
      }),

    // Direct access
    fieldErrors,
    fieldAsyncErrors,

    // Keep values tree for backward compatibility
    values: valuesTree,
  };

  return formTree;
}

export function createTestTree<T extends Record<string, unknown>>(
  initialState: T,
  config: TreeConfig = {}
): SignalTree<T> & {
  setState: (state: Partial<T>) => void;
  getState: () => T;
  getHistory: () => TimeTravelEntry<T>[];
  expectState: (expectedState: Partial<T>) => void;
} {
  const tree = signalTree(initialState, {
    enablePerformanceFeatures: true,
    enableTimeTravel: true,
    enableDevTools: false,
    trackPerformance: true,
    ...config,
  });

  return {
    ...tree,

    setState: (state: Partial<T>) => {
      tree.update(() => state);
    },

    getState: () => tree.unwrap(),

    getHistory: () => {
      if (!tree.getHistory) {
        throw new Error('Time travel not enabled for this tree');
      }
      return tree.getHistory();
    },

    expectState: (expectedState: Partial<T>) => {
      const currentState = tree.unwrap();
      for (const [key, value] of Object.entries(expectedState)) {
        const currentValue = (currentState as Record<string, unknown>)[key];
        if (!isEqual(currentValue, value)) {
          throw new Error(
            `Expected ${key} to be ${JSON.stringify(
              value
            )}, but got ${JSON.stringify(currentValue)}`
          );
        }
      }
    },
  };
}

// ============================================
// ANGULAR FORM INTEGRATION
// ============================================

/**
 * Simple directive for two-way binding with signals
 */
@Directive({
  selector: '[libSignalValue]',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SignalValueDirective),
      multi: true,
    },
  ],
  standalone: true,
})
export class SignalValueDirective implements ControlValueAccessor, OnInit {
  @Input() signalValue!: WritableSignal<unknown>;
  @Output() signalValueChange = new EventEmitter<unknown>();

  private elementRef = inject(ElementRef);
  private renderer = inject(Renderer2);

  private onChange: (value: unknown) => void = () => {
    // Empty implementation for ControlValueAccessor
  };
  private onTouched: () => void = () => {
    // Empty implementation for ControlValueAccessor
  };

  ngOnInit() {
    effect(() => {
      const value = this.signalValue();
      this.renderer.setProperty(this.elementRef.nativeElement, 'value', value);
    });
  }

  @HostListener('input', ['$event'])
  @HostListener('change', ['$event'])
  handleChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const value = target?.value;
    if (value !== undefined) {
      this.signalValue.set(value);
      this.signalValueChange.emit(value);
      this.onChange(value);
    }
  }

  @HostListener('blur')
  handleBlur() {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    if (value !== undefined) {
      this.signalValue.set(value);
    }
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    this.renderer.setProperty(
      this.elementRef.nativeElement,
      'disabled',
      isDisabled
    );
  }
}

// ============================================
// SIMPLE AUDIT TRAIL
// ============================================

export interface AuditEntry<T = unknown> {
  timestamp: number;
  changes: Partial<T>;
  metadata?: {
    userId?: string;
    source?: string;
    description?: string;
  };
}

export function createAuditMiddleware<T>(
  auditLog: AuditEntry<T>[],
  getMetadata?: () => AuditEntry<T>['metadata']
): Middleware<T> {
  return {
    id: 'audit',
    after: (action: string, payload: unknown, oldState: T, newState: T) => {
      const changes = getChanges(oldState, newState);
      if (Object.keys(changes).length > 0) {
        auditLog.push({
          timestamp: Date.now(),
          changes,
          metadata: getMetadata?.(),
        });
      }
    },
  };
}

function getChanges<T>(oldState: T, newState: T): Partial<T> {
  const changes: Record<string, unknown> = {};

  for (const key in newState) {
    if (oldState[key] !== newState[key]) {
      changes[key] = newState[key];
    }
  }

  return changes as Partial<T>;
}

// ============================================
// COMMON VALIDATORS
// ============================================

export const validators = {
  required:
    (message = 'Required') =>
    (value: unknown) =>
      !value ? message : null,

  email:
    (message = 'Invalid email') =>
    (value: unknown) => {
      const strValue = value as string;
      return strValue && !strValue.includes('@') ? message : null;
    },

  minLength: (min: number) => (value: unknown) => {
    const strValue = value as string;
    return strValue && strValue.length < min ? `Min ${min} characters` : null;
  },

  pattern:
    (regex: RegExp, message = 'Invalid format') =>
    (value: unknown) => {
      const strValue = value as string;
      return strValue && !regex.test(strValue) ? message : null;
    },
};

export const asyncValidators = {
  unique:
    (
      checkFn: (value: unknown) => Promise<boolean>,
      message = 'Already exists'
    ) =>
    async (value: unknown) => {
      if (!value) return null;
      const exists = await checkFn(value);
      return exists ? message : null;
    },
};

// ============================================
// OPTIONAL RXJS BRIDGE
// ============================================

export function toObservable<T>(signal: Signal<T>): Observable<T> {
  return new Observable((subscriber) => {
    try {
      const effectRef = effect(() => {
        subscriber.next(signal());
      });
      return () => effectRef.destroy();
    } catch {
      // Fallback for test environment without injection context
      subscriber.next(signal());
      return () => {
        // No cleanup needed for single emission
      };
    }
  });
}

// ============================================
// EXPORTS
// ============================================

export const SIGNAL_FORM_DIRECTIVES = [SignalValueDirective];
