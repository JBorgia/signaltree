/**
 * SignalTree Enhancers Types
 * Type definitions for all enhancers
 *
 * @packageDocumentation
 */

// ============================================
// BATCHING TYPES
// ============================================

export interface BatchingConfig {
  maxBatchSize?: number;
  debounceMs?: number;
  flushOnMicrotask?: boolean;
}

export interface BatchUpdate<T = unknown> {
  path: string[];
  value: T;
  timestamp: number;
}

// ============================================
// COMPUTED TYPES
// ============================================

export interface ComputedSignal<T> {
  (): T;
  readonly value: T;
}

export interface ComputedConfig {
  lazy?: boolean;
  memoize?: boolean;
}

// ============================================
// MEMOIZATION TYPES
// ============================================

export interface MemoizationConfig {
  maxSize?: number;
  ttl?: number;
  strategy?: 'lru' | 'fifo' | 'lfu';
}

export interface MemoizedFunction<T extends (...args: never[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T>;
  clear(): void;
  stats(): { hits: number; misses: number; size: number };
}

// ============================================
// TIME TRAVEL TYPES
// ============================================

export interface TimeTravelConfig {
  maxHistorySize?: number;
  enableCompression?: boolean;
}

export interface TimeTravelState {
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  currentIndex: number;
}

// ============================================
// DEVTOOLS TYPES
// ============================================

export interface DevToolsConfig {
  name?: string;
  enabled?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface DevToolsAction {
  type: string;
  payload?: unknown;
  timestamp: number;
  source: string;
}

// ============================================
// PRESETS TYPES
// ============================================

export interface PresetConfig {
  name: string;
  enhancers: unknown[];
  config?: Record<string, unknown>;
}

// ============================================
// ENTITIES TYPES
// ============================================

export interface EntityConfig {
  idField?: string;
  indexes?: string[];
  relations?: Record<string, string>;
}

// ============================================
// SERIALIZATION TYPES
// ============================================

export interface SerializationConfig {
  includeComputed?: boolean;
  includeMeta?: boolean;
  customSerializers?: Record<string, (value: unknown) => unknown>;
}

export interface SerializedState {
  version: string;
  timestamp: number;
  data: unknown;
  meta?: Record<string, unknown>;
}
