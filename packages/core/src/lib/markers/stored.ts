import { signal } from '@angular/core';

import { registerMarkerProcessor } from '../internals/materialize-markers';

/**
 * Stored Marker - Auto-sync to localStorage
 *
 * Creates a signal that automatically syncs to and from localStorage.
 * Supports custom serialization and SSR safety.
 *
 * @example
 * ```typescript
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
    },
  } = marker;

  // Determine storage - handle SSR (no localStorage)
  const storage =
    marker.options.storage !== undefined
      ? marker.options.storage
      : typeof localStorage !== 'undefined'
      ? localStorage
      : null;

  // Load initial value from storage
  let initialValue = defaultValue;
  if (storage) {
    try {
      const storedValue = storage.getItem(key);
      if (storedValue !== null) {
        initialValue = deserialize(storedValue);
      }
    } catch (e) {
      // Storage read failed, use default
      if (typeof ngDevMode === 'undefined' || ngDevMode) {
        console.warn(`SignalTree: Failed to read "${key}" from storage`, e);
      }
    }
  }

  const sig = signal<T>(initialValue);

  // Debounced save to storage - non-blocking via queueMicrotask
  let pendingWrite: ReturnType<typeof setTimeout> | null = null;
  let pendingValue: T | undefined;

  const saveToStorage = (value: T): void => {
    if (!storage) return;

    // For immediate writes (debounceMs = 0), skip debouncing
    if (debounceMs === 0) {
      queueMicrotask(() => {
        try {
          storage.setItem(key, serialize(value));
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
          storage.setItem(key, serialize(pendingValue as T));
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
      const storedValue = storage.getItem(key);
      if (storedValue !== null) {
        sig.set(deserialize(storedValue));
      } else {
        sig.set(defaultValue);
      }
    } catch {
      sig.set(defaultValue);
    }
  };

  return storedSignal;
}
