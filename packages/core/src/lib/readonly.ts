import type { Signal, WritableSignal } from '@angular/core';

import type { SignalTreeBuilder } from './internals/builder-types';
import type { AsyncQuerySignal } from './markers/async-query';
import type { AsyncSourceSignal } from './markers/async-source';
import type { AsyncStreamSignal } from './markers/async-stream';
import type { EntityLoaderSurface } from './markers/entity-loader';
import type { FormSignal, FormWizard } from './markers/form';
import type { StatusSignal } from './markers/status';
import type { StoredSignal } from './markers/stored';
import type {
  CallableWritableSignal,
  EntitySignal,
  ISignalTree,
  NodeAccessor,
  TreeNode,
} from './types';

/**
 * READ-ONLY VIEW TYPES (RFC 0004 §4 step 2 — "Readonly, truthful and minimal")
 *
 * A read-only view is a **type-only** narrowing: `asReadonly(tree)` returns the
 * exact same runtime object, typed so that no write path is *offered*. It does
 * not protect against a deliberate `as any` bypass — it protects the common
 * case where a developer (or AI agent) reaches for a `.set()`/mutator that
 * simply isn't on the injected type. Pair it with a separate `@Injectable` Ops
 * service for the write path (see "Production architecture" in the root
 * README). A dev-mode throwing Proxy was considered and refuted (RFC 0004 §3
 * V-P2): it would hard-throw in dev and silently pass in prod for the repo's
 * own documented reader+Ops pattern, break Proxy invariants on the
 * non-configurable properties markers attach, and put a get-trap on the
 * hottest read path.
 *
 * Marker surfaces are narrowed via `Pick` over exported `const` reader-key
 * allowlists (below). This direction of drift is fail-safe: a *new* mutator
 * added to a marker interface stays invisible on the readonly view until
 * someone deliberately adds it to the reader list; a renamed/removed reader
 * key fails `tsc` loudly at the `Pick` site.
 */

// =============================================================================
// PER-MARKER READER ALLOWLISTS (const — importable by parity fixtures)
// =============================================================================
// NOTE: ASYNC_STREAM_READERS / ReadonlyAsyncStreamSignal are deliberately NOT
// re-exported from the barrel — `asyncStream` itself is non-barrel-exported
// (RFC 0001 §5), and its readonly view follows it. Parity fixtures import them
// from './readonly' directly.

/**
 * Readers on {@link EntitySignal}. Mutators (`addOne`, `upsertOne`,
 * `removeWhere`, `setAll`, …) and the hook registrars (`tap`, `intercept` —
 * lifecycle capabilities, not state reads) are deliberately absent.
 * `byId`/`byIdOrFail` are not in this list because they are re-signed (their
 * `EntityNode` result is deep-writable) — see {@link ReadonlyEntitySignal}.
 */
export const ENTITY_READERS = [
  'all',
  'count',
  'ids',
  'has',
  'empty',
  'map',
  'where',
  'find',
] as const;

/**
 * Readers on {@link EntityLoaderSurface}. `load`/`loadOrThrow`/`refresh`/
 * `invalidate` all mutate loader state (they fetch, or mark the scope stale)
 * and are deliberately absent — triggering a load is an Ops-service concern.
 */
export const ENTITY_LOADER_READERS = [
  'loading',
  'loaded',
  'error',
  'lastLoadedAt',
  'params',
] as const;

/**
 * Readers on {@link StatusSignal}. The `state`/`error` source signals are
 * `WritableSignal`s on the full surface; the readonly view demotes them to
 * plain `Signal`s. `setLoading`/`setError`/`reset`/`start`/`fail`/… are absent.
 */
export const STATUS_READERS = [
  'state',
  'error',
  'notLoaded',
  'loading',
  'loaded',
  'hasError',
] as const;

/**
 * Readers on {@link FormSignal}. `set`/`patch`/`reset`/`clear`, validation
 * triggers (`validate`, `validateField`, `touch`, `touchAll`, `submit` — they
 * write error/touched/submitting state), persistence (`persistNow`, `reload`,
 * `clearStorage`), and the deep-writable `$` field accessors are deliberately
 * absent. Read individual fields through `data()`/the call form. `wizard` is
 * not in this list because it is re-signed (its full surface carries the
 * navigation mutators) — see {@link ReadonlyFormWizard}.
 */
export const FORM_READERS = [
  'data',
  'valid',
  'dirty',
  'submitting',
  'touched',
  'errors',
  'errorList',
] as const;

/**
 * Readers on {@link FormWizard} — the pure progress signals, so a readonly
 * consumer can render wizard position. `next`/`prev`/`goTo`/`reset` navigate
 * (they write step state) and are deliberately absent.
 */
export const FORM_WIZARD_READERS = [
  'currentStep',
  'stepName',
  'steps',
  'canNext',
  'canPrev',
  'isLastStep',
  'isFirstStep',
] as const;

/** Readers on {@link StoredSignal}. `set`/`update`/`clear`/`reload` are absent. */
export const STORED_READERS = ['key', 'version'] as const;

/** Readers on {@link AsyncSourceSignal}. `refresh`/`set`/`update`/`reset` are absent. */
export const ASYNC_SOURCE_READERS = ['data', 'loading', 'error'] as const;

/**
 * Readers on {@link AsyncQuerySignal}. `input` is a `WritableSignal` on the
 * full surface (writing it drives the query); the readonly view demotes it to
 * a plain `Signal`. `rerun`/`reset` are absent.
 */
export const ASYNC_QUERY_READERS = [
  'input',
  'results',
  'data',
  'loading',
  'error',
] as const;

/** Readers on {@link AsyncStreamSignal}. `start`/`refresh`/`regenerate`/`cancel`/`reset` are absent. */
export const ASYNC_STREAM_READERS = ['data', 'loading', 'error', 'done'] as const;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Demote a `WritableSignal` member to a plain `Signal` read; everything else
 * (reader methods, already-readonly signals) passes through unchanged.
 * Note `CallableWritableSignal` extends `WritableSignal`, so it demotes too.
 */
type DemoteWritable<T> = T extends WritableSignal<infer V> ? Signal<V> : T;

/**
 * `Pick` over a reader-key allowlist, demoting any picked `WritableSignal`
 * member to `Signal`. Call signatures are NOT carried by mapped types — views
 * that keep the marker's zero-arg read call re-add it via intersection.
 */
type PickReaders<T, K extends keyof T> = {
  readonly [P in K]: DemoteWritable<T[P]>;
};

/**
 * Read-only counterpart to {@link NodeAccessor} — only the zero-arg read form.
 */
export interface ReadonlyNodeAccessor<T> {
  (): T;
}

/**
 * Extra members deep-merged INTO a marker node by `.derived()` (e.g.
 * `.derived($ => ({ plants: { total: computed(…) } }))` where `plants` is a
 * loading `entityMap`). The marker dispatch rows re-sign the node to a
 * Pick-allowlist view, which on its own would silently swallow those
 * intersection extras (the readonly×merged-derived gap) — so every marker row
 * intersects its readonly marker view with the {@link ReadonlyView}-mapped
 * remainder beyond the marker interface: derived `Signal`s survive,
 * `WritableSignal` extras demote to `Signal`, unknown functions degrade to
 * `{}` (fail-safe — a function we can't classify may mutate, so it is not
 * offered). Resolves to `unknown` (identity under `&`) when there are no
 * extras, so marker-only nodes keep types exactly equal to their views.
 */
type ReadonlyExtras<N, Base> = keyof Omit<N, keyof Base> extends never
  ? unknown
  : ReadonlyView<Omit<N, keyof Base>>;

// =============================================================================
// PER-MARKER READ-ONLY VIEWS
// =============================================================================

/**
 * Read-only counterpart to `EntityNode<E>` — zero-arg read call plus deep
 * `Signal` leaves, no write call signatures and no leaf `.set`/`.update`.
 * Mirrors `EntityNode`'s branch/array/leaf shape exactly.
 */
export type ReadonlyEntityNode<E> = {
  (): E;
} & {
  readonly [P in keyof E]: E[P] extends object
    ? E[P] extends readonly unknown[]
      ? Signal<E[P]>
      : ReadonlyEntityNode<E[P]>
    : Signal<E[P]>;
};

/**
 * Read-only view of {@link EntitySignal}: query surface only. `byId`/
 * `byIdOrFail` are re-signed to return {@link ReadonlyEntityNode} — the full
 * surface returns a deep-writable `EntityNode`, which would leak the write
 * path through a "readonly" view (RFC 0004 §3 V-P2).
 */
export type ReadonlyEntitySignal<E, K extends string | number = string> =
  PickReaders<EntitySignal<E, K>, (typeof ENTITY_READERS)[number]> & {
    /** Re-signed: same node at runtime, typed without write reachability. */
    byId(id: K): ReadonlyEntityNode<E> | undefined;
    /** Re-signed: same node at runtime, typed without write reachability. */
    byIdOrFail(id: K): ReadonlyEntityNode<E>;
  };

/** Read-only view of {@link EntityLoaderSurface}: status signals only. */
export type ReadonlyEntityLoaderSurface<P = void> = PickReaders<
  EntityLoaderSurface<P>,
  (typeof ENTITY_LOADER_READERS)[number]
>;

/** Read-only view of a loading `entityMap({ load, … })` collection. */
export type ReadonlyLoadingEntitySignal<
  E,
  K extends string | number = string,
  P = void
> = ReadonlyEntitySignal<E, K> & ReadonlyEntityLoaderSurface<P>;

/** Read-only view of {@link StatusSignal}: `state`/`error` demoted to `Signal`, predicates kept. */
export type ReadonlyStatusSignal<E = Error> = PickReaders<
  StatusSignal<E>,
  (typeof STATUS_READERS)[number]
>;

/** Read-only view of {@link FormWizard}: progress signals only, navigation not offered. */
export type ReadonlyFormWizard = PickReaders<
  FormWizard,
  (typeof FORM_WIZARD_READERS)[number]
>;

/** Read-only view of {@link FormSignal}: value + validation reads, callable read kept. */
export type ReadonlyFormSignal<F extends Record<string, unknown>> = {
  (): F;
} & PickReaders<FormSignal<F>, (typeof FORM_READERS)[number]> & {
    /** Re-signed (and optional, mirroring {@link FormSignal}): progress reads only. */
    readonly wizard?: ReadonlyFormWizard;
  };

/** Read-only view of {@link StoredSignal}: callable read + storage metadata. */
export type ReadonlyStoredSignal<V> = {
  (): V;
} & PickReaders<StoredSignal<V>, (typeof STORED_READERS)[number]>;

/** Read-only view of {@link AsyncSourceSignal}: callable read + data/loading/error. */
export type ReadonlyAsyncSourceSignal<V> = {
  (): V | undefined;
} & PickReaders<AsyncSourceSignal<V>, (typeof ASYNC_SOURCE_READERS)[number]>;

/** Read-only view of {@link AsyncQuerySignal}: callable read + demoted `input` + results. */
export type ReadonlyAsyncQuerySignal<In, Out> = {
  (): Out | undefined;
} & PickReaders<AsyncQuerySignal<In, Out>, (typeof ASYNC_QUERY_READERS)[number]>;

/** Read-only view of {@link AsyncStreamSignal}: callable read + data/loading/error/done. */
export type ReadonlyAsyncStreamSignal<C, S> = {
  (): S;
} & PickReaders<AsyncStreamSignal<C, S>, (typeof ASYNC_STREAM_READERS)[number]>;

// =============================================================================
// THE VIEW
// =============================================================================

/**
 * Per-member dispatch for {@link ReadonlyView}.
 *
 * ORDER IS LOAD-BEARING — these surfaces structurally overlap:
 * - Every marker row intersects {@link ReadonlyExtras} so derived state
 *   deep-merged INTO the marker node (`.derived($ => ({ plants: { total } }))`)
 *   survives the Pick-allowlist re-signing instead of being swallowed.
 * - Marker surfaces come first: every marker signal is callable and/or
 *   structurally satisfies `NodeAccessor` (a single `(): T` call signature
 *   satisfies all three `NodeAccessor` overloads under TS's fewer-params
 *   rule), so a later row would swallow them.
 * - `CallableWritableSignal` before `Signal`: it extends `Signal`.
 * - `Signal` before `NodeAccessor`: `Signal<V>`'s bare `() => V` structurally
 *   satisfies `NodeAccessor<V>` (fewer-params rule again), so putting
 *   `NodeAccessor` first would capture every derived computed as a "branch".
 *   The converse is safe: a branch accessor can never match `Signal` because
 *   it lacks Angular's `SIGNAL` brand property. This row also catches plain
 *   `WritableSignal`s from `linked()` and narrows them to `Signal`.
 * - Branch accessors (`NodeAccessor<U> & TreeNode<U>`) recurse; the mapped
 *   type drops the write call signatures, `ReadonlyNodeAccessor` re-adds the
 *   zero-arg read.
 * - Bare objects (derived-only groups, `{ group: { total: computed(…) } }`)
 *   have no call signature — they miss the `NodeAccessor` row and recurse
 *   through the object row. Plain function members degrade to `{}` there:
 *   fail-safe (an unknown function may mutate; it is not offered).
 *
 * Dispatch is structural (the accumulated `$` type carries materialized
 * signal surfaces, not brandable markers), so a future marker without a row
 * here degrades *silently* — the parity fixture in `readonly.typing.spec.ts`
 * is the maintained guard (RFC 0004 §3 V-P2). Add a row + fixture line for
 * every new marker.
 */
type ReadonlyViewOf<T> = T extends EntitySignal<
  infer E,
  infer K extends string | number
> &
  EntityLoaderSurface<infer P>
  ? ReadonlyLoadingEntitySignal<E, K, P> &
      ReadonlyExtras<T, EntitySignal<E, K> & EntityLoaderSurface<P>>
  : T extends EntitySignal<infer E, infer K extends string | number>
  ? ReadonlyEntitySignal<E, K> & ReadonlyExtras<T, EntitySignal<E, K>>
  : T extends StatusSignal<infer Err>
  ? ReadonlyStatusSignal<Err> & ReadonlyExtras<T, StatusSignal<Err>>
  : T extends FormSignal<infer F>
  ? ReadonlyFormSignal<F> & ReadonlyExtras<T, FormSignal<F>>
  : T extends StoredSignal<infer V>
  ? ReadonlyStoredSignal<V> & ReadonlyExtras<T, StoredSignal<V>>
  : T extends AsyncQuerySignal<infer In, infer Out>
  ? ReadonlyAsyncQuerySignal<In, Out> &
      ReadonlyExtras<T, AsyncQuerySignal<In, Out>>
  : T extends AsyncStreamSignal<infer C, infer S>
  ? ReadonlyAsyncStreamSignal<C, S> &
      ReadonlyExtras<T, AsyncStreamSignal<C, S>>
  : T extends AsyncSourceSignal<infer V>
  ? ReadonlyAsyncSourceSignal<V> & ReadonlyExtras<T, AsyncSourceSignal<V>>
  : T extends CallableWritableSignal<infer V>
  ? Signal<V>
  : T extends Signal<infer V>
  ? Signal<V>
  : T extends NodeAccessor<infer U>
  ? ReadonlyNodeAccessor<U> & ReadonlyView<T>
  : T extends object
  ? ReadonlyView<T>
  : T;

/**
 * Read-only mapped view over a tree's **accumulated** `$` type (the builder's
 * `TAccum` — `TreeNode<TSource>` plus every `.derived()` layer), NOT over the
 * raw source `T`. Computing the view from the source type was the original
 * bug (RFC 0004 F1): it silently dropped every derived computed.
 *
 * - leaf `CallableWritableSignal<V>` → `Signal<V>`
 * - branch `NodeAccessor<U> & children` → zero-arg read + mapped children
 * - derived `Signal`s pass through; `linked()` `WritableSignal`s narrow to `Signal`
 * - marker surfaces → their `Readonly*` views (reader allowlists above)
 */
export type ReadonlyView<T> = {
  readonly [K in keyof T]: ReadonlyViewOf<T[K]>;
};

/**
 * The read-only store surface: read-only `$` plus the zero-arg snapshot read
 * and lifecycle (`destroy()`/`destroyed`). This is the injected type of
 * `defineStore(factory, { expose: 'readonly' })` and the return type of
 * {@link asReadonly}.
 *
 * Deliberately excludes `with()` (construction-time capability), `bind()`
 * (returns a writable accessor), `updateAndReport()` (writes state), and
 * `registerCleanup()` (enhancer plumbing) — each would let a "reader" reach a
 * write path. Also excludes the `state` alias (read-equivalent of `$`,
 * dropped for surface minimality — one name for the read surface).
 *
 * @typeParam TSource - the raw source state type (snapshot shape)
 * @typeParam TAccum - the accumulated `$` type; defaults to `TreeNode<TSource>`
 */
export interface ReadonlyStore<TSource, TAccum = TreeNode<TSource>> {
  /** Zero-arg snapshot read — the write overloads are not offered. */
  (): TSource;
  readonly $: ReadonlyView<TAccum>;
  /** Whether this tree has been destroyed. */
  readonly destroyed: Signal<boolean>;
  destroy(): void;
}

// =============================================================================
// asReadonly()
// =============================================================================

/**
 * Narrow a tree to its {@link ReadonlyStore} view. **Type-only** — returns the
 * exact same runtime object (identity, zero overhead); see the module docs
 * for the threat model this does and does not cover.
 *
 * This is the primary readonly surface. Unlike an options-overload it cannot
 * silently no-op: any tree-shaped value either matches an overload and is
 * narrowed, or fails to compile (RFC 0004 F2 dies structurally).
 *
 * @example
 * ```ts
 * const tree = signalTree({ count: 0 })
 *   .derived(($) => ({ doubled: computed(() => $.count() * 2) }));
 *
 * const reader = asReadonly(tree);
 * reader.$.count();        // ✅ read
 * reader.$.doubled();      // ✅ derived computeds survive
 * // reader.$.count.set(1) // ❌ compile error — not offered
 * ```
 */
export function asReadonly<TSource, TAccum>(
  tree: SignalTreeBuilder<TSource, TAccum>
): ReadonlyStore<TSource, TAccum>;
export function asReadonly<TSource>(
  tree: ISignalTree<TSource>
): ReadonlyStore<TSource>;
export function asReadonly(tree: object): object {
  return tree;
}
