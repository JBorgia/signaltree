/**
 * SignalTree Serialization Module
 *
 * Provides serialization and deserialization capabilities for SignalTree,
 * enabling state persistence, SSR, and state transfer between contexts.
 */

import { SignalTree } from '@signaltree/core';
import { isSignal, WritableSignal, Signal } from '@angular/core';
import { TYPE_MARKERS } from '../constants';

/**
 * Interface for SignalTree with debug configuration
 */
interface SignalTreeWithConfig<T = unknown> extends SignalTree<T> {
  __config?: {
    debugMode?: boolean;
  };
}

/**
 * Interface for enhanced SignalTree with auto-save functionality
 */
interface EnhancedSignalTree<T = unknown> extends SerializableSignalTree<T> {
  __flushAutoSave?: () => Promise<void>;
  save(): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
}

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
   * Maximum depth to serialize (prevents infinite recursion)
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
 * Serialized state wrapper with metadata
 */
export interface SerializedState<T = unknown> {
  /**
   * The actual serialized state data
   */
  data: T;

  /**
   * Metadata about the serialization
   */
  metadata?: {
    /**
     * Timestamp when serialized
     */
    timestamp: number;

    /**
     * Version of the serialization format
     */
    version: string;

    /**
     * Custom application version
     */
    appVersion?: string;

    /**
     * Type information for special objects
     */
    types?: Record<string, string>;

    /**
     * Circular reference paths
     */
    circularRefs?: Array<{ path: string; targetPath: string }>;
  };
}

/**
 * Enhanced SignalTree interface with serialization capabilities
 */
export interface SerializableSignalTree<T> extends SignalTree<T> {
  /**
   * Serialize the current state to a JSON string
   */
  serialize(config?: SerializationConfig): string;

  /**
   * Deserialize and apply state from a JSON string
   */
  deserialize(json: string, config?: SerializationConfig): void;

  /**
   * Get a plain object representation of the current state
   */
  toJSON(): T;

  /**
   * Restore state from a plain object
   */
  fromJSON(data: T): void;

  /**
   * Create a snapshot of the current state
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
  if (depth > maxDepth) {
    return '[Max Depth Exceeded]';
  }

  // Handle primitives and special values
  if (obj === null || typeof obj !== 'object') {
    // Handle special values when preserveTypes is enabled
    if (preserveTypes) {
      if (obj === undefined) {
        return { [TYPE_MARKERS.UNDEFINED]: true };
      }
      if (typeof obj === 'number') {
        if (isNaN(obj)) {
          return { [TYPE_MARKERS.NAN]: true };
        }
        if (obj === Infinity) {
          return { [TYPE_MARKERS.INFINITY]: true };
        }
        if (obj === -Infinity) {
          return { [TYPE_MARKERS.NEG_INFINITY]: true };
        }
      }
      if (typeof obj === 'bigint') {
        return { [TYPE_MARKERS.BIGINT]: obj.toString() };
      }
      if (typeof obj === 'symbol') {
        return { [TYPE_MARKERS.SYMBOL]: obj.toString() };
      }
    }
    return obj;
  }

  // Handle circular references
  if (visited.has(obj)) {
    return '[Circular Reference]';
  }

  // Handle signals
  if (isSignal(obj)) {
    return (obj as Signal<unknown>)();
  }

  // Preserve special types if requested - convert them to marker format
  if (preserveTypes) {
    if (obj instanceof Date) {
      return { [TYPE_MARKERS.DATE]: obj.toISOString() };
    }
    if (obj instanceof RegExp) {
      return {
        [TYPE_MARKERS.REGEXP]: {
          source: obj.source,
          flags: obj.flags,
        },
      };
    }
    if (obj instanceof Map) {
      return {
        [TYPE_MARKERS.MAP]: Array.from(obj.entries()),
      };
    }
    if (obj instanceof Set) {
      return {
        [TYPE_MARKERS.SET]: Array.from(obj.values()),
      };
    }
  } else {
    // When preserveTypes is false, let special objects (Date, RegExp, etc.)
    // be handled by JSON.stringify naturally
    if (obj instanceof Date || obj instanceof RegExp) {
      return obj;
    }
  }
  visited.add(obj);

  try {
    // Handle arrays
    if (Array.isArray(obj)) {
      const result = obj.map((item) =>
        unwrapObjectSafely(item, visited, depth + 1, maxDepth, preserveTypes)
      );
      visited.delete(obj);
      return result;
    }

    // Handle plain objects
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSignal(value)) {
        const signalValue = (value as Signal<unknown>)();
        result[key] = unwrapObjectSafely(
          signalValue,
          visited,
          depth + 1,
          maxDepth,
          preserveTypes
        );
      } else {
        result[key] = unwrapObjectSafely(
          value,
          visited,
          depth + 1,
          maxDepth,
          preserveTypes
        );
      }
    }

    visited.delete(obj);
    return result;
  } catch {
    visited.delete(obj);
    return '[Serialization Error]';
  }
}

/**
 * Detects circular references in an object
 */
function detectCircularReferences(
  obj: unknown,
  path = '',
  seen = new WeakSet<object>(),
  paths = new Map<object, string>()
): Array<{ path: string; targetPath: string }> {
  const circular: Array<{ path: string; targetPath: string }> = [];

  if (obj === null || typeof obj !== 'object') {
    return circular;
  }

  // Check if we've seen this object before
  if (seen.has(obj)) {
    // Found a circular reference
    const targetPath = paths.get(obj) || '';
    circular.push({ path, targetPath });
    return circular; // Don't recurse into circular references
  }

  // Mark this object as seen
  seen.add(obj);
  paths.set(obj, path);

  // Recursively check children
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const itemPath = path ? `${path}[${i}]` : `[${i}]`;
      const childCircular = detectCircularReferences(
        obj[i],
        itemPath,
        seen,
        paths
      );
      circular.push(...childCircular);
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      const propPath = path ? `${path}.${key}` : key;
      const childCircular = detectCircularReferences(
        value,
        propPath,
        seen,
        paths
      );
      circular.push(...childCircular);
    }
  }

  // Remove from seen set when backing out (allows siblings to reference same objects)
  seen.delete(obj);

  return circular;
}

/**
 * Internal config with all required properties but nullable functions
 */
type InternalSerializationConfig = Required<
  Omit<SerializationConfig, 'replacer' | 'reviver'>
> & {
  replacer?: (key: string, value: unknown) => unknown;
  reviver?: (key: string, value: unknown) => unknown;
};

/**
 * Custom replacer that handles circular references only
 */
function createReplacer(config: InternalSerializationConfig) {
  const seen = new WeakSet<object>();
  const circularPaths = new Map<object, string>();

  return function replacer(
    this: Record<string, unknown>,
    key: string,
    value: unknown
  ): unknown {
    // Apply custom replacer first if provided
    if (config.replacer) {
      value = config.replacer.call(this, key, value);
    }

    // Skip signals - we already unwrapped them
    if (isSignal(value)) {
      return (value as Signal<unknown>)();
    }

    // Handle circular references
    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        if (config.handleCircular) {
          const targetPath = circularPaths.get(value) || '';
          return { [TYPE_MARKERS.CIRCULAR]: targetPath };
        }
        return undefined;
      }
      seen.add(value);
      const currentPath = key || '';
      circularPaths.set(value, currentPath);
    }

    // All special type handling is now done in unwrapObjectSafely
    return value;
  };
}

/**
 * Resolves circular references after parsing
 */
function resolveCircularReferences(
  obj: Record<string, unknown>,
  circularPaths: Array<{ path: string; targetPath: string }>
): void {
  for (const { path, targetPath } of circularPaths) {
    const pathParts = path.split(/\.|\[|\]/).filter(Boolean);
    const targetParts = targetPath.split(/\.|\[|\]/).filter(Boolean);

    // Navigate to the circular reference location
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]] as Record<string, unknown>;
      if (!current) break;
    }

    // Navigate to the target
    let target: Record<string, unknown> = obj;
    for (const part of targetParts) {
      target = target[part] as Record<string, unknown>;
      if (!target) break;
    }

    // Set the circular reference
    if (current && target) {
      current[pathParts[pathParts.length - 1]] = target;
    }
  }
}

/**
 * Enhances a SignalTree with serialization capabilities
 */
export function withSerialization<T extends Record<string, unknown>>(
  defaultConfig: SerializationConfig = {}
): (tree: SignalTree<T>) => SerializableSignalTree<T> {
  return (tree: SignalTree<T>): SerializableSignalTree<T> => {
    const enhanced = tree as SerializableSignalTree<T>;

    /**
     * Get plain object representation
     */
    enhanced.toJSON = (): T => {
      const fullConfig: InternalSerializationConfig = {
        ...DEFAULT_CONFIG,
        ...defaultConfig,
      };
      return unwrapObjectSafely(
        tree.state,
        new WeakSet(),
        0,
        50,
        fullConfig.preserveTypes
      ) as T;
    };

    /**
     * Restore from plain object
     */
    enhanced.fromJSON = (data: T): void => {
      // Convert special type markers back to their actual types
      const restoreSpecialTypes = (value: unknown): unknown => {
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
          return BigInt(value[TYPE_MARKERS.BIGINT] as string);
        }
        if (TYPE_MARKERS.SYMBOL in value) {
          return Symbol.for(value[TYPE_MARKERS.SYMBOL] as string);
        }
        if (TYPE_MARKERS.DATE in value) {
          return new Date(value[TYPE_MARKERS.DATE] as string);
        }
        if (TYPE_MARKERS.REGEXP in value) {
          const regexpData = value[TYPE_MARKERS.REGEXP] as {
            source: string;
            flags: string;
          };
          return new RegExp(regexpData.source, regexpData.flags);
        }
        if (TYPE_MARKERS.MAP in value) {
          return new Map(value[TYPE_MARKERS.MAP] as Array<[unknown, unknown]>);
        }
        if (TYPE_MARKERS.SET in value) {
          return new Set(value[TYPE_MARKERS.SET] as Array<unknown>);
        }

        // Handle arrays
        if (Array.isArray(value)) {
          return value.map(restoreSpecialTypes);
        }

        // Handle objects
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = restoreSpecialTypes(v);
        }
        return result;
      };

      // Restore special types in the data
      const restoredData = restoreSpecialTypes(data);

      // Deep update the tree with new data
      const updateSignals = (
        target: Record<string, unknown>,
        source: Record<string, unknown>,
        path = ''
      ): void => {
        if (!target || !source) return;

        for (const key in source) {
          if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

          const targetValue = target[key];
          const sourceValue = source[key];

          if (isSignal(targetValue)) {
            // Update signal value
            (targetValue as WritableSignal<unknown>).set(sourceValue);
          } else if (
            sourceValue &&
            typeof sourceValue === 'object' &&
            !Array.isArray(sourceValue) &&
            targetValue &&
            typeof targetValue === 'object' &&
            !isSignal(targetValue)
          ) {
            // Recurse into nested objects
            updateSignals(
              targetValue as Record<string, unknown>,
              sourceValue as Record<string, unknown>,
              path ? `${path}.${key}` : key
            );
          }
        }
      };

      updateSignals(
        tree.state as Record<string, unknown>,
        restoredData as Record<string, unknown>
      );
    };

    /**
     * Serialize to JSON string
     */
    enhanced.serialize = (config?: SerializationConfig): string => {
      const fullConfig: InternalSerializationConfig = {
        ...DEFAULT_CONFIG,
        ...defaultConfig,
        ...config,
      };

      // Get current state with the correct preserveTypes setting
      const state = unwrapObjectSafely(
        tree.state,
        new WeakSet(),
        0,
        fullConfig.maxDepth,
        fullConfig.preserveTypes
      ) as T;

      // Detect circular references if needed
      const circularPaths = fullConfig.handleCircular
        ? detectCircularReferences(state)
        : [];

      // Prepare data
      const data: SerializedState<T> = {
        data: state,
      };

      // Add metadata if requested
      if (fullConfig.includeMetadata) {
        data.metadata = {
          timestamp: Date.now(),
          version: '1.0.0',
          ...(circularPaths.length > 0 && { circularRefs: circularPaths }),
        };
      }

      // Serialize with custom replacer
      const replacer = createReplacer(fullConfig);
      return JSON.stringify(data, replacer, 2);
    };

    /**
     * Deserialize from JSON string
     */
    enhanced.deserialize = (
      json: string,
      config?: SerializationConfig
    ): void => {
      const fullConfig: InternalSerializationConfig = {
        ...DEFAULT_CONFIG,
        ...defaultConfig,
        ...config,
      };

      try {
        // Parse with simple JSON.parse (no custom reviver)
        const parsed: SerializedState<T> = JSON.parse(json);

        // Extract data and metadata
        const { data, metadata } = parsed;

        // Resolve circular references if present
        if (metadata?.circularRefs && fullConfig.handleCircular) {
          resolveCircularReferences(data, metadata.circularRefs);
        }

        // Apply the data to the tree (fromJSON will handle type restoration)
        enhanced.fromJSON(data);

        // Log restoration if in debug mode
        if (
          (tree as { __config?: { debugMode?: boolean } }).__config?.debugMode
        ) {
          console.log('[SignalTree] State restored from serialized data', {
            timestamp: metadata?.timestamp,
            version: metadata?.version,
          });
        }
      } catch (error) {
        console.error('[SignalTree] Failed to deserialize:', error);
        throw new Error(
          `Failed to deserialize SignalTree state: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    };

    /**
     * Create a snapshot
     */
    enhanced.snapshot = (): SerializedState<T> => {
      const state = enhanced.toJSON();
      const circularPaths = detectCircularReferences(state);

      return {
        data: JSON.parse(JSON.stringify(state)), // Deep clone
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0',
          ...(circularPaths.length > 0 && { circularRefs: circularPaths }),
        },
      };
    };

    /**
     * Restore from snapshot
     */
    enhanced.restore = (snapshot: SerializedState<T>): void => {
      const { data, metadata } = snapshot;

      // Resolve circular references if present
      if (metadata?.circularRefs) {
        resolveCircularReferences(data, metadata.circularRefs);
      }

      enhanced.fromJSON(data);
    };

    return enhanced;
  };
}

/**
 * Convenience function to enable serialization with defaults
 */
export function enableSerialization<T extends Record<string, unknown>>() {
  return withSerialization<T>({
    includeMetadata: true,
    preserveTypes: true,
    handleCircular: true,
  });
}

/**
 * Storage adapter interface for persistence
 */
export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/**
 * Persistence configuration
 */
export interface PersistenceConfig extends SerializationConfig {
  /**
   * Storage key to use
   */
  key: string;

  /**
   * Storage adapter (defaults to localStorage)
   */
  storage?: StorageAdapter;

  /**
   * Whether to auto-save on every update
   * @default true
   */
  autoSave?: boolean;

  /**
   * Debounce delay for auto-save in ms
   * @default 1000
   */
  debounceMs?: number;

  /**
   * Whether to auto-load on creation
   * @default true
   */
  autoLoad?: boolean;
}

/**
 * Adds persistence capabilities to a SerializableSignalTree
 */
export function withPersistence<T extends Record<string, unknown>>(
  config: PersistenceConfig
): (tree: SignalTree<T>) => SerializableSignalTree<T> & {
  save(): Promise<void>;
  load(): Promise<void>;
  clear(): Promise<void>;
} {
  const {
    key,
    storage = typeof window !== 'undefined' ? window.localStorage : undefined,
    autoSave = true,
    debounceMs = 1000,
    autoLoad = true,
    ...serializationConfig
  } = config;

  if (!storage) {
    throw new Error(
      'No storage adapter available. Provide a storage adapter in the config.'
    );
  }

  return (tree: SignalTree<T>) => {
    // First enhance with serialization
    const serializable = withSerialization<T>(serializationConfig)(tree);

    // Add persistence methods
    const enhanced = serializable as SerializableSignalTree<T> & {
      save(): Promise<void>;
      load(): Promise<void>;
      clear(): Promise<void>;
    };

    /**
     * Save current state to storage
     */
    enhanced.save = async (): Promise<void> => {
      try {
        const serialized = enhanced.serialize(serializationConfig);
        await Promise.resolve(storage.setItem(key, serialized));

        if ((tree as SignalTreeWithConfig).__config?.debugMode) {
          console.log(`[SignalTree] State saved to storage key: ${key}`);
        }
      } catch (error) {
        console.error('[SignalTree] Failed to save state:', error);
        throw error; // Re-throw for tests to catch
      }
    };

    /**
     * Load state from storage
     */
    enhanced.load = async (): Promise<void> => {
      try {
        const data = await Promise.resolve(storage.getItem(key));
        if (data) {
          enhanced.deserialize(data, serializationConfig);

          if ((tree as SignalTreeWithConfig).__config?.debugMode) {
            console.log(`[SignalTree] State loaded from storage key: ${key}`);
          }
        }
      } catch (error) {
        console.error('[SignalTree] Failed to load state:', error);
        throw error; // Re-throw for tests to catch
      }
    };

    /**
     * Clear state from storage
     */
    enhanced.clear = async (): Promise<void> => {
      try {
        await Promise.resolve(storage.removeItem(key));

        if ((tree as SignalTreeWithConfig).__config?.debugMode) {
          console.log(`[SignalTree] State cleared from storage key: ${key}`);
        }
      } catch (error) {
        console.error('[SignalTree] Failed to clear state:', error);
        throw error; // Re-throw for tests to catch
      }
    };

    // Auto-load on creation if enabled
    if (autoLoad) {
      // Use setTimeout to avoid blocking initialization and timing issues
      setTimeout(() => {
        enhanced.load().catch((error) => {
          console.warn('[SignalTree] Auto-load failed:', error);
        });
      }, 0);
    }

    // Auto-save on updates if enabled
    if (autoSave) {
      let saveTimeout: ReturnType<typeof setTimeout> | undefined;

      // Hook into state changes to trigger auto-save
      const triggerAutoSave = () => {
        // Debounce saves
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }

        saveTimeout = setTimeout(() => {
          enhanced.save().catch((error) => {
            console.error('[SignalTree] Auto-save failed:', error);
          });
        }, debounceMs);
      };

      // Watch for any signal changes in the tree
      const watchSignals = (obj: Record<string, unknown>, path = ''): void => {
        if (!obj || typeof obj !== 'object') return;

        for (const [key, value] of Object.entries(obj)) {
          if (isSignal(value)) {
            // Create an effect to watch this signal
            const signal = value as Signal<unknown>;
            let previousValue = signal();

            // Periodically check for changes (this is a simplified approach)
            // In a real implementation, you'd want to use Angular's effect() or similar
            const checkForChanges = () => {
              const currentValue = signal();
              if (currentValue !== previousValue) {
                previousValue = currentValue;
                triggerAutoSave();
              }
              setTimeout(checkForChanges, 50); // Check every 50ms
            };

            setTimeout(checkForChanges, 0);
          } else if (value && typeof value === 'object') {
            watchSignals(
              value as Record<string, unknown>,
              path ? `${path}.${key}` : key
            );
          }
        }
      };

      // Start watching signals
      watchSignals(tree.state as Record<string, unknown>);

      // Store cleanup function for testing
      (enhanced as EnhancedSignalTree).__flushAutoSave = () => {
        if (saveTimeout) {
          clearTimeout(saveTimeout);
          saveTimeout = undefined;
          return enhanced.save();
        }
        return Promise.resolve();
      };
    }

    return enhanced;
  };
}

/**
 * Create a custom storage adapter
 */
export function createStorageAdapter(
  getItem: (key: string) => string | null | Promise<string | null>,
  setItem: (key: string, value: string) => void | Promise<void>,
  removeItem: (key: string) => void | Promise<void>
): StorageAdapter {
  return { getItem, setItem, removeItem };
}

/**
 * IndexedDB storage adapter for large state trees
 */
export function createIndexedDBAdapter(
  dbName = 'SignalTreeDB',
  storeName = 'states'
): StorageAdapter {
  let db: IDBDatabase | null = null;

  const openDB = async (): Promise<IDBDatabase> => {
    if (db) return db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName);
        }
      };
    });
  };

  return {
    async getItem(key: string): Promise<string | null> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result || null);
      });
    },

    async setItem(key: string, value: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async removeItem(key: string): Promise<void> {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}
