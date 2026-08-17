import { signal, untracked } from '@angular/core';
import { reportTreeError } from '../internals/error-reporter';
import {
  defineIntrinsicMutationEmitter,
  defineOwnedOwnerPath,
  defineOwnedPositionIds,
  runOwnedMutation,
  wrapOwnedWritableSignal,
} from '../internals/owned-mutation';

import { getActiveWriteContext } from '../write-context';
import { deferCommitConsequence } from '../internals/commit-consequence';

declare const ngDevMode: boolean | undefined;

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
   *
   * Inside an explicit `transaction()` this guarantee is deliberately
   * suspended: persistence is post-commit, so the write is held until the
   * transaction is confirmed and dropped entirely if it is rolled back. A
   * transaction that is never settled never persists. Outside a transaction
   * the write still commits in its own stack, so `0` is durable the moment
   * `set()` returns exactly as before.
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
 * Outcome of a {@link StoredSignal.reload}.
 *
 * `'error'` deliberately leaves the unreadable data in storage rather than
 * destroying something a human could still recover; the signal falls back to
 * its default, so signal and storage disagree until the next write. Handle it
 * (or `onError` with `operation: 'read'`) if your app needs them reconciled.
 */
export type StoredReloadResult = 'ok' | 'default' | 'error';

/**
 * Context passed to a {@link StoredOptions.onError} handler.
 */
export interface StoredErrorContext {
  /** The storage key the failed operation targeted. */
  key: string;
  /** Which storage operation failed. */
  operation: 'read' | 'write' | 'migrate' | 'remove';
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
  /**
   * Force reload from storage, running migrations if the stored version
   * differs (cancels any pending write).
   *
   * @returns what the reload found — `'ok'` when a stored value was read,
   * `'default'` when the key was absent, `'error'` when the stored data could
   * not be read or migrated (the signal falls back to the default and storage
   * is left untouched, so the two disagree until something writes).
   */
  reload(): StoredReloadResult;
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
 * ST2020 — two `stored()` markers on the same storage key.
 *
 * Each `stored()` creates its OWN signal. Two markers sharing a key both read
 * the same slot at construction and both write to it, but neither observes the
 * other: set one and the other keeps its stale value until something forces it
 * to re-read. The two then race on write, and last-writer-wins silently.
 *
 * Warned rather than merged, deliberately. Interning the signal per key looks
 * like the fix and is wrong: two calls may carry conflicting `defaultValue`,
 * `version` or `migrate`, and there is no correct way to merge those. A
 * per-key generation counter is worse — it puts a map lookup on `sig()`, the
 * hottest path in the library, and makes a signal read perform I/O.
 *
 * Dev-only, and the registry is dev-only too so production allocates nothing.
 * Capped so a key generated in a loop cannot grow it without bound.
 */
const STORED_KEYS_SEEN = new Set<string>();
const STORED_KEYS_WARNED = new Set<string>();
const STORED_KEY_CAP = 512;

function warnDuplicateStoredKey(key: string): void {
  if (typeof ngDevMode !== 'undefined' && !ngDevMode) return;
  if (STORED_KEYS_SEEN.has(key)) {
    if (STORED_KEYS_WARNED.has(key)) return;
    STORED_KEYS_WARNED.add(key);
    console.warn(
      `SignalTree: stored("${key}") was created more than once. Each call makes ` +
        `its OWN signal — they do not observe each other, so one will hold a ` +
        `stale value and they will race on write. Create the marker once and ` +
        `share the tree node, or use distinct keys. [ST2020]`
    );
    return;
  }
  if (STORED_KEYS_SEEN.size >= STORED_KEY_CAP) return;
  STORED_KEYS_SEEN.add(key);
}

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
 * ## Known limitations
 *
 * A materialized `StoredSignal` is a plain callable function — neither an
 * Angular signal nor a `NodeAccessor`. Tree traversal recognises those two
 * shapes, so a stored leaf is invisible to it:
 *
 * - **`tree()` / `unwrap()` skip stored values.** A top-level stored leaf is
 *   omitted from the snapshot; a nested one can surface the raw marker object
 *   (including the `Storage` instance) instead of its value. Anything that
 *   snapshots a tree — `serialization()`, `persistence()`, devtools, audit —
 *   inherits this. Read stored values directly (`tree.$.theme()`).
 * - **Writing through a parent silently no-ops.** `tree.$.settings({ theme })`
 *   does not reach a `stored()` leaf beneath it: the deep-merge tests for
 *   signal-ness then node-ness and a stored signal matches neither, so the
 *   write is dropped with no error. Use `tree.$.settings.theme.set(...)`.
 * - **Two stored signals on one key are independent.** Last write wins and
 *   `clear()` on one leaves the other reporting a stale value; there is no
 *   cross-signal coherence.
 * - **`reload()` on unparseable data** resets the signal to its default but
 *   deliberately leaves storage untouched, so the two disagree until written.
 *   `reload()` returns `'error'` in that case, and `onError` fires with
 *   `operation: 'read'`, so an app that needs them reconciled can act:
 *   `if (sig.reload() === 'error') sig.set(sig());` — destroying unreadable
 *   data is a policy choice, so it is left to the caller rather than assumed.
 *
 * A note on the duplicate-key case: a dev-mode warning was tried and removed.
 * The registry can only see that a key was claimed before, not whether the
 * earlier signal is still alive — so it fired on the entirely legitimate
 * pattern of a per-route tree being destroyed and recreated on navigation.
 * A warning that cries wolf on normal usage is worse than none; detecting it
 * properly needs liveness tracking that is not worth its complexity here.
 *
 * These predate the 13.3 durability work and are documented rather than
 * silently patched, because fixing the first two means changing core traversal.
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
    registerBuiltinMarkerProcessor(isStoredMarker, createStoredSignal, {
      // `transient` here means "I need no snapshot hook", not "I have no
      // state". A materialised `stored()` IS a real Angular `WritableSignal`,
      // so the ordinary leaf walk already reads it, writes it, and records it
      // for undo/redo — verified: undo of a stored() value works.
      //
      // It is also the one marker that OWNS ITS SOURCE. On a fresh tree it
      // re-reads its own storage during construction, before any snapshot
      // arrives — verified: a new tree with no snapshot applied still returns
      // the persisted value. So a cross-process rehydrate has nothing to do.
      //
      // Declared explicitly rather than left blank so it does not read as an
      // oversight, and so ST2022 stays meaningful.
      transient: true,
    });
  }

  warnDuplicateStoredKey(key);

  const marker = {
    [STORED_MARKER]: true,
    key,
    defaultValue,
  } as StoredMarker<T>;

  // `options` is NON-ENUMERABLE, and that is a security property rather than a
  // style choice.
  //
  // It holds the caller's `storage` object. A raw marker that reaches a
  // snapshot gets deep-copied by `unwrap`, which enumerates own keys — so an
  // enumerable `options` carried the CONTENTS of that storage into `tree()`,
  // and from there into serialization(), persistence(), devtools payloads and
  // audit logs:
  //
  //   {"list":[{"key":"k","options":{"storage":{"auth-token":"SECRET-JWT"}}}]}
  //
  // 13.4.0 closed the paths where a raw marker could escape at the top level or
  // nested in an object, but a marker inside an ARRAY is never materialised, so
  // it still escaped. Rather than chase each traversal, the payload itself is
  // now invisible to enumeration: `Object.keys`, spread, `JSON.stringify` and
  // `unwrap` all skip it, while `createStoredSignal` reads `marker.options`
  // directly and is unaffected.
  Object.defineProperty(marker, 'options', {
    value: options,
    enumerable: false,
    writable: false,
    configurable: true,
  });

  return marker;
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
 * @internal - Commit hooks for stored signals that currently have an
 * UNPERSISTED write. Membership tracks pending-ness, not signal lifetime:
 * a signal joins when a debounced write is armed and leaves the moment that
 * write commits or is cancelled.
 *
 * Why not "every live stored signal": that registration is a side effect with
 * page lifetime created by a tree-scoped factory, so it outlived its tree
 * (`signalTree()` has `destroy()`, and per-route/per-dialog trees are
 * routine), retaining the `Storage` backend, the marker's `defaultValue`, the
 * signal's current value and any user callbacks — a measurable leak.
 *
 * Why not a `WeakRef` to the signal either: the drain needs `commitPending`,
 * and `commitPending` does not reference the signal, so the signal is
 * collectable while its write is still armed. The deref would then yield
 * `undefined` and the value would be dropped — and GC at page-hide is exactly
 * when a mobile WebView both collects and stops firing timers, so that is the
 * common case, not a corner one. Weakness must not be able to outrace
 * durability.
 *
 * Scoping to pending writes gives both properties with a strong ref: idle
 * signals are not registered at all (nothing to leak), and anything with an
 * unpersisted value is guaranteed reachable by the drain. The set is bounded
 * by the number of keys written within one debounce window.
 */
const pendingStoredWrites = new Set<() => void>();

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
  // Iterate the LIVE set, not a copy. JS Set iteration already does both
  // things a copy would be taken for: removing the current entry mid-iteration
  // is safe, and entries added during iteration ARE visited. Iterating a copy
  // instead loses that second property — a signal that becomes pending during
  // the drain (an onError handler writing a fallback key, say) would be missed
  // and left in the set, which is both a lost write and a retained reference,
  // at the one moment the timer will never fire to clean it up.
  //
  // The try/catch is for anything that escapes writeNow's own error handling
  // (e.g. an instrumented console), which would otherwise abandon every signal
  // after it in the drain.
  for (const commit of pendingStoredWrites) {
    try {
      commit();
    } catch {
      // Keep draining the rest.
    }
  }
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
  marker: StoredMarker<T>,
  _notifier?: unknown,
  path?: string,
  context?: {
    positionTopologyEnabled?: boolean;
    hasCapability?: (capability: 'mutation-capture' | 'position-topology') => boolean;
    allocatePositionId: (parentPositionId?: number) => number;
    /**
     * Per-tree identity. Kept `unknown` because this marker only ever compares
     * it by reference — it proves which tree a write belongs to, and must not
     * grow a dependency on the registry's shape.
     */
    positionRegistry?: unknown;
  },
  parentPositionId?: number
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
  const hasPositionTopology =
    context?.hasCapability?.('position-topology') ??
    context?.positionTopologyEnabled !== false;
  const hasMutationCapture =
    context?.hasCapability?.('mutation-capture') ?? Boolean(path);
  const positionIds =
    !hasPositionTopology
      ? undefined
      : context
      ? [context.allocatePositionId(parentPositionId)]
      : undefined;
  const ownerPath = path;
  // This node's own tree identity, used to prove that an ambient transaction
  // scope actually owns this signal's durable consequences.
  const ownerRegistry = context?.positionRegistry;

  /**
   * Monotonic count of AUTHORED durable operations on this signal — writes and
   * clears alike, deferred or immediate.
   *
   * A deferred consequence runs when its scope settles, and settle order is
   * confirm order, not authoring order. Without a sequence, an older pending
   * confirmed after a newer one replays a stale operation over a newer one:
   * a superseded value overwrites the current one, or a deferred `clear()`
   * deletes a key a later committed write had just populated. Comparing the
   * captured sequence against the latest makes a superseded consequence a
   * no-op, so settle order stops mattering.
   */
  let authoredSeq = 0;

  // Monotonic count of committed writes - used to drop a deferred migration
  // persist that would otherwise clobber data written after it was scheduled.
  let writeGeneration = 0;

  const reportError = (
    operation: StoredErrorContext['operation'],
    error: unknown,
    devMessage: string
  ): void => {
    // Global observation FIRST, and unconditionally — an app reporting to Sentry
    // must see the error whether or not this marker also has a local onError.
    // Reporting cannot throw; see reportTreeError.
    reportTreeError({
      error,
      source: 'stored',
      operation,
      path: key,
      detail:
        typeof ngDevMode === 'undefined' || ngDevMode ? devMessage : undefined,
    });

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

  // Synchronous versioned write - the single point where storage is WRITTEN.
  // (Not the only point where storage is touched: `removeNow` deletes the key
  // for clear(). Both go through the same commit-consequence boundary.)
  const writeNow = (value: T): void => {
    if (!storage) return;

    // A devtools replay must not touch the user's storage.
    //
    // Rewinding writes through — measured: set 'dark', rewind to 'light', and
    // localStorage holds 'light'. That is CORRECT for an undo (the user is
    // undoing the persisted change as well) and wrong for a devtools scrub,
    // where the user is inspecting history and would be astonished to find
    // their settings rewritten by dragging a slider.
    //
    // The two were indistinguishable because devtools tagged its replays
    // `source: 'time-travel'`, the same as undo. It now sends `'devtools'` —
    // a value that was already in the union and simply unused — so this needs
    // no new mode and no new option.
    if (getActiveWriteContext()?.source === 'devtools') return;
    writeGeneration++;
    try {
      const versionedData: VersionedStorageData<T> = {
        __v: currentVersion,
        data: value,
      };
      storage.setItem(key, serialize(versionedData as unknown as T));
    } catch (e) {
      reportError('write', e, `SignalTree: Failed to save "${key}" to storage`);
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
  let lastLoadResult: StoredReloadResult = 'default';

  const loadFromStorage = (): T => {
    lastLoadResult = 'default';
    if (!storage) return defaultValue;
    try {
      const storedRaw = storage.getItem(key);
      if (storedRaw === null) return defaultValue;
      lastLoadResult = 'ok';
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
            lastLoadResult = 'error';
            return defaultValue;
          }
        } else if (storedVersion !== version) {
          // Version mismatch with NO migrator: the data was written by a
          // different schema and is being handed to code expecting this one.
          // It still loads (dropping a user's data would be worse), but the
          // caller must be able to tell — this is the likeliest field case,
          // someone bumping `version` and forgetting the migrator, and
          // reporting 'ok' for it defeats the point of the return value.
          lastLoadResult = 'error';
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
          lastLoadResult = 'error';
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
      lastLoadResult = 'error';
      return defaultValue;
    }
  };

  const sig = signal<T>(loadFromStorage());

  // Debounced write state. `hasPending` (not `pendingValue !== undefined`)
  // tracks pending-ness, so a pending `undefined` is distinguishable from
  // nothing pending. (That only makes the *scheduling* correct — `undefined`
  // still does not survive a round trip through the default JSON serializer,
  // which drops the key entirely.)
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
    // Nothing unpersisted left — stop holding this signal's graph alive.
    pendingStoredWrites.delete(commitPending);
  };

  const commitPending = (): void => {
    if (!hasPending) return;
    const value = pendingValue as T;
    cancelPending(); // also deregisters
    writeNow(value);
  };

  // Durable write, once the value is known to be committed truth.
  const saveCommitted = (value: T): void => {
    // Immediate mode: write synchronously in the caller's stack, so the
    // value is durable the moment set() returns.
    if (debounceMs === 0) {
      writeNow(value);
      return;
    }

    scheduleDebounced(value);
  };

  const saveToStorage = (value: T): void => {
    if (!storage) return;

    // Persistence is post-commit. A write made inside an explicit transaction
    // is speculative until that transaction is confirmed, so it is queued as a
    // commit consequence rather than written here. Writes to this same signal
    // later in the transaction replace the queued one, so storage sees a
    // single coherent value per key instead of every intermediate.
    //
    // Outside a transaction there is nothing to wait for: the write commits in
    // its own stack, so it falls straight through and `debounceMs: 0` keeps
    // its same-stack durability guarantee.
    // A DEFERRED consequence must resolve committed truth when it RUNS, not
    // capture what was authored. Overlapping transactions on one tree are a
    // designed-for case — only NESTED ones are refused — and they may confirm
    // out of authoring order, which made the last SETTLED scope win rather than
    // the last authored operation.
    const seq = ++authoredSeq;
    if (
      deferDurableConsequence(() => {
        if (seq !== authoredSeq) return; // superseded by a later operation
        saveCommitted(untracked(() => sig()));
      })
    ) {
      return;
    }

    saveCommitted(value);
  };

  /**
   * Queue `effect` as a consequence of the transaction this write belongs to,
   * or report that it belongs to none.
   *
   * The write context is ambient, so an open transaction is not by itself
   * evidence that this signal's write is speculative under it — a write to
   * THIS tree made inside ANOTHER tree's callback would otherwise be absorbed
   * by a scope that cannot compensate it. `ownerRegistry` is this node's own
   * per-tree position registry and lets the scope prove ownership.
   */
  const deferDurableConsequence = (effect: () => void): boolean => {
    const meta = getActiveWriteContext();
    const owner = meta?.transactionOwner;
    const transactionId = meta?.transactionId;
    return (
      owner !== undefined &&
      typeof transactionId === 'number' &&
      deferCommitConsequence(owner, transactionId, sig, effect, ownerRegistry)
    );
  };

  const scheduleDebounced = (value: T): void => {
    // Debounced write - coalesce rapid updates to a single write
    pendingValue = value;
    hasPending = true;
    // Reachable for the lifecycle drain for exactly as long as this value is
    // unpersisted. The timer alone is not enough: on WebView suspension it
    // never fires, which is the whole reason the drain exists.
    pendingStoredWrites.add(commitPending);
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

  // The stored signal IS the Angular signal, not a wrapper around it.
  //
  // It used to be `(() => sig())` with methods bolted on — a plain callable
  // that satisfied neither `isSignal` nor `isNodeAccessor`. Every traversal in
  // the library branches on exactly those two guards, so a stored leaf fell
  // through all of them: omitted from `tree()`/`unwrap()`, skipped by a merge
  // write through its parent, and REPLACED with a raw value by `applyState`
  // (the devtools replay path), after which reading it threw.
  //
  // Conforming to the protocol that already exists fixes every one of those at
  // once, with no changes outside this file, because `unwrap`,
  // `recursiveUpdate`, `applyState`, `serialization`, `enterprise/path-index`,
  // `schema/matcher` and `ng-forms` all already handle a real signal.
  const storedSignal = sig as unknown as StoredSignal<T>;

  if (positionIds) {
    defineOwnedPositionIds(storedSignal as object, positionIds);
  }
  if (ownerPath && hasMutationCapture) {
    defineOwnedOwnerPath(storedSignal as object, ownerPath);
    defineIntrinsicMutationEmitter(storedSignal as object);
  }

  // Capture the raw signal writers BEFORE overriding them, so the persisting
  // versions below don't recurse into themselves.
  const rawSet = sig.set.bind(sig);

  if (ownerPath && hasMutationCapture) {
    wrapOwnedWritableSignal(sig, {
      path: ownerPath,
      ownerPath,
      positionIds,
    }, {
      afterSet: (value) => {
        saveToStorage(value);
      },
      afterUpdate: (_before, after) => {
        saveToStorage(after);
      },
    });
  } else {
    storedSignal.set = (value: T): void => {
      rawSet(value);
      saveToStorage(value);
    };

    storedSignal.update = (fn: (current: T) => T): void => {
      const newValue = fn(untracked(() => sig()));
      rawSet(newValue);
      saveToStorage(newValue);
    };
  }

  storedSignal.clear = (): void => {
    // Cancel BOTH deferred write paths. The debounce/maxWait timers are
    // cancellable; the migration re-persist is a queued microtask that is not,
    // so bumping the generation makes it a no-op when it runs. Without this a
    // clear() in the same tick as a version migration is undone one microtask
    // later — the key comes back and the signal disagrees with storage.
    cancelPending();
    writeGeneration++;
    if (ownerPath && hasMutationCapture) {
      runOwnedMutation(
        sig,
        () => rawSet(defaultValue),
        {
          path: ownerPath,
          ownerPath,
          positionIds,
        },
        'set',
        'replace'
      );
    } else {
      rawSet(defaultValue);
    }
    if (storage) {
      // Removing the key is a durable consequence exactly as writing it is, so
      // it obeys the same boundary: inside an owning transaction it waits for
      // the commit and is dropped on discard. It shares the `sig` consequence
      // key with the write path, so a clear() supersedes any queued write to
      // this signal in the same transaction, and vice versa — last one wins,
      // which is what the tree ends up showing.
      //
      // Across SCOPES the same sequence guard as the write path applies, or a
      // clear deferred in an older pending would delete a key that a newer,
      // already-confirmed transaction had legitimately written.
      const seq = ++authoredSeq;
      const deferred = deferDurableConsequence(() => {
        if (seq !== authoredSeq) return; // superseded by a later operation
        removeNow();
      });
      if (!deferred) removeNow();
    }
  };

  function removeNow(): void {
    if (!storage) return;
    try {
      storage.removeItem(key);
    } catch (e) {
      reportError(
        'remove',
        e,
        `SignalTree: Failed to remove "${key}" from storage`
      );
    }
  }

  storedSignal.reload = (): StoredReloadResult => {
    if (!storage) return 'default';
    // Same reasoning as clear(): storage is authoritative for a reload, so no
    // earlier deferred write — timer or migration microtask — may land after it.
    cancelPending();
    writeGeneration++;
    const nextValue = loadFromStorage();
    if (ownerPath && hasMutationCapture) {
      runOwnedMutation(
        sig,
        () => rawSet(nextValue),
        {
          path: ownerPath,
          ownerPath,
          positionIds,
        },
        'set',
        'replace'
      );
    } else {
      rawSet(nextValue);
    }
    return lastLoadResult;
  };

  storedSignal.flush = commitPending;

  // Install the page-lifecycle listeners so a debounced value can't be lost to
  // a background/kill (mobile WebViews in particular). This signal enrols in
  // the drain only while it actually has an unpersisted write — see
  // `pendingStoredWrites`.
  if (storage && debounceMs > 0) {
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
