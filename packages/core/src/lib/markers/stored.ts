import { signal } from '@angular/core';

import { registerBuiltinMarkerProcessor } from '../internals/materialize-markers';

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
 * // Force a pending debounced write to commit right now
 * tree.$.theme.flush();
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
  /**
   * Debounce delay in ms for writes (default: 100).
   * Set to 0 for immediate, synchronous writes in the caller's stack —
   * equivalent durability to calling `storage.setItem` yourself.
   */
  debounceMs?: number;
  /**
   * Upper bound in ms on how long successive updates may delay a pending
   * write. Plain debouncing resets the timer on every update, so a key
   * updated faster than `debounceMs` is never persisted until updates stop;
   * `maxWaitMs` guarantees a write at most this long after the first
   * unpersisted update. Ignored when `debounceMs` is 0.
   */
  maxWaitMs?: number;
  /**
   * Called when a storage operation fails (read, write, or migration).
   * When provided it replaces the default dev-mode `console.warn` — which
   * is compiled out of production builds, where failures would otherwise
   * be completely silent.
   */
  onError?: (error: unknown, context: StoredErrorContext) => void;
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
 * Context passed to a {@link StoredOptions.onError} handler.
 */
export interface StoredErrorContext {
  /** The storage key the failed operation targeted. */
  key: string;
  /** Which storage operation failed. */
  operation: 'read' | 'write' | 'migrate';
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
  /** Clear from storage and reset to default (cancels any pending write) */
  clear(): void;
  /** Force reload from storage, running migrations if the stored version differs (cancels any pending write) */
  reload(): void;
  /**
   * Commit any pending debounced write to storage synchronously.
   * No-op when nothing is pending. Called automatically for all stored
   * signals when the page is hidden or unloaded, so debounced values are
   * not lost when the app is backgrounded or killed.
   */
  flush(): void;
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
    registerBuiltinMarkerProcessor(isStoredMarker, createStoredSignal);
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
// LIFECYCLE DRAIN
// =============================================================================

/**
 * @internal - Flush hooks for every live stored signal with debounced writes.
 * Stored signals have no dispose hook (they live as long as their tree,
 * typically the app), so entries are never removed; each holds only a small
 * closure and flushing with nothing pending is a no-op.
 */
const activeStoredFlushers = new Set<() => void>();

/** @internal */
let lifecycleFlushInstalled = false;

/**
 * @internal - Installs a single pair of page-lifecycle listeners that drain
 * all pending stored writes when the page is hidden or unloading.
 * `visibilitychange` → hidden is the reliable signal on mobile/Capacitor
 * (fired before the WebView is suspended); `pagehide` covers desktop
 * navigation. SSR-safe: no-op without a DOM.
 */
function installLifecycleFlush(): void {
  if (lifecycleFlushInstalled) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  lifecycleFlushInstalled = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAllStoredSignals();
  });
  window.addEventListener('pagehide', () => flushAllStoredSignals());
}

/**
 * Synchronously commits every pending debounced write across all stored
 * signals. Runs automatically on `visibilitychange` → hidden and `pagehide`;
 * call it manually from native lifecycle hooks the DOM can't see
 * (e.g. Capacitor's `App.addListener('pause', ...)`).
 */
export function flushAllStoredSignals(): void {
  for (const flush of activeStoredFlushers) flush();
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
      maxWaitMs,
      version = 1,
      migrate,
      clearOnMigrationFailure = false,
      onError,
    },
  } = marker;

  // Determine storage - handle SSR (no localStorage)
  const storage =
    marker.options.storage !== undefined
      ? marker.options.storage
      : typeof localStorage !== 'undefined'
      ? localStorage
      : null;

  const currentVersion = version;

  // Monotonic count of committed writes - used to drop a deferred migration
  // persist that would otherwise clobber data written after it was scheduled.
  let writeGeneration = 0;

  const reportError = (
    operation: StoredErrorContext['operation'],
    error: unknown,
    devMessage: string
  ): void => {
    if (onError) {
      try {
        onError(error, { key, operation });
      } catch {
        // A failing error handler must not break persistence
      }
      return;
    }
    if (typeof ngDevMode === 'undefined' || ngDevMode) {
      console.warn(devMessage, error);
    }
  };

  // Synchronous versioned write - the single point where storage is touched
  const writeNow = (value: T): void => {
    if (!storage) return;
    writeGeneration++;
    try {
      const versionedData: VersionedStorageData<T> = {
        __v: currentVersion,
        data: value,
      };
      storage.setItem(key, serialize(versionedData as unknown as T));
    } catch (e) {
      reportError(
        'write',
        e,
        `SignalTree: Failed to save "${key}" to storage`
      );
    }
  };

  // Persist migrated data without blocking the caller (init or reload).
  // Skipped if the app wrote (or has queued) newer data in the meantime.
  const persistMigrated = (data: T): void => {
    const generationAtSchedule = writeGeneration;
    queueMicrotask(() => {
      if (writeGeneration !== generationAtSchedule || hasPending) return;
      writeNow(data);
    });
  };

  // Read + migrate. Shared by init and reload() so both apply the same
  // versioning rules.
  const loadFromStorage = (): T => {
    if (!storage) return defaultValue;
    try {
      const storedRaw = storage.getItem(key);
      if (storedRaw === null) return defaultValue;
      const parsed = deserialize(storedRaw);

      // Check if data has version metadata
      if (isVersionedData<T>(parsed)) {
        const storedVersion = parsed.__v;
        let data = parsed.data;

        // Run migration if versions differ
        if (storedVersion !== version && migrate) {
          try {
            data = migrate(data, storedVersion);
            persistMigrated(data);
          } catch (e) {
            reportError(
              'migrate',
              e,
              `SignalTree: Migration failed for "${key}" from v${storedVersion} to v${version}`
            );
            if (clearOnMigrationFailure) {
              storage.removeItem(key);
            }
            return defaultValue;
          }
        }
        return data;
      }

      // Legacy data without version - treat as v0 and migrate if needed
      if (migrate && version > 0) {
        try {
          const migrated = migrate(parsed, 0);
          persistMigrated(migrated);
          return migrated;
        } catch (e) {
          reportError(
            'migrate',
            e,
            `SignalTree: Migration failed for "${key}" from legacy to v${version}`
          );
          if (clearOnMigrationFailure) {
            storage.removeItem(key);
          }
          return defaultValue;
        }
      }

      // No migration needed, use legacy data as-is
      return parsed as T;
    } catch (e) {
      reportError(
        'read',
        e,
        `SignalTree: Failed to read "${key}" from storage`
      );
      return defaultValue;
    }
  };

  const sig = signal<T>(loadFromStorage());

  // Debounced write state. `hasPending` (not `pendingValue !== undefined`)
  // tracks pending-ness so that `undefined` remains a legal stored value.
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: T | undefined;
  let hasPending = false;

  const cancelPending = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
    hasPending = false;
    pendingValue = undefined;
  };

  const commitPending = (): void => {
    if (!hasPending) return;
    const value = pendingValue as T;
    cancelPending();
    writeNow(value);
  };

  const saveToStorage = (value: T): void => {
    if (!storage) return;

    // Immediate mode: write synchronously in the caller's stack, so the
    // value is durable the moment set() returns.
    if (debounceMs === 0) {
      writeNow(value);
      return;
    }

    // Debounced write - coalesce rapid updates to a single write
    pendingValue = value;
    hasPending = true;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(commitPending, debounceMs);

    // maxWait timer starts on the first unpersisted update and is NOT reset
    // by later updates - bounds staleness under continuous writes.
    if (maxWaitMs !== undefined && maxWaitTimer === null) {
      maxWaitTimer = setTimeout(commitPending, maxWaitMs);
    }
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
    cancelPending(); // A pending write must not resurrect the cleared value
    sig.set(defaultValue);
    if (storage) {
      try {
        storage.removeItem(key);
      } catch (e) {
        reportError(
          'write',
          e,
          `SignalTree: Failed to remove "${key}" from storage`
        );
      }
    }
  };

  storedSignal.reload = (): void => {
    if (!storage) return;
    cancelPending(); // Storage is the source of truth for a reload
    sig.set(loadFromStorage());
  };

  storedSignal.flush = commitPending;

  // Drain pending writes when the page is hidden/unloaded so a debounced
  // value can't be lost to a background/kill (mobile WebViews in particular).
  if (storage && debounceMs > 0) {
    activeStoredFlushers.add(commitPending);
    installLifecycleFlush();
  }

  // Add readonly properties
  Object.defineProperty(storedSignal, 'key', { value: key, writable: false });
  Object.defineProperty(storedSignal, 'version', {
    value: currentVersion,
    writable: false,
  });

  return storedSignal;
}
