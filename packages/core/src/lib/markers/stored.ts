import { signal } from '@angular/core';

import { registerMarkerProcessor } from '../internals/materialize-markers';

/**
 * Stored Marker - Auto-sync to localStorage
 *
 * Creates a signal that automatically syncs to and from localStorage.
 * Supports custom serialization, SSR safety, versioning, and migrations.
 *
 * @example
 * ```typescript
 * // Basic usage
 * signalTree({
 *   theme: stored('app-theme', 'light'),
 *   lastViewedId: stored('lastViewed', null as number | null)
 * })
 *
 * // Auto-loads from localStorage on init
 * // Auto-saves on every .set() or .update()
 * tree.$.theme.set('dark');  // Automatically saved
 *
 * // Clear from storage
 * tree.$.theme.clear();
 *
 * // Force reload from storage
 * tree.$.theme.reload();
 *
 * // With versioning and migration
 * signalTree({
 *   settings: stored('user-settings', defaultSettings, {
 *     version: 2,
 *     migrate: (oldData, oldVersion) => {
 *       if (oldVersion === 1) {
 *         return { ...oldData, newField: 'default' };
 *       }
 *       return oldData;
 *     }
 *   })
 * })
 *
 * // Type-safe storage keys with createStorageKeys
 * const STORAGE_KEYS = createStorageKeys('myApp', {
 *   theme: 'theme',
 *   user: {
 *     settings: 'settings',
 *     preferences: 'prefs'
 *   }
 * } as const);
 *
 * signalTree({
 *   theme: stored(STORAGE_KEYS.theme, 'light'),  // Key: "myApp:theme"
 *   settings: stored(STORAGE_KEYS.user.settings, {})  // Key: "myApp:user:settings"
 * })
 * ```
 */

// =============================================================================
// SYMBOL
// =============================================================================

export const STORED_MARKER = Symbol('STORED_MARKER');

// =============================================================================
// TYPES
// =============================================================================

/**
 * Migration function to transform old data to new format.
 * @param oldData - The data from storage
 * @param oldVersion - The version the data was stored with
 * @returns The migrated data
 */
export type MigrationFn<T> = (oldData: unknown, oldVersion: number) => T;

/**
 * Options for stored marker configuration.
 */
export interface StoredOptions<T> {
  /** Custom serializer (default: JSON.stringify) */
  serialize?: (value: T) => string;
  /** Custom deserializer (default: JSON.parse) */
  deserialize?: (stored: string) => T;
  /** Storage backend (default: localStorage) */
  storage?: Storage | null;
  /** Debounce delay in ms for writes (default: 100). Set to 0 for immediate writes. */
  debounceMs?: number;
  /**
   * Schema version for this stored value.
   * When version changes, the migrate function is called.
   * @default 1
   */
  version?: number;
  /**
   * Migration function called when stored version differs from current version.
   * Receives the old data and old version, returns migrated data.
   */
  migrate?: MigrationFn<T>;
  /**
   * If true, clears storage if migration fails instead of using default.
   * @default false
   */
  clearOnMigrationFailure?: boolean;
}

/**
 * Internal structure stored in localStorage with versioning metadata.
 */
interface VersionedStorageData<T> {
  __v: number;
  data: T;
}

/**
 * Type guard to check if stored data has version metadata.
 */
function isVersionedData<T>(value: unknown): value is VersionedStorageData<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__v' in value &&
    typeof (value as VersionedStorageData<T>).__v === 'number' &&
    'data' in value
  );
}

// =============================================================================
// TYPE-SAFE STORAGE KEYS
// =============================================================================

/**
 * Recursive type for storage key structure.
 * Transforms a nested object of strings into the same structure with prefixed keys.
 */
type StorageKeyMap<T, Prefix extends string> = {
  [K in keyof T]: T[K] extends string
    ? `${Prefix}:${T[K] & string}`
    : T[K] extends object
    ? StorageKeyMap<T[K], `${Prefix}:${K & string}`>
    : never;
};

/**
 * Creates type-safe storage keys with a prefix.
 *
 * This utility helps organize localStorage keys and prevents typos.
 * All keys are prefixed with the app name for namespace isolation.
 *
 * @param prefix - Application prefix for all keys
 * @param keys - Object structure defining key hierarchy
 * @returns Same structure with all keys prefixed
 *
 * @example
 * ```typescript
 * const STORAGE = createStorageKeys('swapacado', {
 *   theme: 'theme',
 *   auth: {
 *     token: 'token',
 *     refreshToken: 'refresh'
 *   },
 *   user: {
 *     settings: 'settings',
 *     preferences: 'prefs'
 *   }
 * } as const);
 *
 * // Type-safe access:
 * STORAGE.theme           // "swapacado:theme"
 * STORAGE.auth.token      // "swapacado:auth:token"
 * STORAGE.user.settings   // "swapacado:user:settings"
 *
 * // Use in stored():
 * signalTree({
 *   theme: stored(STORAGE.theme, 'light'),
 *   token: stored(STORAGE.auth.token, null as string | null)
 * })
 * ```
 */
export function createStorageKeys<T extends object, P extends string>(
  prefix: P,
  keys: T
): StorageKeyMap<T, P> {
  const result = {} as Record<string, unknown>;

  for (const [key, value] of Object.entries(keys)) {
    if (typeof value === 'string') {
      result[key] = `${prefix}:${value}`;
    } else if (typeof value === 'object' && value !== null) {
      result[key] = createStorageKeys(`${prefix}:${key}`, value as object);
    }
  }

  return result as StorageKeyMap<T, P>;
}

/**
 * Clears all storage keys matching a prefix.
 * Useful for clearing all app data on logout.
 *
 * @param prefix - The prefix to match (e.g., 'myApp')
 * @param storage - Storage backend (default: localStorage)
 *
 * @example
 * ```typescript
 * // Clear all swapacado storage on logout
 * clearStoragePrefix('swapacado');
 * ```
 */
export function clearStoragePrefix(
  prefix: string,
  storage: Storage = typeof localStorage !== 'undefined'
    ? localStorage
    : (null as unknown as Storage)
): void {
  if (!storage) return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith(`${prefix}:`)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}

/**
 * Stored marker - placeholder in source state.
 */
export interface StoredMarker<T> {
  [STORED_MARKER]: true;
  key: string;
  defaultValue: T;
  options: StoredOptions<T>;
}

/**
 * Materialized stored signal with persistence methods.
 */
export interface StoredSignal<T> {
  /** Get the current value */
  (): T;
  /** Set a new value (auto-saves to storage) */
  set(value: T): void;
  /** Update the value (auto-saves to storage) */
  update(fn: (current: T) => T): void;
  /** Clear from storage and reset to default */
  clear(): void;
  /** Force reload from storage */
  reload(): void;
  /** Get the storage key */
  readonly key: string;
  /** Get the current version */
  readonly version: number;
}

// =============================================================================
// MARKER FACTORY (Self-registering for tree-shaking)
// =============================================================================

/** @internal - Tracks if processor is registered */
let storedRegistered = false;

/**
 * Creates a stored marker for localStorage persistence.
 *
 * Automatically registers its processor on first use - no manual
 * registration required. If you never use `stored()`, the processor
 * is tree-shaken out of your bundle.
 *
 * @param key - localStorage key
 * @param defaultValue - Default value if nothing stored
 * @param options - Optional serialization config
 * @returns StoredMarker to be processed during tree finalization
 *
 * @example
 * ```typescript
 * signalTree({
 *   theme: stored('app-theme', 'light'),
 *   user: stored('current-user', null, {
 *     serialize: JSON.stringify,
 *     deserialize: JSON.parse
 *   })
 * })
 * ```
 */
export function stored<T>(
  key: string,
  defaultValue: T,
  options: StoredOptions<T> = {}
): StoredMarker<T> {
  // Self-register on first use (tree-shakeable)
  if (!storedRegistered) {
    storedRegistered = true;
    registerMarkerProcessor(isStoredMarker, createStoredSignal);
  }

  return {
    [STORED_MARKER]: true,
    key,
    defaultValue,
    options,
  };
}

// =============================================================================
// TYPE GUARD
// =============================================================================

/**
 * Type guard to check if a value is a stored marker.
 */
export function isStoredMarker(value: unknown): value is StoredMarker<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    STORED_MARKER in value &&
    (value as Record<symbol, unknown>)[STORED_MARKER] === true
  );
}

// =============================================================================
// SIGNAL FACTORY
// =============================================================================

/**
 * Creates a materialized StoredSignal from a StoredMarker.
 *
 * @param marker - The stored marker with configuration
 * @returns Fully functional StoredSignal with persistence
 */
export function createStoredSignal<T>(
  marker: StoredMarker<T>
): StoredSignal<T> {
  const {
    key,
    defaultValue,
    options: {
      serialize = JSON.stringify,
      deserialize = JSON.parse,
      debounceMs = 100, // Default debounce to avoid hammering localStorage
      version = 1,
      migrate,
      clearOnMigrationFailure = false,
    },
  } = marker;

  // Determine storage - handle SSR (no localStorage)
  const storage =
    marker.options.storage !== undefined
      ? marker.options.storage
      : typeof localStorage !== 'undefined'
      ? localStorage
      : null;

  // Load and potentially migrate initial value from storage
  let initialValue = defaultValue;
  if (storage) {
    try {
      const storedRaw = storage.getItem(key);
      if (storedRaw !== null) {
        const parsed = deserialize(storedRaw);

        // Check if data has version metadata
        if (isVersionedData<T>(parsed)) {
          const storedVersion = parsed.__v;
          let data = parsed.data;

          // Run migration if versions differ
          if (storedVersion !== version && migrate) {
            try {
              data = migrate(data, storedVersion);
              // Save migrated data with new version
              queueMicrotask(() => {
                try {
                  const versionedData: VersionedStorageData<T> = {
                    __v: version,
                    data,
                  };
                  storage.setItem(
                    key,
                    serialize(versionedData as unknown as T)
                  );
                } catch {
                  // Ignore save errors during migration
                }
              });
            } catch (e) {
              if (typeof ngDevMode === 'undefined' || ngDevMode) {
                console.warn(
                  `SignalTree: Migration failed for "${key}" from v${storedVersion} to v${version}`,
                  e
                );
              }
              if (clearOnMigrationFailure) {
                storage.removeItem(key);
              }
              data = defaultValue;
            }
          }

          initialValue = data;
        } else {
          // Legacy data without version - treat as v0 and migrate if needed
          if (migrate && version > 0) {
            try {
              initialValue = migrate(parsed, 0);
              // Save with version metadata
              queueMicrotask(() => {
                try {
                  const versionedData: VersionedStorageData<T> = {
                    __v: version,
                    data: initialValue,
                  };
                  storage.setItem(
                    key,
                    serialize(versionedData as unknown as T)
                  );
                } catch {
                  // Ignore save errors
                }
              });
            } catch (e) {
              if (typeof ngDevMode === 'undefined' || ngDevMode) {
                console.warn(
                  `SignalTree: Migration failed for "${key}" from legacy to v${version}`,
                  e
                );
              }
              if (clearOnMigrationFailure) {
                storage.removeItem(key);
              }
              initialValue = defaultValue;
            }
          } else {
            // No migration needed, use legacy data as-is
            initialValue = parsed as T;
          }
        }
      }
    } catch (e) {
      // Storage read failed, use default
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(`SignalTree: Failed to read "${key}" from storage`, e);
      }
    }
  }

  const sig = signal<T>(initialValue);
  const currentVersion = version;

  // Debounced save to storage - non-blocking via queueMicrotask
  let pendingWrite: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: T | undefined;

  const saveToStorage = (value: T): void => {
    if (!storage) return;

    // Wrap data with version metadata
    const versionedData: VersionedStorageData<T> = {
      __v: currentVersion,
      data: value,
    };

    // For immediate writes (debounceMs = 0), skip debouncing
    if (debounceMs === 0) {
      queueMicrotask(() => {
        try {
          storage.setItem(key, serialize(versionedData as unknown as T));
        } catch (e) {
          if (typeof ngDevMode === 'undefined' || ngDevMode) {
            console.warn(`SignalTree: Failed to save "${key}" to storage`, e);
          }
        }
      });
      return;
    }

    // Debounced write - coalesce rapid updates
    pendingValue = value;
    if (pendingWrite !== null) {
      clearTimeout(pendingWrite);
    }
    pendingWrite = setTimeout(() => {
      pendingWrite = null;
      queueMicrotask(() => {
        try {
          const finalData: VersionedStorageData<T> = {
            __v: currentVersion,
            data: pendingValue as T,
          };
          storage.setItem(key, serialize(finalData as unknown as T));
        } catch (e) {
          if (typeof ngDevMode === 'undefined' || ngDevMode) {
            console.warn(`SignalTree: Failed to save "${key}" to storage`, e);
          }
        }
      });
    }, debounceMs);
  };

  // Create the stored signal interface
  const storedSignal = (() => sig()) as StoredSignal<T>;

  storedSignal.set = (value: T): void => {
    sig.set(value); // Immediate signal update
    saveToStorage(value); // Debounced storage write
  };

  storedSignal.update = (fn: (current: T) => T): void => {
    const newValue = fn(sig());
    sig.set(newValue); // Immediate signal update
    saveToStorage(newValue); // Debounced storage write
  };

  storedSignal.clear = (): void => {
    sig.set(defaultValue);
    if (storage) {
      storage.removeItem(key);
    }
  };

  storedSignal.reload = (): void => {
    if (!storage) return;
    try {
      const storedRaw = storage.getItem(key);
      if (storedRaw !== null) {
        const parsed = deserialize(storedRaw);
        if (isVersionedData<T>(parsed)) {
          sig.set(parsed.data);
        } else {
          sig.set(parsed as T);
        }
      } else {
        sig.set(defaultValue);
      }
    } catch {
      sig.set(defaultValue);
    }
  };

  // Add readonly properties
  Object.defineProperty(storedSignal, 'key', { value: key, writable: false });
  Object.defineProperty(storedSignal, 'version', {
    value: currentVersion,
    writable: false,
  });

  return storedSignal;
}
