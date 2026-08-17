import { Signal, WritableSignal } from '@angular/core';

import { AsyncQueryMarker, AsyncQuerySignal } from './markers/async-query';
import { AsyncSourceMarker, AsyncSourceSignal } from './markers/async-source';
import type { EntityLoaderSurface } from './markers/entity-loader';
import { FormMarker, FormSignal } from './markers/form';
import { StatusMarker, StatusSignal } from './markers/status';
import { StoredMarker, StoredSignal } from './markers/stored';

/**
 * Metadata describing the intent and source of a tree update.
 *
 * Set ambient context for enhancers using `withWriteContext({...}, () => tree.$.x.set(y))`
 * from `@signaltree/core`. Enhancers read the active context via `getActiveWriteContext()`.
 *
 * Consumed by `@signaltree/guardrails` (intent-aware suppression, audit trail) and
 * `@signaltree/validation` (suppress validation on time-travel/hydration replays).
 *
 * NOTE: `@signaltree/validation` reads ONLY `intent` and `source`. Custom keys via
 * the open index signature are guardrails-private — do not expect other enhancers
 * to honor them.
 */
export interface UpdateMetadata {
  /** Intent of the update (closed union — adding new intents is a core change). */
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  /** Source of the update (closed union). */
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  /** Suppress guardrails for this update. */
  suppressGuardrails?: boolean;
  /** Optional correlation ID for related updates. */
  correlationId?: string;
  /** Optional timestamp. */
  timestamp?: number;
  /** Internal owner position ids carried by replayed writes. */
  positionIds?: number[];
  /** Internal row subject ids carried by replayed writes. */
  subjectIds?: number[];
  /** @internal Explicit transaction grouping token for Gate 3 attribution. */
  transactionId?: number;
  /** @internal Owning tree token for transaction attribution isolation. */
  transactionOwner?: object;
  /** @internal Declared leaf-write semantics for scalar rollback classification. */
  mutationIntent?: 'replace' | 'derive';
  /** @internal Explicitly distinguishes causal authorship from causal realization. */
  causalMode?: CausalWriteMode;
  /** @internal Canonical structural collection effect produced at mutation time. */
  historyEffect?: StructuralHistoryEffect;
  /** Open extension for guardrails' historical custom-key shape. */
  [key: string]: unknown;
}

export type StructuralHistoryEffect =
  | {
      kind: 'add';
      subject: number;
      key: string | number;
      value: unknown;
      beforeSubject?: number;
      afterSubject?: number;
      /**
       * Structural ownership positions encompassed by this existence transition.
       *
       * Coverage is expressed at structural ownership granularity and does not
       * imply enumeration, participation, indexing, frontier advancement, or
       * authority for descendant reactive positions.
       */
      subjectPositions?: readonly PositionId[];
    }
  | {
      kind: 'remove';
      subject: number;
      key: string | number;
      value: unknown;
      beforeSubject?: number;
      afterSubject?: number;
      /**
       * Structural ownership positions encompassed by this existence transition.
       *
       * Coverage is expressed at structural ownership granularity and does not
       * imply enumeration, participation, indexing, frontier advancement, or
       * authority for descendant reactive positions.
       */
      subjectPositions?: readonly PositionId[];
    }
  | {
      kind: 'rekey';
      subject: number;
      beforeKey: string | number;
      afterKey: string | number;
      /**
       * Structural ownership positions encompassed by this existence transition.
       *
       * Coverage is expressed at structural ownership granularity and does not
       * imply enumeration, participation, indexing, frontier advancement, or
       * authority for descendant reactive positions.
       */
      subjectPositions?: readonly PositionId[];
    };

export type PositionId = number;

export type MutationKind =
  | 'set'
  | 'update'
  | 'insert'
  | 'remove'
  | 'move'
  | 'rekey'
  | 'replace';

export type CausalWriteMode = 'authoring' | 'realization';

export interface WriteAttribution {
  intent?: UpdateMetadata['intent'];
  source?: UpdateMetadata['source'];
  transactionId?: number;
  transactionOwner?: object;
  mutationIntent?: UpdateMetadata['mutationIntent'];
  causalMode?: UpdateMetadata['causalMode'];
}

export interface MutationEnvelope<T = unknown> {
  readonly positionId: PositionId;
  readonly path: readonly PropertyKey[];
  readonly ownerPath?: readonly PropertyKey[];
  readonly before: T;
  readonly after: T;
  readonly kind: MutationKind;
  readonly subjectId?: number;
  readonly structural?: StructuralHistoryEffect;
  readonly attribution?: WriteAttribution;
}

// Time travel enhancer configuration (canonical)
export interface TimeTravelConfig {
  /** Enable/disable time travel (default: true) */
  enabled?: boolean;
  /**
   * Maximum number of history entries to keep
   * @default 50
   */
  maxHistorySize?: number;

  /**
   * Whether to include payload information in history entries
   * @default true
   */
  includePayload?: boolean;

  /**
   * Return `true` to SKIP recording a transition.
   *
   * Reference-dedup already collapses snapshots that are identical, which is
   * narrower than this: a comparator lets the app decide a change is
   * uninteresting — a cursor position, a hover flag, a field the user is still
   * typing into — so undo lands on something a person recognises as a step.
   *
   * ⚠️ It runs on EVERY recorded write. A comparator that walks the whole state
   * reintroduces the O(state) cost per write that reference-dedup was
   * introduced to remove. Compare the few fields you mean.
   */
  shouldSkip?: (previous: unknown, next: unknown) => boolean;

  /**
   * Custom action names for different operations
   */
  actionNames?: {
    update?: string;
    set?: string;
    batch?: string;
    [key: string]: string | undefined;
  };
}
// Core v6 types — type-safe enhancer architecture

// Primitives
export type Primitive =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | symbol;

export type NotFn<T> = T extends (...args: unknown[]) => unknown ? never : T;

// NOTE: A `declare module '@angular/core'` augmentation that added callable
// overloads to Angular's `WritableSignal<T>` previously lived here. It was
// removed because it is a *global* augmentation: importing anything from
// `@signaltree/core` would activate it project-wide and conflict with
// libraries that depend on the original invariant `WritableSignal<T>`
// signature (notably `@ngrx/signals`' `WritableStateSource<T>`, which became
// invariance-incompatible — surfacing as ~30 TS2345 errors in mixed
// `@ngrx/signals` + SignalTree codebases). There is no opt-in replacement:
// `@signaltree/callable-syntax`, which owned that augmentation, was DELETED in
// 14.0.0 because it re-introduced this same conflict and because the build
// transform behind it could never run inside an Angular app. There is no
// supported way to make a raw Angular signal callable-as-setter.

/**
 * A branch (non-leaf) node in the tree.
 *
 * ## READ THIS BEFORE "FIXING" ANYTHING THAT TOUCHES NODES
 *
 * The single fact that explains SignalTree's shape:
 * **only LEAVES are Angular signals.** A node is not a signal at all — it is a
 * plain function built by `makeNodeAccessor` with its child keys hung off it
 * as properties.
 *
 * That gives the two halves of the tree different, deliberate surfaces:
 *
 * | | leaf (`WritableSignal<T>`) | node (`NodeAccessor<T>`) |
 * |---|---|---|
 * | read | `leaf()` | `node()` — unwraps the whole subtree |
 * | write a value | `leaf.set(v)` | `node({ partial })` — deep merge |
 * | write from current | `leaf.update(fn)` | `node(fn)` — fn gets the unwrapped value |
 * | has `.set` / `.update` | yes | **no — and it needs none** |
 *
 * Nodes are callable *by nature*: the three signatures below are the complete
 * write surface, and `node({ a: 1 })` merges — keys you don't pass are left
 * untouched, at every depth. Leaves are the opposite: calling a leaf with an
 * argument does **nothing at all**, because an Angular signal getter ignores
 * extra arguments.
 *
 * As of 14.0.0 that is a COMPILE ERROR rather than a silent no-op:
 * `CallableWritableSignal` no longer declares setter overloads.
 * `@signaltree/callable-syntax` used to promise the leaf form via a build
 * transform and was deleted — it could not run inside an Angular app at all.
 *
 * Two mistakes this comment exists to prevent:
 *
 * 1. **Do not add `.set()`/`.update()` to `NodeAccessor`.** It is not a
 *    missing feature. The call signatures already do both writes, and adding
 *    methods would collide with any state key literally named `set`/`update`.
 * 2. **Do not describe node call-syntax as depending on a build transform,** or
 *    as something to avoid. It is core behaviour and needs zero build tooling.
 *    (A transform once existed for LEAF calls only; it is gone.)
 *
 * Runtime, if you want to confirm rather than trust this comment:
 * `typeof node === 'function'`, `node.set === undefined`,
 * `node.update === undefined`, while `leaf.set` / `leaf.update` are functions.
 */
export interface NodeAccessor<T> {
  /** Read: unwraps this node and everything under it. */
  (): T;
  /** Write: deep partial merge — keys not present are preserved. */
  (value: Partial<T>): void;
  /** Write: receives the current unwrapped value; the result is merged. */
  (updater: (current: T) => T): void;
}

/**
 * The literal (declared) keys of `S`, discarding any `string`/`number` index
 * signature.
 *
 * Needed because `entityMap()` seeds its slice record as `Record<string, never>`
 * and `.computed()` accumulates by intersection — so two slices on one
 * collection type as `Record<string, never> & Record<'a', A> & Record<'b', B>`.
 * A bare `keyof` on that yields `string`, which would map to a junk index
 * signature instead of the two real slice names, and an `extends
 * Record<string, never>` emptiness test wrongly matches it (the intersection is
 * still assignable to the seed). Filtering the index signature out is what
 * makes both the emptiness check and the key mapping correct.
 */
type LiteralKeys<S> = keyof {
  [K in keyof S as string extends K
    ? never
    : number extends K
    ? never
    : K]: S[K];
};

/**
 * Materialize an `entityMap().computed()` slice record onto the collection's
 * signal type.
 *
 * `entityMap()`'s builders track their slices at the type level in a phantom
 * `__sliceTypes` property (`EntityMapBuilder`/`LoadingEntityMapBuilder` in
 * `markers/entity-map.ts`). The runtime already attaches each slice as a
 * `computed` on the materialized entity signal, so `tree.$.plants.byUrl()` has
 * always WORKED — this type is what makes it *typed* rather than requiring
 * `(tree.$.plants as any).byUrl()`.
 *
 * A slice-free collection has no literal slice keys and resolves to exactly
 * `EntitySignal<E, K>`, unchanged.
 *
 * Declared here rather than reusing `EntitySignalWithSlices` because
 * `markers/entity-map.ts` imports from this file — the dependency runs one way.
 */
type ApplyComputedSlices<TMarker, TBase> = TMarker extends {
  __sliceTypes?: infer S;
}
  ? [LiteralKeys<NonNullable<S>>] extends [never]
    ? TBase
    : TBase & {
        readonly [P in LiteralKeys<NonNullable<S>>]: Signal<NonNullable<S>[P]>;
      }
  : TBase;

// TreeNode represents the runtime shape of the tree where properties are
// accessed by string keys at runtime. Previously this was strictly mapped
// to `keyof T` which caused incompatibilities across packages when an
// enhancer or helper used a different generic parameter name. Relax the
// index signature to permit dynamic string indexing while still preserving
// the mapped keys for better editor DX.
// Default TreeNode maps known keys to either EntitySignal, StatusSignal, StoredSignal, FormSignal,
// or CallableWritableSignal and still allows dynamic string indexing at runtime.
export type TreeNode<T> = {
  [K in keyof T]: T[K] extends LoadingEntityMapMarker<
    infer LE,
    infer LK,
    infer LP
  >
    ? ApplyComputedSlices<T[K], LoadingEntitySignal<LE, LK, LP>>
    : T[K] extends EntityMapMarker<infer E, infer Key>
    ? ApplyComputedSlices<T[K], EntitySignal<E, Key>>
    : T[K] extends StatusMarker<infer Err>
    ? StatusSignal<Err>
    : T[K] extends StoredMarker<infer V>
    ? StoredSignal<V>
    : T[K] extends FormMarker<infer F>
    ? FormSignal<F>
    : T[K] extends AsyncSourceMarker<infer V>
    ? AsyncSourceSignal<V>
    : T[K] extends AsyncQueryMarker<infer In, infer Out>
    ? AsyncQuerySignal<In, Out>
    : T[K] extends Primitive
    ? CallableWritableSignal<T[K]>
    : T[K] extends readonly unknown[]
    ? CallableWritableSignal<T[K]>
    : T[K] extends
        | Date
        | RegExp
      | Map<unknown, unknown>
      | Set<unknown>
        | Error
        | ((...args: unknown[]) => unknown)
    ? CallableWritableSignal<T[K]> // Built-in objects → treat as atomic values
    : T[K] extends object
    ? NodeAccessor<T[K]> & TreeNode<T[K]>
    : CallableWritableSignal<T[K]>;
};

// NOTE: The read-only view types (`ReadonlyView`, `ReadonlyStore`,
// `ReadonlyNodeAccessor`, the per-marker `Readonly*Signal` views and their
// reader-key allowlists, and `asReadonly()`) live in `./readonly.ts`. They
// are computed over a tree's ACCUMULATED `$` type (the builder's `TAccum`),
// not over the source `T` — a source-computed view drops every `.derived()`
// computed (RFC 0004 F1), which is why no `ReadonlyTreeNode<T>` mirror of
// `TreeNode<T>` exists here.

// Base SignalTree minimal interface
// v6: primary runtime tree type is `SignalTree<T>`; a deprecated alias
// `SignalTree<T>` is provided at the end of this file for compatibility.
export interface ISignalTree<T> extends NodeAccessor<T> {
  /** Reactive tree-node accessor — the canonical entry point. */
  readonly $: TreeNode<T>;
  /**
   * Apply an enhancer to the tree.
   * Preserves the caller's tree type (`this`) and intersects with added features.
   *
   * @typeParam TAdded - The additional methods/properties added by the enhancer
   * @param enhancer - Function that receives the tree and returns it with additions
   * @returns The tree with both its original type and the added features
   *
   * @example
   * ```typescript
   * const tree = signalTree<DashboardState>({...})
   *   .with(enterprise())  // Returns tree with DashboardState + enterprise methods
   *   .with(batching());   // Returns tree with DashboardState + enterprise + batching
   *
   * tree.$.metrics  // ✅ DashboardState preserved
   * tree.updateOptimized({...})  // ✅ Enterprise method available
   * tree.batch(() => {...})  // ✅ Batching method available
   * ```
   */
  /**
   * Takes `Enhancer<TAdded>` so `TAdded` is read straight off the enhancer's own
   * type. The previous signature inlined its own lambda shape, which made
   * `with()` RE-DERIVE `TAdded` by matching the enhancer's return against
   * `ISignalTree<T> & TAdded` — so a neutrally-typed enhancer had its host
   * absorbed into the inference result (`ISignalTree<T> & EnhancerHost & {...}`).
   * Two separate types were solving the same problem and disagreeing about it.
   *
   * `this & TAdded` is unchanged, and it is what actually preserves both the
   * concrete state type and every previously accumulated enhancer method.
   */
  with<TAdded>(enhancer: Enhancer<TAdded>): this & TAdded;
  /**
   * Realization-facing overload, for enhancers written against a CONCRETE tree.
   *
   * Two authoring styles genuinely exist and this is not a compatibility hack:
   * core's built-ins are declared `<T>(tree: ISignalTree<T>) => ISignalTree<T> &
   * Methods` and legitimately read the realized surface, while third-party
   * enhancers built with `createEnhancer` are neutral. A single signature cannot
   * accept both, because `Enhancer` is a function-type alias and therefore has a
   * CONTRAVARIANT parameter under `strictFunctionTypes` — accepting a concrete
   * enhancer through it would require `EnhancerHost` to be assignable to
   * `ISignalTree<unknown>`, i.e. the neutral host to be a SUBTYPE of the tree,
   * which is the exact inversion of what neutrality means.
   *
   * Ordering matters: the neutral overload is first so a `createEnhancer` result
   * resolves against it and keeps `TAdded` exact.
   */
  with<TAdded>(
    enhancer: (tree: ISignalTree<T>) => ISignalTree<T> & TAdded
  ): this & TAdded;
  bind(thisArg?: unknown): NodeAccessor<T>;
  destroy(): void;
  /** Whether this tree has been destroyed. */
  readonly destroyed: Signal<boolean>;
  /**
   * Register a cleanup function to be called when the tree is destroyed.
   * Enhancers should use this to release resources (intervals, subscriptions, etc.).
   */
  registerCleanup(fn: EnhancerCleanup): void;
  /**
   * Apply a partial update and return the dot-paths of leaf signals that
   * actually changed.
   *
   * "Actually changed" is literal: a path appears only if the leaf signal
   * accepted the write. Values that are ref-equal to the current value are
   * skipped before the `set()`, and values that are a NEW reference but
   * DEEP-EQUAL are rejected by the leaf's own `equal` — a re-fetched server
   * payload that matches what you already hold reports `[]`, not every key
   * in the payload.
   *
   * Useful for partial server-payload sync, change-log/audit trails, and
   * targeted persistence.
   *
   * @example
   * ```ts
   * const changed = tree.updateAndReport(serverPayload);
   * if (changed.length) persistKeys(changed);
   * ```
   */
  updateAndReport(updates: Partial<T> | ((current: T) => Partial<T>)): string[];
  // Allow enhancers to attach runtime methods — consumers should cast to the
  // specific enhanced shape they expect (e.g. `SignalTree<T> & BatchingMethods<T>`).
}

/** Cleanup function returned or registered by enhancers. */
export type EnhancerCleanup = () => void;

// Method interfaces
export interface EffectsMethods<T> {
  /** Register an effect that can optionally return a cleanup function */
  effect(fn: (state: T) => void | (() => void)): () => void;

  /** Subscribe to state changes (simpler alternative to effect) */
  subscribe(fn: (state: T) => void): () => void;
}

/**
 * Configuration for the batching enhancer.
 *
 * IMPORTANT: Signal writes are ALWAYS synchronous.
 * Batching only affects change detection notification timing.
 */
export interface BatchingConfig {
  /**
   * Whether batching is enabled.
   * @default true
   */
  enabled?: boolean;

  /**
   * Delay before flushing CD notifications (ms).
   * 0 = microtask (default), >0 = setTimeout with delay.
   * @default 0
   */
  notificationDelayMs?: number;
}

/**
 * Methods added by the batching() enhancer.
 *
 * IMPORTANT: Signal writes are ALWAYS synchronous.
 * Batching only affects change detection notification timing.
 */
/**
 * ⚠️ NOT generic. None of these members reference the tree's state type, and
 * carrying a phantom `<T = unknown>` made `BatchingMethods<A>` and
 * `BatchingMethods<B>` the same type — safety that reads real and is not.
 * Removed in 14.0.0.
 */
export interface BatchingMethods {
  /**
   * Group multiple updates into a single change detection cycle.
   * Signal values update immediately; CD notification is batched.
   *
   * @example
   * tree.batch(() => {
   *   tree.$.a.set(1);  // Value updates immediately
   *   tree.$.b.set(2);  // Value updates immediately
   *   console.log(tree.$.a()); // Returns 1 ✅
   * });
   * // Single CD notification after batch completes
   */
  batch(fn: () => void): void;
  // See `coalesce()` below for the observable difference: a value read back inside
  // a `batch()` callback is the NEW value; inside `coalesce()` it is the OLD one.

  /**
   * Coalesce rapid updates to the same path.
   * Only the final value for each path is written.
   *
   * ## `batch()` vs `coalesce()` — they are NOT interchangeable
   *
   * Both end with the same state, so the docstrings used to imply the same
   * operation reached two ways. They differ in WHEN the write lands, and the
   * difference is observable:
   *
   * | inside the callback | `batch()` | `coalesce()` |
   * | ------------------- | --------- | ------------ |
   * | reading a value you just wrote | the NEW value | the **OLD** value |
   *
   * MEASURED: writing `'X'` then reading inside the callback gives `'X'` under
   * `batch()` and `''` under `coalesce()`. `batch()` writes synchronously and
   * defers only change-detection notification; `coalesce()` defers the WRITE
   * itself and applies the last value per path on exit.
   *
   * So `coalesce()` is wrong for any callback that reads back what it wrote, and
   * `batch()` is wrong when you specifically want intermediate values discarded.
   *
   * ⚠️ An `update(fn)` inside `coalesce()` is NOT coalesced, deliberately. An
   * updater is a read-modify-write, so keeping only the last of three `+1`s would
   * mean `+1`. Updaters apply immediately, after draining any pending coalesced
   * `set` on the same path.
   * Use for high-frequency updates (typing, dragging, etc.)
   *
   * @example
   * tree.coalesce(() => {
   *   tree.$.query.set('h');
   *   tree.$.query.set('he');
   *   tree.$.query.set('hel');
   * });
   * // Only 'hel' is written to the signal
   */
  coalesce(fn: () => void): void;

  /**
   * Check if there are pending CD notifications.
   */
  hasPendingNotifications(): boolean;

  /**
   * Manually flush pending CD notifications.
   * Rarely needed - notifications flush automatically on microtask.
   */
  flushNotifications(): void;
}

export interface TransactionMethods {
  transaction(fn: () => void): PendingTransaction;
}

export interface TimeTravelMethods<T = unknown> extends TransactionMethods {
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getHistory(): TimeTravelEntry<T>[];
  resetHistory(): void;
  jumpTo(index: number): void;
  getCurrentIndex(): number;
  // `pauseRecording()` / `resumeRecording()` / `isRecordingPaused()` were
  // REMOVED in 14.1.1. They could not express "one undo step", only "record
  // nothing" — so the documented recipe needed a synthetic sealing write landing
  // on an invented domain field, and an earlier revision of that guide shipped
  // the destructive version without it. Worse, pause was a GLOBAL mode: an
  // unrelated write inside the window was suppressed too, so correctness needed
  // sole ownership of the tree for its duration. A `for` loop has that; a
  // multi-second `mergeMap` over N requests does not.
  //
  // The replacement is a transaction handle — see
  // docs/architecture/history-the-greenfield-target.md.
  /** Internal time-travel manager exposed for advanced tooling/debugging */
  readonly __timeTravel?: {
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    getHistory(): TimeTravelEntry<T>[];
    resetHistory(): void;
    jumpTo(index: number): void;
    getCurrentIndex(): number;
  };
}

/**
 * Thrown when a pending transaction cannot be rolled back conservatively.
 *
 * The public contract is intentionally narrow: callers only need to know that
 * rollback failed and the optimistic state may need reconciliation or refetch.
 * Richer causal details may be attached as an internal `cause` payload for
 * tooling, but that shape is not part of the application-facing API.
 */
export class SignalTreeRollbackError extends Error {
  readonly code = 'SIGNALTREE_ROLLBACK_FAILED';
  cause?: unknown;

  constructor(
    message = 'SignalTree could not rollback the pending transaction',
    options?: { cause?: unknown }
  ) {
    super(message);
    this.name = 'SignalTreeRollbackError';
    this.cause = options?.cause;
    Object.setPrototypeOf(this, SignalTreeRollbackError.prototype);
  }
}

export interface PendingTransaction {
  confirm(): void;
  /**
   * Rolls back the pending optimistic transaction.
   *
   * Throws {@link SignalTreeRollbackError} when SignalTree cannot remove the
   * transaction conservatively without risking later valid work.
   */
  rollback(): void;
}

export interface DevToolsMethods {
  connectDevTools(name?: string): void;
  disconnectDevTools(): void;
}

/**
 * Marker interface indicating entities have been materialized at runtime.
 * Prefer accessing entity collections via `tree.$.prop` (typed as `EntitySignal`).
 */
export interface EntitiesEnabled {
  /** @internal */
  readonly __entitiesEnabled?: true;
}

export interface OptimizedUpdateMethods<T> {
  updateOptimized(
    updates: Partial<T>,
    options?: {
      batch?: boolean;
      batchSize?: number;
      maxDepth?: number;
      ignoreArrayOrder?: boolean;
      equalityFn?: (a: unknown, b: unknown) => boolean;
    }
  ): {
    changed: boolean;
    duration: number;
    changedPaths: string[];
    stats?: {
      totalPaths: number;
      optimizedPaths: number;
      batchedUpdates: number;
    };
  };
}

export interface TimeTravelEntry<T> {
  action: string;
  timestamp: number;
  state: T;
  payload?: unknown;
}

// ============================================
// CONFIGURATION TYPES
// ============================================

export interface TreeConfig {
  batchUpdates?: boolean;
  // `enableTimeTravel` was REMOVED here in 14.1.1: it had ZERO consumers in
  // signal-tree.ts and silently did nothing, while a working flag of the same
  // name lives on `DevToolsConfig`. The one a user reached for first was the
  // dead one. Attach `timeTravel()` as an enhancer instead.

  /**
   * Force lazy (`true`) or eager (`false`) signal creation, overriding the
   * automatic size threshold.
   *
   * v11 change: lazy mode only runs when the `lazy` feature is also injected
   * (`lazy: lazy()` from `@signaltree/core/lazy`). Without it, this flag is a
   * no-op and trees are always eager — the lazy proxy + memory manager
   * (~2.6KB) tree-shake out of bundles that don't opt in.
   */
  useLazySignals?: boolean;
  useShallowComparison?: boolean;
  maxCacheSize?: number;
  trackPerformance?: boolean;
  /** Name shown in devtools. Was also spelled `treeName` on DevToolsConfig; that alias is gone in 14.1.1. */
  name?: string;
  enableDevTools?: boolean;
  debugMode?: boolean;
  useStructuralSharing?: boolean;

  /**
   * Construction-time security validation, built with the `security()` helper
   * from `@signaltree/core/security`. When present, its `validate()` runs
   * synchronously during construction to reject prototype pollution, XSS, and
   * function values.
   *
   * v11 change: pass `security: security(config)` (from the `/security`
   * subpath), not a raw `SecurityValidatorConfig`. This keeps `SecurityValidator`
   * (~2.4KB) out of every bundle that doesn't opt in.
   *
   * @default undefined (no security validation)
   *
   * @example
   * ```ts
   * import { signalTree } from '@signaltree/core';
   * import { security, SecurityPresets } from '@signaltree/core/security';
   *
   * const tree = signalTree(state, { security: security({ preventXSS: true }) });
   * const strict = signalTree(state, { security: security(SecurityPresets.strict().getConfig()) });
   * ```
   */
  security?: SecurityFeature;

  /**
   * Opt-in lazy signal creation, built with the `lazy()` helper from
   * `@signaltree/core/lazy`. When present, large trees (or `useLazySignals:
   * true`) materialize signals on-demand through a Proxy backed by a memory
   * manager; when absent, trees are always eager.
   *
   * v11 change: lazy mode is no longer automatic — inject `lazy: lazy()` to
   * enable it. This keeps the lazy proxy + `SignalMemoryManager` (~2.6KB) out
   * of every bundle that doesn't use it.
   *
   * @default undefined (eager signal creation)
   *
   * @example
   * ```ts
   * import { signalTree } from '@signaltree/core';
   * import { lazy } from '@signaltree/core/lazy';
   *
   * // Auto-threshold applies once lazy is injected (large state → lazy):
   * const tree = signalTree(largeState, { lazy: lazy() });
   * // Force lazy even for small state:
   * const forced = signalTree(state, { lazy: lazy(), useLazySignals: true });
   * ```
   */
  lazy?: LazyFeature;
}

/**
 * Opt-in lazy feature carried on {@link TreeConfig.lazy}. Built by `lazy()`
 * from `@signaltree/core/lazy`. Defined here (not in the lazy subpath) so core
 * can type the config and build the tree without statically importing the lazy
 * proxy or memory manager, keeping them tree-shakeable.
 */
export interface LazyFeature {
  readonly __signalTreeLazy: true;
  /**
   * Build the lazy proxy tree. Returns the tree plus a `dispose` hook the core
   * calls on `tree.destroy()`. Invoked only when lazy mode is selected.
   */
  build<T extends object>(
    obj: T,
    equalityFn: (a: unknown, b: unknown) => boolean
  ): { tree: TreeNode<T>; dispose: () => void };
}

/**
 * Construction-time security feature carried on {@link TreeConfig.security}.
 * Built by `security()` from `@signaltree/core/security`. Defined here (not in
 * the security subpath) so core can type the config without importing the
 * validator, keeping it tree-shakeable.
 */
export interface SecurityFeature {
  readonly __signalTreeSecurity: true;
  validate(state: unknown): void;
}

/**
 * Branded loading feature produced by the `loader()` helper and passed as the
 * `load` option of {@link EntityMapMarker}'s config:
 * `entityMap({ load: loader(fn, opts) })`.
 *
 * Exact `security()` precedent: the helper closure is the *only* reference to
 * the loader machinery (`attachLoader`), so importing `entityMap` without
 * `loader` tree-shakes the loader/cache/SWR code out. The phantom `__entity`/
 * `__params` members carry `E`/`P` so the loading overload can recover the
 * entity and scope-param types for inference; they never exist at runtime.
 *
 * @typeParam E - entity row type
 * @typeParam P - scope-param type (`void` for a global collection)
 */
export interface LoaderFeature<E, P = void> {
  readonly __signalTreeLoader: true;
  /** @internal Attaches loader machinery to a materialized entity signal. */
  attach(entity: unknown): void;
  /** @internal Type-level only — carries `E` for inference. */
  readonly __entity?: E;
  /** @internal Type-level only — carries the scope-param type `P`. */
  readonly __params?: P;
}

/** Options for the {@link HistoryFeature} produced by `history()`. */
export interface FormHistoryOptions<T> {
  /** Maximum number of past entries retained (default: 10). */
  capacity?: number;
  /**
   * Fields that are NEVER written to the history buffer (e.g. `password`,
   * `ssn`). Excluded fields keep their live value across undo/redo — they are
   * never cloned into the snapshot stack, so secrets do not linger in memory
   * or leak through devtools/serialization. This is the security escape hatch
   * that the legacy `withFormHistory` lacked.
   */
  exclude?: (keyof T)[];
}

/** Immutable undo/redo state exposed by {@link FormHistoryApi.history}. */
/** @internal Shared scoped-history authority bound by `timeTravel()` during Gate 2 migration. */
export interface FormHistorySharedAuthority {
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
}

/**
 * Undo/redo surface attached to a `form()` marker when `history()` is
 * configured. Because history rides on the marker's values signal — the same
 * signal `signalForm()` uses as its `FieldTree` model — undo/redo drive BOTH
 * the marker API and any bound Angular Signal Forms field from one engine.
 */
export interface FormHistoryApi<_T> {
  /** Revert to the previous recorded state (no-op if none). */
  undo(): void;
  /** Re-apply the next state after an undo (no-op if none). */
  redo(): void;
  canUndo: Signal<boolean>;
  canRedo: Signal<boolean>;
  /** @internal Binds form undo/redo selection to shared scoped history. */
  __bindSharedAuthority?(authority: FormHistorySharedAuthority): void;
}

/**
 * Branded form-history feature produced by the `history()` helper and passed
 * as the `history` option of a `form()` marker: `form({ history: history() })`.
 *
 * Exact `security()`/`loader()` precedent: the helper closure is the *only*
 * reference to the history engine (snapshot buffer, deep-clone, undo/redo), so
 * importing `form` without `history` tree-shakes the engine out of the bundle.
 * A raw (non-branded) value on `history` fails closed at the `form()` call site.
 */
export interface HistoryFeature<T extends Record<string, unknown>> {
  readonly __signalTreeFormHistory: true;
  /**
   * @internal Bind the engine to a form marker's value funnel. `read` returns
   * the live values; `write` applies a restored snapshot through the form
   * (merged, so excluded fields survive). Returns the public api plus a
   * `record()` hook the marker calls after each mutation.
   */
  attach(ctx: { read: () => T; write: (next: Partial<T>) => void }): {
    api: FormHistoryApi<T>;
    record: () => void;
  };
}

// ============================================
// FEATURE TYPES
// ============================================

// ============================================
// ENTITY MAP & SIGNAL TYPES
// ============================================

/**
 * Entity configuration options
 */
export interface EntityConfig<E, K extends string | number = string> {
  /**
   * Extract ID from entity. Default: (e) => e.id
   * Required if entity doesn't have 'id' property.
   */
  selectId?: (entity: E) => K;

  /**
   * Optional comparator that keeps `all` and `ids` in a stable sorted order
   * (parity with @ngrx/entity's `sortComparer`). When provided, the `all()`
   * and `ids()` signals reflect this order regardless of insertion order;
   * `map()` retains insertion order. Omit for insertion-order collections.
   *
   * @example
   * entityMap<User>({ sortComparer: (a, b) => a.name.localeCompare(b.name) })
   */
  sortComparer?: (a: E, b: E) => number;

  /**
   * Exclude this collection from `timeTravel()` history while keeping it in
   * every OTHER snapshot — `serialization()`, `persistence()`, devtools, audit.
   *
   * **Named `recordHistory`, not `history`, since 14.1.1.** The old name collided
   * with `form({ history: history() })` — and the two are DIFFERENT questions, so
   * unifying them (the first plan) would have been wrong:
   *
   * - `form({ history: history() })` — this form OWNS a scoped undo stack. Opt IN
   *   to a new, independent history that cannot see the rest of the tree.
   * - `entityMap({ recordHistory: false })` — participation in the AMBIENT
   *   `timeTravel()` stack. Opt OUT of a history someone else owns.
   *
   * One word for "own a history" and "be recorded into a history" is the collision.
   * Two concepts, two names.
   *
   * Why the two need separating: `entityMap`'s snapshot is `{ all: node.all() }`,
   * an N-pointer array rebuilt whenever the collection changes. Time travel
   * records on every self-dirty flush, so attaching `timeTravel()` to a tree
   * containing a large collection makes every collection-mutating write
   * O(collection width), permanently. A 10,000-row streaming grid wants to
   * survive reload and does NOT want to be in the undo stack.
   *
   * Before this flag, `transient: true` was the only opt-out and it opted out of
   * BOTH — the grid either paid O(N) per write or did not persist at all.
   *
   * ⚠️ **Undo becomes partial for this collection, by design.** Undoing past a
   * write to it will not revert it. That is the point, and it is the reason this
   * is opt-in: "a partial restore is worse than a failed one" is a lesson this
   * codebase has already paid for.
   *
   * @default true
   * @example
   * entityMap<Row, number>({ selectId: (r) => r.id, recordHistory: false })
   */
  recordHistory?: boolean;

  /**
   * Entity-level hooks (run before collection hooks)
   */
  hooks?: {
    /** Transform or block before add. Return false to block, entity to transform. */
    beforeAdd?: (entity: E) => E | false;
    /** Transform or block before update. Return false to block, changes to transform. */
    beforeUpdate?: (id: K, changes: Partial<E>) => Partial<E> | false;
    /** Block before remove. Return false to block. */
    beforeRemove?: (id: K, entity: E) => boolean;
  };
}

/**
 * Unique symbol for EntityMapMarker branding.
 * NOT EXPORTED - this prevents external code from creating types that satisfy EntityMapMarker.
 * This is critical for correct type inference in generic contexts.
 */
declare const ENTITY_MAP_BRAND: unique symbol;

/**
 * Runtime marker for entity collections.
 * Uses a unique symbol brand to ensure only types created via entityMap() can satisfy this interface.
 * This prevents generic mapped type conditionals from producing unions.
 */
export interface EntityMapMarker<E, K extends string | number> {
  /** Unique brand - only satisfiable by entityMap() since symbol is not exported */
  readonly [ENTITY_MAP_BRAND]: { __entity: E; __key: K };
  /** Runtime marker so enhancers can detect entity collections */
  readonly __isEntityMap: true;
  /** Persisted config used when materializing the EntitySignal */
  readonly __entityMapConfig?: EntityConfig<E, K>;
}

/**
 * A cache-aware (single-scope) loading entityMap marker — produced by `entityMap({ load, … })`.
 * Materializes into an {@link EntitySignal} plus the loader surface
 * ({@link EntityLoaderSurface}). Distinguished from a plain marker by `__hasLoad`
 * so the type resolver can add the loader methods only when `load` is configured.
 *
 * @typeParam P - scope/params type (`void` for the global, parameterless form).
 */
export interface LoadingEntityMapMarker<E, K extends string | number, P = void>
  extends EntityMapMarker<E, K> {
  readonly __hasLoad: true;
  readonly __loadParams?: P;
}

/**
 * An {@link EntitySignal} augmented with the cache-aware (single-scope) loader surface — the
 * materialized form of `entityMap({ load, … })`.
 */
export type LoadingEntitySignal<
  E,
  K extends string | number = string,
  P = void
> = EntitySignal<E, K> & EntityLoaderSurface<P>;

/**
 * Create an entity map marker for use in signalTree state definition.
 * This is the ONLY way to create a type that satisfies EntityMapMarker,
 * since the brand symbol is not exported.
 *
 * @example
 * ```typescript
 * const tree = signalTree({
 *   users: entityMap<User>(),
 *   products: entityMap<Product, number>(),
 * });
 * ```
 *
 * @see {@link ./markers/entity-map.ts} for the self-registering implementation
 */
// Re-export from self-registering marker module
export { entityMap } from './markers/entity-map';

/**
 * Mutation options
 */
export interface MutationOptions {
  onError?: (error: Error) => void;
}

export interface AddOptions<E, K> extends MutationOptions {
  selectId?: (entity: E) => K;
}

export interface AddManyOptions<E, K> extends AddOptions<E, K> {
  mode?: 'strict' | 'skip' | 'overwrite';
}

/**
 * Tap handlers - observe entity lifecycle events
 */
export interface TapHandlers<E, K extends string | number> {
  onAdd?: (entity: E, id: K) => void;
  onUpdate?: (id: K, changes: Partial<E>, entity: E) => void;
  onRemove?: (id: K, entity: E) => void;
  onChange?: () => void;
}

/**
 * Intercept context for blocking/transforming mutations
 */
export interface InterceptContext<T> {
  block(reason?: string): void;
  transform(value: T): void;
  readonly blocked: boolean;
  readonly blockReason: string | undefined;
}

/**
 * Intercept handlers - block or transform mutations before they happen
 */
export interface InterceptHandlers<E, K extends string | number> {
  onAdd?: (entity: E, ctx: InterceptContext<E>) => void | Promise<void>;
  onUpdate?: (
    id: K,
    changes: Partial<E>,
    ctx: InterceptContext<Partial<E>>
  ) => void | Promise<void>;
  onRemove?: (
    id: K,
    entity: E,
    ctx: InterceptContext<void>
  ) => void | Promise<void>;
}

/**
 * Entity node with deep signal access
 */
export type EntityNode<E> = {
  (): E;
  (value: E): void;
  (updater: (current: E) => E): void;
} & {
  [P in keyof E]: E[P] extends object
    ? E[P] extends readonly unknown[]
      ? CallableWritableSignal<E[P]>
      : EntityNode<E[P]>
    : CallableWritableSignal<E[P]>;
};

/**
 * EntitySignal provides reactive entity collection management.
 */
export interface EntitySignal<E, K extends string | number = string> {
  // Explicit access
  byId(id: K): EntityNode<E> | undefined;
  byIdOrFail(id: K): EntityNode<E>;

  // Queries (readonly properties returning signals)
  readonly all: Signal<E[]>;
  readonly count: Signal<number>;
  readonly ids: Signal<K[]>;
  has(id: K): Signal<boolean>;
  /**
   * True when the collection has no entities. v10.3 canonical name —
   * aligns with FormControl-style bare-boolean accessors used across
   * `status` / `form` / `asyncSource` markers.
   */
  readonly empty: Signal<boolean>;
  /**
   * The collection as a `ReadonlyMap`, keyed by id. Renamed from `map` in 14.1.1 —
   * `map` read as a projection beside `all()`, which is what `.map(fn)` means to
   * every JS developer.
   */
  readonly asMap: Signal<ReadonlyMap<K, E>>;
  where(predicate: (entity: E) => boolean): Signal<E[]>;
  find(predicate: (entity: E) => boolean): Signal<E | undefined>;

  // Active entity — the master/detail primitive.
  //
  // Added in 14.0.0 after a capability audit found elf and Akita both ship it
  // and every team otherwise hand-rolls `activeId: null` plus a derived lookup.
  // `activeEntity` resolves through `byId`, so it is O(1) and invalidates only
  // when THAT row changes — finer-grained than the filtered-stream versions the
  // other libraries offer.
  readonly activeId: Signal<K | undefined>;
  readonly activeEntity: Signal<E | undefined>;
  setActiveId(id: K | undefined): void;
  clearActiveId(): void;

  // Mutations
  addOne(entity: E, opts?: AddOptions<E, K>): K;
  addMany(entities: E[], opts?: AddManyOptions<E, K>): K[];
  /** Insert at the FRONT. Feeds, chat logs, activity streams. */
  prependOne(entity: E, opts?: AddOptions<E, K>): K;
  prependMany(entities: E[], opts?: AddManyOptions<E, K>): K[];
  /**
   * Change an entity's id in place, preserving its position.
   *
   * The missing half of optimistic creation: insert with a temp id, then adopt
   * the id the server assigned. Without it the only option is remove-then-add,
   * which loses list position, orphans any node held from `byId(tempId)`, and
   * breaks any UI state keyed by the old id.
   */
  changeId(from: K, to: K): void;
  /** Merge `changes` into the entity at `id`. The patch half of the write surface. */
  updateOne(id: K, changes: Partial<E>, opts?: MutationOptions): void;
  /**
   * REPLACE the entity at `id` outright — the missing half of `updateOne`.
   *
   * `updateOne` spreads (`{ ...entity, ...changes }`), so it cannot REMOVE a key.
   * Before this existed the only replace was `setAll(all().map(...))`: whole-collection
   * work to change one row, which is the anti-pattern the library exists to avoid.
   * This is O(1) and position-preserving.
   *
   * Takes the id explicitly and deliberately. A `setOne(entity)` that derived the
   * key via `selectId` would write to the wrong slot whenever `changeId` has left
   * `entity.id` disagreeing with the storage key — the caller's id cannot drift.
   */
  replaceOne(id: K, entity: E, opts?: MutationOptions): void;
  updateMany(ids: K[], changes: Partial<E>, opts?: MutationOptions): void;
  updateWhere(predicate: (entity: E) => boolean, changes: Partial<E>): number;
  upsertOne(entity: E, opts?: AddOptions<E, K>): K;
  upsertMany(entities: E[], opts?: AddOptions<E, K>): K[];
  removeOne(id: K, opts?: MutationOptions): void;
  removeMany(ids: K[], opts?: MutationOptions): void;
  removeWhere(predicate: (entity: E) => boolean): number;
  /** Empty the collection. There is no `removeAll` alias — this is the one name. */
  clear(): void;
  setAll(entities: E[], opts?: AddOptions<E, K>): void;

  // Hooks
  tap(handlers: TapHandlers<E, K>): () => void;
  intercept(handlers: InterceptHandlers<E, K>): () => void;
}

/**
 * @deprecated The old EntityHelpers interface is deprecated and will be removed in v6.0.
 * Use the new Map-based entity API instead:
 *
 * **Migration:**
 * ```typescript
 * // Old (deprecated):
 * interface State { users: User[] }
 * const tree = signalTree<State>({ users: [] });
 * const helpers = tree.entities<User>('users');
 * helpers.add(user);
 * helpers.selectById(id)();
 *
 * // New (recommended):
 *
 * interface State { users: entityMap<User> }
 * const tree = signalTree<State>({ users: entityMap<User>() });
 * tree.$.users.addOne(user);
 * tree.$.users.byId(id)?.();
 * ```
 *
 * @see entityMap for the new marker function
 */
// Legacy `EntityHelpers` removed — v6 uses `EntitySignal` via `tree.$.prop`.

// LoggingConfig / LogEntry / ValidationConfig were removed in 14.0.0. They
// described enhancers that do not exist on this surface, were reachable from no
// entry point, and were referenced by nothing — de-exporting them is what let
// eslint finally see they were dead.
export interface PersistenceConfig {
  key: string;
  storage?: Storage;
  debounceMs?: number;
  filter?: (path: string) => boolean;
  serialize?: (state: unknown) => string;
  deserialize?: (json: string) => unknown;
}

export interface DevToolsConfig {
  /** Enable Redux DevTools browser extension */
  enableBrowserDevTools?: boolean;
  /** Enable internal logging */
  enableLogging?: boolean;
  /** Performance warning threshold (ms) */
  performanceThreshold?: number;
  /** Enable Redux DevTools time-travel integration */
  enableTimeTravel?: boolean;
  /**
   * Name shown in Redux DevTools.
   *
   * The `treeName` alias was REMOVED in 14.1.1 — the source called it "legacy
   * support" and `name ?? treeName` meant `name` always won anyway.
   */
  name?: string;
  /** Enable/disable devtools connection */
  enabled?: boolean;
  /** Log actions to console */
  logActions?: boolean;
  /** Max history entries to keep */
  maxAge?: number;
  /** Limit sends to at most once every N milliseconds (0 = no limit) */
  rateLimitMs?: number;
  /** Limit sends by rate (overrides rateLimitMs if provided) */
  maxSendsPerSecond?: number;
  /** Only include actions matching these path patterns */
  includePaths?: string[];
  /** Exclude actions matching these path patterns */
  excludePaths?: string[];
  /** Customize how paths are formatted for display */
  formatPath?: (path: string) => string;
  /** Maximum serialization depth for devtools state snapshots */
  maxDepth?: number;
  /** Maximum array length to serialize per path */
  maxArrayLength?: number;
  /** Maximum string length to serialize per field */
  maxStringLength?: number;
  /** Optional custom serializer for devtools state snapshots */
  serialize?: (state: unknown) => unknown;
  /**
   * Configuration for sharing a single Redux DevTools instance across multiple stores.
   * When provided, stores with the same id will share a single DevTools connection.
   */
  aggregatedReduxInstance?: {
    id: string;
    name?: string;
  };
  features?: {
    jump?: boolean;
    skip?: boolean;
    reorder?: boolean;
  };
}

/**
 * Type utilities for entities
 */
// EntityType / EntityKeyType / IsEntityMap were removed in 14.0.0: unreachable
// from every entry point and referenced by nothing, in either this repo or a
// consumer's — the exports map has no wildcard, so no consumer could import
// them even deliberately.

/**
 * TreeNode augmented with entity signals
 */
/**
 * Deep recursive tree node shape used for advanced, opt-in typing.
 * This expands nested objects into `EntitySignal` / `EntityNode` shapes
 * and is intentionally expensive for TypeScript to compute. Exported
 * as `DeepEntityAwareTreeNode` so callers can opt-in when they need
 * the full deep inference.
 */
export type DeepEntityAwareTreeNode<T> = {
  [K in keyof T]: T[K] extends LoadingEntityMapMarker<
    infer LE,
    infer LK,
    infer LP
  >
    ? ApplyComputedSlices<T[K], LoadingEntitySignal<LE, LK, LP>>
    : T[K] extends EntityMapMarker<infer E, infer Key>
    ? ApplyComputedSlices<T[K], EntitySignal<E, Key>>
    : T[K] extends StatusMarker<infer Err>
    ? StatusSignal<Err>
    : T[K] extends StoredMarker<infer V>
    ? StoredSignal<V>
    : T[K] extends FormMarker<infer F>
    ? FormSignal<F>
    : T[K] extends AsyncSourceMarker<infer V>
    ? AsyncSourceSignal<V>
    : T[K] extends AsyncQueryMarker<infer In, infer Out>
    ? AsyncQuerySignal<In, Out>
    : T[K] extends object
    ? DeepEntityAwareTreeNode<T[K]>
    : CallableWritableSignal<T[K]>;
};

/**
 * Shallow public tree node used by default in most public APIs.
 * This avoids eagerly expanding deeply nested types and keeps
 * editor/CI responsiveness high while preserving common DX.
 * Consumers who want the fully expanded shape can opt-in via
 * `TypedSignalTree<T>` (see below) or use `DeepEntityAwareTreeNode`.
 */
export type EntityAwareTreeNode<T> = {
  [K in keyof T]: T[K] extends LoadingEntityMapMarker<
    infer LE,
    infer LK,
    infer LP
  >
    ? ApplyComputedSlices<T[K], LoadingEntitySignal<LE, LK, LP>>
    : T[K] extends EntityMapMarker<infer E, infer Key>
    ? ApplyComputedSlices<T[K], EntitySignal<E, Key>>
    : T[K] extends StatusMarker<infer Err>
    ? StatusSignal<Err>
    : T[K] extends StoredMarker<infer V>
    ? StoredSignal<V>
    : T[K] extends FormMarker<infer F>
    ? FormSignal<F>
    : T[K] extends AsyncSourceMarker<infer V>
    ? AsyncSourceSignal<V>
    : T[K] extends AsyncQueryMarker<infer In, infer Out>
    ? AsyncQuerySignal<In, Out>
    : CallableWritableSignal<T[K]>;
};

/**
 * Opt-in alias providing the full depth-expanded SignalTree typing.
 * Use when you explicitly want deep compile-time inference for nested
 * structures. Example:
 *
 *   type MyTyped = TypedSignalTree<MyState>;
 *   const typed = tree as MyTyped;
 *
 * This keeps the default common path fast while preserving power for
 * advanced users.
 */
// TypedSignalTree was removed in 14.0.0. A spec comment already described it as
// "unexported" while it was in fact exported and reachable by nobody; it is now
// simply gone, and the comment is true.

/**
 * Internal path notifier interface
 * @internal
 */
export interface PathNotifier {
  subscribe(pattern: string, handler: PathHandler): () => void;
  intercept(pattern: string, fn: PathInterceptor): () => void;
  notify(
    path: string,
    value: unknown,
    prev: unknown,
    ownerPath?: string,
    subjectIds?: number[],
    positionIds?: number[],
    meta?: UpdateMetadata
  ): void;
}

type PathHandler = (
  value: unknown,
  prev: unknown,
  path: string,
  ownerPath?: string,
  source?: string,
  subjectIds?: number[],
  positionIds?: number[],
  meta?: UpdateMetadata
) => void;

type PathInterceptor = (
  ctx: {
    path: string;
    value: unknown;
    prev: unknown;
    blocked: boolean;
    blockReason?: string;
  },
  next: () => void
) => void | Promise<void>;

// ============================================
// BACKWARDS-COMPAT & CONVENIENCE TYPES (stable exports expected by consumers)
// These are intentionally simple aliases or fallbacks to keep the public API stable
// while allowing internal refactors of the type system.

// `CallableWritableSignal<T>` is declared as an interface (not an
// intersection) so TypeScript's overload-resolution picks the getter
// `(): T` first when `Signal<T>` inference walks the call signatures —
// e.g. for `toObservable(tree.$.x)`. Prior to 9.2.0 the global
// `declare module '@angular/core'` augmentation in core also added
// these overloads to the base `WritableSignal<T>` and incidentally
// masked the ordering issue; the interface form makes the contract
// self-contained.
export interface CallableWritableSignal<T> extends WritableSignal<T> {
  (): T;
  // ⚠️ 14.0.0 — THE SETTER OVERLOADS ARE GONE. They typed a call that did
  // nothing.
  //
  //   (value: NotFn<T>): void;
  //   (updater: (current: T) => T): void;
  //
  // A LEAF IS A REAL ANGULAR SIGNAL. Calling one is a READ; it returns the
  // value and discards the argument. Measured: `tree.$.count(5)` on a leaf
  // holding 0 left it at 0, silently. The same expression one level up —
  // `tree.$.user({ name: 'Bob' })` — DOES work, because a branch is our own
  // accessor and we own its call semantics. So the type promised a uniformity
  // the runtime never had, and the failure was invisible at both compile time
  // and run time.
  //
  // `@signaltree/callable-syntax` existed to close that gap by rewriting
  // `leaf(v)` to `leaf.set(v)` at build time. It cannot be delivered to an
  // Angular app at all (RFC 0008 §4, verified against a real build:
  // `@angular/build:application` exposes no `plugins`; `codePlugins` runs after
  // ngtsc has claimed every `.ts` — a probe received ZERO files; ngtsc's
  // transformer list is hardcoded; ts-patch goes inert under `isolatedModules`).
  // Angular is this library's primary audience, so for most users these
  // overloads could never have become true.
  //
  // The alternative — wrap every leaf so the call really sets — was measured
  // and rejected. Cost was not the problem (~4% on a set+get, inside noise);
  // IDENTITY was: a wrapper is not a signal. `isSignal(wrapper)` is `false` and
  // `Symbol(SIGNAL)` is absent, so `toObservable`, `model()`/`input()` interop
  // and every third-party tool that guards on `isSignal` would break. Trading
  // that for call-site sugar is a bad trade, and "leaves are real Angular
  // signals" is the interop guarantee the whole design rests on.
  //
  // Write a leaf with `.set()` / `.update()`. Branches stay callable.
}

export type AccessibleNode<T> = NodeAccessor<T> & TreeNode<T>;

// Removed v5 legacy helper types to reduce public surface area in v6

/** Symbol key for enhancer metadata (stable public export) */
export const ENHANCER_META = Symbol('signaltree:enhancer:meta');

// =============================================================================
// ENHANCER SYSTEM (v6)
// =============================================================================

/**
 * The capabilities an enhancer body receives — the UNION of what the built-in
 * neutral enhancers actually use, measured rather than guessed.
 *
 * DELIBERATELY NOT EXPORTED. It is an authoring context, not a tree model, and
 * publishing it would invite `NeutralSignalTree`-shaped speculation. It appears
 * in the emitted `.d.ts` as a non-exported interface because `Enhancer` names
 * it; that is structural reachability, not public API.
 *
 * WHY A FIXED TYPE AND NOT `<TTree extends EnhancerHost>`. The generic-constraint
 * form was tried and failed twice, for two independent reasons:
 *
 *   1. VARIANCE. `NodeAccessor<T>` has input positions (`(value: Partial<T>)`),
 *      so it is contravariant in `T` and `ISignalTree<Model>` is NOT assignable
 *      to a host declaring `bind(): NodeAccessor<unknown>`. The constraint could
 *      not be satisfied by a real tree.
 *   2. INFERENCE. A return of `TTree & TAdded` asks TypeScript to split ONE
 *      intersection against TWO inference targets. It cannot, so `TAdded`
 *      collapsed to `unknown` and every added method vanished from `.with()`.
 *
 * A fixed host has neither problem, because NOTHING in a public signature ever
 * needs a concrete tree to be assignable to it — only `with()`'s implementation
 * does, and that is one library-owned, audited assertion.
 */
interface EnhancerHost {
  readonly $: unknown;
  bind(thisArg?: unknown): NodeAccessor<unknown>;
  destroy(): void;
  registerCleanup(fn: EnhancerCleanup): void;
}

/**
 * Enhancer function that adds methods to a tree.
 * Generic parameter `TAdded` represents the methods being added.
 *
 * `TAdded` is the ONLY inference target here, which is why
 * `createEnhancer(meta, tree => Object.assign(tree, { foo() {} }))` infers with
 * no annotation, no explicit generic and no cast.
 *
 * The previous signature took `ISignalTree<unknown>`, documented as being
 * "to allow enhancers to be applied to trees that have already accumulated
 * methods from previous enhancers." That reason was wrong: `ISignalTree<unknown>`
 * contains no accumulated methods, and accumulation is produced entirely by
 * `with()` returning `this & TAdded`. The Angular coupling was historical
 * breadth, not semantics — no built-in enhancer body needed it.
 */
export type Enhancer<TAdded> = (tree: EnhancerHost) => EnhancerHost & TAdded;

/** Enhancer with optional metadata for ordering/debugging */
export type EnhancerWithMeta<TAdded> = Enhancer<TAdded> & {
  metadata?: EnhancerMeta;
};

export type TreeCapability =
  | 'mutation-capture'
  | 'position-topology'
  | 'causal-runtime'
  | 'temporal-snapshots';

/** Metadata for enhancer ordering and debugging */
export interface EnhancerMeta {
  name?: string;
  requires?: string[];
  provides?: string[];
  capabilities?: TreeCapability[];
  description?: string;
}

// Main public SignalTree interface expected by downstream packages

// Backwards-compatible aliases expected by older consumers
// v6: remove legacy `SignalTree` alias and multi-overload `WithMethod`.
// Consumers should use `SignalTree<T>` for the minimal runtime shape.

// Note: `SignalTree` alias is provided by the separate `types` package.
// Core now uses `SignalTree<T>` and the dedicated `types` package
// supplies the legacy `SignalTree<T>` declaration to avoid duplicate
// identifier collisions during monorepo type-checking.

// Provide lightweight aliases for legacy consumers importing from core.
// These are simple re-exports of the internal `ISignalTree` shape.
// Backwards-compatible alias: include TreeNode<T> so properties copied to
// the root callable are visible in TypeScript (legacy consumers rely on this)
export type SignalTree<T> = ISignalTree<T> & TreeNode<T>;
export type SignalTreeBase<T> = ISignalTree<T> & TreeNode<T>;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a SignalTree
 */
export function isSignalTree<T>(value: unknown): value is ISignalTree<T> {
  return (
    value !== null &&
    typeof value === 'function' && // It's a callable function
    'state' in value &&
    '$' in value &&
    'with' in value &&
    'destroy' in value
  );
}
