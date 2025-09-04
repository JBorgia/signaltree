import { isSignal, Signal } from '@angular/core';
import { SignalTree } from '@signaltree/core';

import { TYPE_MARKERS } from '../constants';

import type { EnhancerWithMeta } from '@signaltree/core';

/**
 * SignalTree Core Serialization Module
 *
 * Provides basic serialization and deserialization capabilities for SignalTree,
 * optimized for minimal bundle size.
 */

/**
 * Serialization configuration options
 */
export interface SerializationConfig {
  /**
   * Whether to include metadata (timestamps, version, etc.)
   * @default true
   */
  includeMetadata?: boolean;

  /**
   * Custom replacer function for JSON.stringify
   */
  replacer?: (key: string, value: unknown) => unknown;

  /**
   * Custom reviver function for JSON.parse
   */
  reviver?: (key: string, value: unknown) => unknown;

  /**
   * Whether to preserve special types (Date, RegExp, etc.)
   * @default true
   */
  preserveTypes?: boolean;

  /**
   * Maximum depth for serialization to prevent stack overflow
   * @default 50
   */
  maxDepth?: number;

  /**
   * Whether to handle circular references
   * @default true
   */
  handleCircular?: boolean;
}

/**
 * Serialized state format
 */
export interface SerializedState<T = unknown> {
  data: T;
  metadata?: {
    timestamp: number;
    version: string;
    [key: string]: unknown;
  };
}

/**
 * Interface for serializable SignalTree
 */
export interface SerializableSignalTree<T> extends SignalTree<T> {
  /**
   * Convert to JSON-serializable format
   */
  toJSON(): T;

  /**
   * Restore from JSON data
   */
  fromJSON(data: T, metadata?: SerializedState<T>['metadata']): void;

  /**
   * Serialize with metadata
   */
  serialize(config?: SerializationConfig): string;

  /**
   * Deserialize from string
   */
  deserialize(serialized: string, config?: SerializationConfig): void;

  /**
   * Create a snapshot of current state
   */
  snapshot(): SerializedState<T>;

  /**
   * Restore state from a snapshot
   */
  restore(snapshot: SerializedState<T>): void;
}

/**
 * Default serialization config
 */
const DEFAULT_CONFIG: Required<
  Omit<SerializationConfig, 'replacer' | 'reviver'>
> &
  Pick<SerializationConfig, 'replacer' | 'reviver'> = {
  includeMetadata: true,
  replacer: undefined,
  reviver: undefined,
  preserveTypes: true,
  maxDepth: 50,
  handleCircular: true,
};

/**
 * Safely unwrap object with circular reference detection
 */
function unwrapObjectSafely(
  obj: unknown,
  visited = new WeakSet<object>(),
  depth = 0,
  maxDepth = 50,
  preserveTypes = true
): unknown {
  // Prevent infinite recursion
  if (depth > maxDepth) return '[Max Depth Exceeded]';

  // Primitives and non-objects
  if (obj === null || typeof obj !== 'object') {
    if (!preserveTypes) return obj;

    if (obj === undefined) return { [TYPE_MARKERS.UNDEFINED]: true };
    if (typeof obj === 'number') {
      if (Number.isNaN(obj)) return { [TYPE_MARKERS.NAN]: true };
      if (obj === Infinity) return { [TYPE_MARKERS.INFINITY]: true };
      if (obj === -Infinity) return { [TYPE_MARKERS.NEG_INFINITY]: true };
      return obj;
    }
    if (typeof obj === 'bigint') return { [TYPE_MARKERS.BIGINT]: String(obj) };
    if (typeof obj === 'symbol') return { [TYPE_MARKERS.SYMBOL]: String(obj) };
    return obj;
  }

  // Handle functions
  if (typeof obj === 'function') {
    return preserveTypes
      ? { [TYPE_MARKERS.FUNCTION]: obj.toString() }
      : '[Function]';
  }

  // Check for circular references
  if (visited.has(obj)) {
    return preserveTypes ? { [TYPE_MARKERS.CIRCULAR]: true } : '[Circular]';
  }
  visited.add(obj);

  try {
    // Handle special objects with type preservation
    if (preserveTypes) {
      if (obj instanceof Date) {
        return { [TYPE_MARKERS.DATE]: obj.toISOString() };
      }
      if (obj instanceof RegExp) {
        return {
          [TYPE_MARKERS.REGEXP]: { source: obj.source, flags: obj.flags },
        };
      }
      if (obj instanceof Map) {
        return {
          [TYPE_MARKERS.MAP]: Array.from(obj.entries()).map(([k, v]) => [
            unwrapObjectSafely(k, visited, depth + 1, maxDepth, preserveTypes),
            unwrapObjectSafely(v, visited, depth + 1, maxDepth, preserveTypes),
          ]),
        };
      }
      if (obj instanceof Set) {
        return {
          [TYPE_MARKERS.SET]: Array.from(obj).map((v) =>
            unwrapObjectSafely(v, visited, depth + 1, maxDepth, preserveTypes)
          ),
        };
      }
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item) =>
        unwrapObjectSafely(item, visited, depth + 1, maxDepth, preserveTypes)
      );
    }

    // Handle signals
    if (isSignal(obj)) {
      return unwrapObjectSafely(
        (obj as Signal<unknown>)(),
        visited,
        depth + 1,
        maxDepth,
        preserveTypes
      );
    }

    // Handle plain objects
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip helper methods
      if (
        typeof value === 'function' &&
        ['set', 'update', 'mutate', 'asReadonly'].includes(key)
      ) {
        continue;
      }
      result[key] = unwrapObjectSafely(
        value,
        visited,
        depth + 1,
        maxDepth,
        preserveTypes
      );
    }
    return result;
  } finally {
    visited.delete(obj);
  }
}

/**
 * Restore special types from markers
 */
function restoreSpecialTypes(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  // Check for type markers
  if (TYPE_MARKERS.UNDEFINED in value) {
    return undefined;
  }
  if (TYPE_MARKERS.NAN in value) {
    return NaN;
  }
  if (TYPE_MARKERS.INFINITY in value) {
    return Infinity;
  }
  if (TYPE_MARKERS.NEG_INFINITY in value) {
    return -Infinity;
  }
  if (TYPE_MARKERS.BIGINT in value) {
    return BigInt((value as any)[TYPE_MARKERS.BIGINT]);
  }
  if (TYPE_MARKERS.SYMBOL in value) {
    return Symbol.for((value as any)[TYPE_MARKERS.SYMBOL]);
  }
  if (TYPE_MARKERS.DATE in value) {
    return new Date((value as any)[TYPE_MARKERS.DATE]);
  }
  if (TYPE_MARKERS.REGEXP in value) {
    const regexpData = (value as any)[TYPE_MARKERS.REGEXP];
    return new RegExp(regexpData.source, regexpData.flags);
  }
  if (TYPE_MARKERS.MAP in value) {
    return new Map((value as any)[TYPE_MARKERS.MAP]);
  }
  if (TYPE_MARKERS.SET in value) {
    return new Set((value as any)[TYPE_MARKERS.SET]);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(restoreSpecialTypes);
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = restoreSpecialTypes(val);
  }
  return result;
}

/**
 * Enhances a SignalTree with core serialization capabilities
 */
export function withSerialization<
  T extends Record<string, unknown> = Record<string, unknown>
>(
  defaultConfig: SerializationConfig = {}
): EnhancerWithMeta<SignalTree<T>, SerializableSignalTree<T>> {
  const enhancer = (tree: SignalTree<T>): SerializableSignalTree<T> => {
    const enhanced = tree as SerializableSignalTree<T>;

    /**
     * Get plain object representation
     */
    enhanced.toJSON = (): T => {
      return tree() as T;
    };

    /**
     * Restore from plain object
     */
    enhanced.fromJSON = (
      data: T,
      metadata?: SerializedState<T>['metadata']
    ): void => {
      const restored = restoreSpecialTypes(data) as T;
      tree.set(restored);
    };

    /**
     * Serialize with type preservation and metadata
     */
    enhanced.serialize = (config: SerializationConfig = {}): string => {
      const mergedConfig = { ...DEFAULT_CONFIG, ...defaultConfig, ...config };

      const unwrapped = unwrapObjectSafely(
        tree(),
        new WeakSet(),
        0,
        mergedConfig.maxDepth,
        mergedConfig.preserveTypes
      ) as T;

      const serializedState: SerializedState<T> = {
        data: unwrapped,
      };

      if (mergedConfig.includeMetadata) {
        serializedState.metadata = {
          timestamp: Date.now(),
          version: '1.0.0',
        };
      }

      return JSON.stringify(serializedState, mergedConfig.replacer);
    };

    /**
     * Deserialize from string
     */
    enhanced.deserialize = (
      serialized: string,
      config: SerializationConfig = {}
    ): void => {
      const mergedConfig = { ...DEFAULT_CONFIG, ...defaultConfig, ...config };

      try {
        const parsed = JSON.parse(
          serialized,
          mergedConfig.reviver
        ) as SerializedState<T>;
        enhanced.fromJSON(parsed.data, parsed.metadata);
      } catch (error) {
        throw new Error(`Failed to deserialize: ${error}`);
      }
    };

    /**
     * Create a snapshot of current state
     */
    enhanced.snapshot = (): SerializedState<T> => {
      const config = { ...DEFAULT_CONFIG, ...defaultConfig };

      const unwrapped = unwrapObjectSafely(
        tree(),
        new WeakSet(),
        0,
        config.maxDepth,
        config.preserveTypes
      ) as T;

      return {
        data: unwrapped,
        metadata: config.includeMetadata
          ? {
              timestamp: Date.now(),
              version: '1.0.0',
            }
          : undefined,
      };
    };

    /**
     * Restore state from a snapshot
     */
    enhanced.restore = (snapshot: SerializedState<T>): void => {
      enhanced.fromJSON(snapshot.data, snapshot.metadata);
    };

    return enhanced;
  };

  enhancer.__meta = {
    name: 'withSerialization',
    enhancerType: 'functional',
  };

  return enhancer;
}

/**
 * Legacy function for backward compatibility
 */
export function enableSerialization<
  T extends Record<string, unknown> = Record<string, unknown>
>() {
  console.warn(
    'enableSerialization is deprecated. Use withSerialization() instead.'
  );
  return withSerialization<T>();
}

/**
 * Apply serialization to an existing tree (shorthand)
 */
export function applySerialization<T extends Record<string, unknown>>(
  tree: SignalTree<T>
): SerializableSignalTree<T> {
  return withSerialization<T>()(tree);
}
