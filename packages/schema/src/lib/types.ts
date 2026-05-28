import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Signal } from '@angular/core';
import type { UpdateMetadata } from '@signaltree/core';

/**
 * Dotted path with optional `*` segments for entity collections.
 *
 * @example `user.email`
 * @example `users.*.email` — matches every entity in the `users` map
 * @example `orders.*.items.*.qty` — nested wildcards
 */
export type SchemaPath = string;

/**
 * Configuration for the `schema()` enhancer.
 */
export interface SchemaConfig {
  /**
   * Path-keyed schema registry. Wildcards expand against current tree state
   * via lazy match-on-write.
   */
  schemas: Readonly<Record<SchemaPath, StandardSchemaV1>>;

  /**
   * Reporter behavior. The enhancer never rejects writes; modes only affect
   * side-effect logging.
   *
   * - `'accept'` (default) — verdicts populate signals; no logging.
   * - `'warn'` — verdicts populate signals AND invoke `onError` (defaults to `console.warn`).
   *
   * @default 'accept'
   */
  mode?: 'accept' | 'warn';

  /**
   * Run an initial validation pass on attach. Sync schemas populate verdicts
   * synchronously; async schemas populate after their promises settle.
   *
   * @default true
   */
  validateOnAttach?: boolean;

  /**
   * Suppress validation for writes whose ambient context's `intent` is in
   * this list. Read via `getActiveWriteContext()` from `@signaltree/core`.
   */
  suppressIntents?: ReadonlyArray<NonNullable<UpdateMetadata['intent']>>;

  /**
   * Suppress validation for writes whose ambient context's `source` is in
   * this list. Read via `getActiveWriteContext()` from `@signaltree/core`.
   *
   * NOTE: do not include `'serialization'` — deserialize is the canonical
   * ingest case validation exists for.
   */
  suppressSources?: ReadonlyArray<NonNullable<UpdateMetadata['source']>>;

  /**
   * Optional reporter for `mode: 'warn'` and runtime errors. Receives the
   * leaf path and surfaced message. Defaults to `console.warn` when
   * `mode === 'warn'`; a no-op otherwise.
   */
  onError?: (path: string, message: string) => void;

  /**
   * Optional custom extractor for the surfaced error message from a single
   * issue. Defaults to `issue.message`.
   */
  formatIssue?: (
    issue: StandardSchemaV1.Issue,
    path: string
  ) => string;
}

/**
 * Methods exposed on the tree by the `schema()` enhancer.
 */
export interface SchemaMethods {
  schema: {
    // --- Settled state ---

    /** Path → message of last settled run; `null` if valid. */
    readonly errors: Signal<Readonly<Record<string, string | null>>>;

    /** Flat list of currently-settled non-null error messages. */
    readonly errorList: Signal<readonly string[]>;

    /**
     * True iff every path's last-settled verdict is valid. Pending paths use
     * their last-settled verdict (no transient flicker while async runs).
     *
     * O(1) per read — backed by an invalid-count counter maintained inside
     * the verdict applier.
     */
    readonly isValid: Signal<boolean>;

    // --- In-flight state ---

    /** True iff any path has an in-flight async validation run. */
    readonly pending: Signal<boolean>;

    /** Paths currently being validated. */
    readonly pendingPaths: Signal<readonly string[]>;

    // --- Per-path access (memoized) ---

    /**
     * Returns the error signal for a leaf path. Same `Signal` instance is
     * returned across calls for the same path (memoized).
     */
    errorsAt(path: string): Signal<string | null>;

    /** Returns `true` when the path's last-settled verdict has no error. */
    isValidAt(path: string): Signal<boolean>;

    /** Returns `true` when the path has an in-flight async run. */
    isPendingAt(path: string): Signal<boolean>;

    // --- Imperative ---

    /**
     * Re-run every registered schema. Bumps each leaf's `version`, which
     * orphans any in-flight runs (their verdicts are dropped on settle).
     * Resolves to the current `isValid()` after all dispatched runs complete.
     *
     * NOTE: bumping version supersedes — it does not abort. Async schemas
     * that hit a network run to completion before being discarded. Callers
     * invoking `validate()` per keystroke should debounce.
     */
    validate(): Promise<boolean>;

    /**
     * Re-run the schema(s) bound to a single leaf path. Same supersede-not-cancel
     * semantics as {@link validate}.
     */
    validatePath(path: string): Promise<boolean>;

    /**
     * Evict `PathState` and memoized signals for paths that no longer resolve
     * in the current tree. Manual GC.
     *
     * Necessary because the enhancer cannot observe entity removal directly;
     * deferred-eviction keeps state bounded by distinct leaf paths ever
     * written, not by current entity count.
     */
    compact(): void;

    // --- Bridge integration (consumed by signalFormBridge in @signaltree/ng-forms) ---

    /**
     * Resolve the schema bound to a leaf path (after wildcard expansion).
     * Returns `undefined` if no schema claims this leaf.
     *
     * @internal — Intended for bridges, not application code.
     */
    schemaFor(leafPath: string): StandardSchemaV1 | undefined;

    /**
     * Reactive list of all currently-bound leaf paths. A `Signal` so bridges
     * can subscribe and rebind when wildcards expand or paths evict.
     *
     * @internal — Intended for bridges, not application code.
     */
    readonly boundPaths: Signal<readonly string[]>;
  };
}
