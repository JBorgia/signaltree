/**
 * TYPE-TEST — compile-time only. Checked by
 * `tsc -p packages/core/tsconfig.typecheck.json`, EXCLUDED from vitest (the
 * `*typing*.spec.ts` ignore).
 *
 * WHAT THIS FILE IS FOR
 *
 * This file pins the DERIVED-T0/T0.1/T1/T1A derivation. It is deliberately
 * SELF-CONTAINED: it declares its own probe signatures and imports nothing from
 * `../index`. None of the shapes below are production API, and this file must
 * not be read as proposing one. It exists so that a future attempt to give
 * `derived` a single-declaration form cannot re-adopt an encoding that was
 * already measured and refuted, and cannot mistake a false green for a result.
 *
 * WHY A FALSE GREEN IS THE SUBJECT
 *
 * The proposed encoding for single-declaration derived state was
 * `derived: D & CheckedDerived<S, D>`, and it appears to work: `fullName`
 * infers `string`, `subtotal` and `tax` infer `number`. All three are artifacts.
 * `$` is `any` in every projector, a template literal is `string` regardless,
 * and `any * 0.08` is `number` by the arithmetic operator's own rule. Only
 * `total` — `any + any` — exposes it, because `+` propagates `any`.
 *
 * So a row asserting `tax` is `number` would PASS on a completely untyped
 * facade. Sections A and B therefore assert the leak POSITIVELY, with an
 * `IsAny` detector, rather than asserting the absence of an error. A refutation
 * that is only recorded in prose gets re-attempted; one pinned as a passing
 * type row cannot be silently reintroduced.
 *
 * THE PATTERN, WHICH IS NOT ABOUT `derived`
 *
 * When a candidate type encoding is rejected for LOSING PRECISION rather than
 * for failing to compile, the evidence must be a positive assertion about the
 * imprecision. "It compiles" and "it infers the right type" are both satisfied
 * by an `any`-typed parameter, so neither can distinguish a working encoding
 * from a vacuous one. Reach for a detector (`IsAny`), and reach for an
 * operation that CANNOT survive the imprecision — here
 * `.definitelyNotANumberMethod()`, which errors on `number` and is accepted by
 * `any`. Section B is that probe: it pins that a return-type annotation
 * launders the `any` instead of removing it.
 *
 * WHAT IT DELIBERATELY DOES NOT PIN
 *
 * It does not assert that today's chained `.derived()` should be deleted, that
 * `linked()` belongs anywhere in particular, or that any single-declaration
 * spelling wins. T1A refuted SignalTree's OWNERSHIP of shared memoization; the
 * function survives and three mechanisms provide it. Those are architecture
 * decisions, and freezing them here would make this file contradict whichever
 * one is chosen. Assert the measured type properties; leave the API free.
 *
 * A NOTE ON GENERALITY
 *
 * The rows below characterize TypeScript as measured, not TypeScript as
 * specified. Across the encodings tried — bare intersection, F-bounded
 * constraint, reverse-mapped result map, `ThisType`, overload phases,
 * `NoInfer`, defaulted type params, recursive skeletons, staged tuples — a
 * same-call contextual facade that depends on sibling projector return
 * inference either degrades to `any`, collapses to `unknown`, or loses
 * contextual typing entirely. That is a strong measurement, not a theorem about
 * every possible encoding, and it should not be cited as one.
 */

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

type AnyProj = (...a: any[]) => any;

interface StoreAccessor<T> {
  (): T;
  set(value: T): void;
  update(fn: (current: T) => T): void;
}
interface DerivedAccessor<T> {
  (): T;
}

// =============================================================================
// SECTION A — the refuted encoding, pinned as a POSITIVE statement of its leak
// =============================================================================

type A_StoreFacade<S> = { [K in keyof S]: StoreAccessor<S[K]> };
type A_DerivedFacade<D> = {
  readonly [K in keyof D]: D[K] extends (...a: any[]) => infer R
    ? DerivedAccessor<R>
    : never;
};
type A_Unified<S, D> = A_StoreFacade<S> & A_DerivedFacade<D>;
type A_Checked<S, D extends Record<string, AnyProj>> = {
  [K in keyof D]: ($: A_Unified<S, D>) => ReturnType<D[K]>;
};

declare function probeIntersection<
  S extends object,
  D extends Record<string, AnyProj>
>(config: { store: S; derived: D & A_Checked<S, D> }): {
  $: A_Unified<S, D>;
};

const refuted = probeIntersection({
  store: { quantity: 2, price: 10 },
  derived: {
    subtotal: ($) => $.quantity() * $.price(),
    tax: ($) => $.subtotal() * 0.08,
    total: ($) => $.subtotal() + $.tax(),
  },
});

// `tax` looks correct. It is `number` only because `any * 0.08` is `number`.
type _a_tax_is_number = Expect<
  Equal<ReturnType<typeof refuted.$.tax>, number>
>;
// `total` is the tell: `any + any` stays `any`. THIS is the refutation.
type _a_total_leaks_any = Expect<
  Equal<IsAny<ReturnType<typeof refuted.$.total>>, true>
>;

// =============================================================================
// SECTION B — a return annotation LAUNDERS the leak, it does not remove it
// =============================================================================

type B_KeyFacade<S, K extends string> = A_StoreFacade<S> & {
  readonly [P in K]: DerivedAccessor<any>;
};

declare function probeKeysOnly<
  S extends object,
  K extends string,
  D extends { [P in K]: ($: B_KeyFacade<S, K>) => unknown }
>(config: { store: S; derived: D & Record<K, unknown> }): {
  $: A_StoreFacade<S> & {
    readonly [P in keyof D]: DerivedAccessor<ReturnType<D[P]>>;
  };
};

const laundered = probeKeysOnly({
  store: { quantity: 2, price: 10 },
  derived: {
    subtotal: ($): number => $.quantity() * $.price(),
    // The body is UNCHECKED — `$.subtotal()` is `any`, so a method that exists
    // on no numeric type is accepted. The annotation still exports `number`.
    tax: ($): number => $.subtotal().definitelyNotANumberMethod(),
  },
});
// Exported type says `number` while the body was never checked. That gap is the
// finding: an annotation is not restored inference.
type _b_exported_number = Expect<
  Equal<ReturnType<typeof laundered.$.tax>, number>
>;

// =============================================================================
// SECTION C — the measured kernel: construction `$` sees STORE TRUTH ONLY
// =============================================================================

type DeepStore<T> = T extends object
  ? T extends readonly unknown[]
    ? StoreAccessor<T>
    : { [K in keyof T]: DeepStore<T[K]> } & StoreAccessor<T>
  : StoreAccessor<T>;

type DerivedNode<D> = D extends AnyProj
  ? DerivedAccessor<ReturnType<D>>
  : { readonly [K in keyof D]: DerivedNode<D[K]> };

/** Dotted paths where a STORE terminal and a DERIVED terminal collide. */
type Collisions<S, D> = {
  [K in Extract<keyof S & keyof D, string>]: D[K] extends AnyProj
    ? K
    : S[K] extends object
    ? S[K] extends readonly unknown[]
      ? K
      : `${K}.${Extract<Collisions<S[K], D[K]>, string>}`
    : K;
}[Extract<keyof S & keyof D, string>];

/** Branch overlap composes recursively; terminals are rejected by the guard. */
type Compose<S, D> = {
  [K in keyof S | keyof D]: K extends keyof D
    ? K extends keyof S
      ? Compose<S[K], D[K]> & StoreAccessor<S[K]>
      : DerivedNode<D[K]>
    : K extends keyof S
    ? DeepStore<S[K]>
    : never;
};

type DerivedSpec<$> = { [k: string]: (($: $) => unknown) | DerivedSpec<$> };

/**
 * Two details here are load-bearing and were each measured wrong first.
 *
 * The spec constraint must be an INDEX SIGNATURE. A recursive conditional over
 * `D` (`{ [K in keyof D]: D[K] extends AnyProj ? ... : ... }`) yields TS7006 and
 * no contextual type at all — the projector parameter goes bare.
 *
 * The collision guard must be a DEFAULTED TYPE PARAM read from the RETURN type.
 * Placed in the constraint it is evaluated against `D`'s constraint rather than
 * the inferred `D`, and fires on every non-colliding tree.
 */
declare function probeKernel<
  S extends object,
  D extends DerivedSpec<DeepStore<S>>,
  E extends string = Extract<Collisions<S, D>, string>
>(config: { store: S; derived: D }): [E] extends [never]
  ? { store: DeepStore<S>; derived: DerivedNode<D>; $: Compose<S, D> }
  : { __ERROR_store_and_derived_collide_at: E };

const kernel = probeKernel({
  store: {
    customer: { firstName: 'Ada', lastName: 'Lovelace' },
    quantity: 2,
    price: 10,
  },
  derived: {
    customer: {
      fullName: ($) => `${$.customer.firstName()} ${$.customer.lastName()}`,
    },
    subtotal: ($) => $.quantity() * $.price(),
  },
});

// Precise, with no user annotations anywhere and no `any` in any row.
type _c_subtotal = Expect<Equal<ReturnType<typeof kernel.$.subtotal>, number>>;
type _c_nested_derived = Expect<
  Equal<ReturnType<typeof kernel.derived.customer.fullName>, string>
>;
type _c_nested_store = Expect<
  Equal<ReturnType<typeof kernel.store.customer.firstName>, string>
>;
// A derived leaf and a store leaf coexist under the SAME overlapped branch.
type _c_branch_derived = Expect<
  Equal<ReturnType<typeof kernel.$.customer.fullName>, string>
>;
type _c_branch_store = Expect<
  Equal<ReturnType<typeof kernel.$.customer.firstName>, string>
>;
// The overlapped branch is still readable as a node, and reads STORE truth.
type _c_branch_node = Expect<
  Equal<
    ReturnType<typeof kernel.$.customer>,
    { firstName: string; lastName: string }
  >
>;
// No row above is vacuous: none of these is `any`.
type _c_no_any = Expect<
  Equal<IsAny<ReturnType<typeof kernel.$.subtotal>>, false>
>;

// A store leaf stays writable through the composed facade.
kernel.$.customer.firstName.set('Grace');
kernel.store.quantity.update((n) => n + 1);

// A derived leaf is read-only on both surfaces.
// @ts-expect-error derived projections have no `set`
kernel.$.subtotal.set(4);
// @ts-expect-error derived projections have no `set`
kernel.derived.subtotal.set(4);

// =============================================================================
// SECTION D — what the kernel REJECTS rather than silently widening
// =============================================================================

probeKernel({
  store: { quantity: 2 },
  // @ts-expect-error a member absent from store truth is not addressable
  derived: { bad: ($) => $.doesNotExist() },
});

probeKernel({
  store: { a: { b: 1 } },
  // @ts-expect-error nested store access is checked to the leaf
  derived: { c: ($) => $.a.nope() },
});

probeKernel({
  store: { quantity: 2 },
  // @ts-expect-error store leaves keep their precise type; `number` has no such method
  derived: { b2: ($) => $.quantity().definitelyNotANumberMethod() },
});

// Cross-derived sibling reference is REJECTED, never silently `any`. This row is
// the whole point of the store-only contract: the failure is a named missing
// member on the store facade, which is actionable, rather than a widened type.
probeKernel({
  store: { quantity: 2, price: 10 },
  derived: {
    subtotal: ($) => $.quantity() * $.price(),
    // @ts-expect-error `subtotal` is a projection, not store truth
    tax: ($) => $.subtotal() * 0.08,
  },
});

// Terminal collisions are reported as dotted paths, at the root and at depth.
const collidesRoot = probeKernel({
  store: { total: 1, quantity: 2 },
  derived: { total: ($) => $.quantity() },
});
type _d_root = Expect<
  Equal<typeof collidesRoot.__ERROR_store_and_derived_collide_at, 'total'>
>;

const collidesDeep = probeKernel({
  store: { customer: { name: 'Ada' } },
  derived: { customer: { name: ($) => $.customer.name().length } },
});
type _d_deep = Expect<
  Equal<
    typeof collidesDeep.__ERROR_store_and_derived_collide_at,
    'customer.name'
  >
>;

// Branch-only overlap is NOT a collision — this is the distinction that
// `DeepMergeTree`'s "derived wins at a terminal" rule does not draw.
type _d_branch_ok = Expect<
  Equal<
    Collisions<
      { customer: { firstName: string } },
      { customer: { fullName: AnyProj } }
    >,
    never
  >
>;
