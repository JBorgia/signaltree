/**
 * `stored()` — the FRAMEWORK-NEUTRAL half: identity, descriptor shape, and the
 * type guard.
 *
 * Same split as `async-source.contract.ts`, applied to the marker whose
 * realization carries the persistence machinery frozen at GATE A. Nothing about
 * that machinery moves: this file contains no storage access, no debounce, no
 * commit-consequence scheduling and no write-context reads. It is the contract
 * an extension author needs in order to RECOGNISE and DESCRIBE a stored marker,
 * and nothing that makes one work.
 *
 * WHAT DELIBERATELY STAYS in `stored.ts`:
 *
 *   - `stored()` — the authorship factory. It returns an inert descriptor, but
 *     it also lazily registers the builtin processor on first call, and that
 *     registration names `createStoredSignal`. Moving the factory here would
 *     invert the dependency this file exists to establish. The laziness is
 *     load-bearing: it keeps the persistence machinery out of a bundle that
 *     never calls `stored()`.
 *   - `createStoredSignal`, `StoredSignal`, `flushAllStoredSignals`, the
 *     lifecycle drain, and every persistence consequence.
 *   - `createStorageKeys` / `clearStoragePrefix` — they touch `Storage` at
 *     runtime. Neutral of Angular, but they are realization utilities and the
 *     authoring SDK does not need them; moving anything merely because it looks
 *     like configuration is how a contract module quietly grows a runtime.
 *
 * Direction is strictly one-way: realization imports contract, never the
 * reverse. Importing this file registers nothing.
 */

export const STORED_MARKER = Symbol('STORED_MARKER');

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
 * Stored marker - placeholder in source state.
 */
export interface StoredMarker<T> {
  [STORED_MARKER]: true;
  key: string;
  defaultValue: T;
  options: StoredOptions<T>;
}

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
