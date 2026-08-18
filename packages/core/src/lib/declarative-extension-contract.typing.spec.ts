/**
 * TYPE-TEST — compile-time only. Checked by
 * `tsc -p packages/core/tsconfig.typecheck.json`, EXCLUDED from vitest (the
 * `*typing*.spec.ts` ignore).
 *
 * WHAT THIS FILE IS FOR
 *
 * SHAPE-T0. It pins ONE theorem and deliberately nothing else:
 *
 *   Can a single `signalTree({...})` declaration receive every extension
 *   declaration BEFORE construction and produce the same accumulated public
 *   tree type that the `.with()` chain obtains through sequential
 *   `this & TAdded`, without degrading store or derived inference?
 *
 * A green result proves TYPE FEASIBILITY ONLY. It does not freeze the
 * declarative spelling, the word "extensions", the Extension-vs-Enhancer
 * ontology, runtime lowering, `plannedSignalTree`'s disposition, or `.with()`'s
 * disposition. Typing is the FIRST decisive falsifier for the declarative
 * shape, not the final proof of it: a red result kills the design immediately,
 * a green one only says the design is expressible.
 *
 * WHY THE DECLARATION IS INERT, WHICH IS THE POINT OF THE FILE
 *
 * An earlier scratch probe typed its extensions as `(t: unknown) => TAdded` —
 * today's callable `Enhancer` shape. That probe was green and proved the WRONG
 * theorem: "an array of old enhancers can have their `TAdded`s intersected."
 * The question that matters is whether TYPE CONTRIBUTION requires sequential
 * application at all, so `ExtensionDeclaration<TAdded>` below is INERT — it
 * carries `TAdded` phantom and is not callable, and it never receives a host
 * tree. If the rows still pass, contribution does not need a constructed tree.
 *
 * WHY THE FACADE USES THE REAL CONTRACT
 *
 * The probe used a toy `{ $: T }`. This file imports the production
 * `ISignalTree` / `TreeNode` / `NodeAccessor`, so the callable-tree contract,
 * the marker mapping in `TreeNode`, and the nested `NodeAccessor & TreeNode`
 * branch are all part of the subject. Only the CONSTRUCTION SIGNATURE is
 * declared locally, exactly as `derived-projection-contract.typing.spec.ts`
 * does — it is a probe signature, not a proposed API.
 *
 * FALSE GREENS ARE THE STANDING HAZARD
 *
 * RFC 0015 recorded an encoding that appeared to infer correctly and did not;
 * only revealing the inferred generic exposed it. So every precision claim here
 * is asserted POSITIVELY — an `IsAny` detector applied INSIDE the projector
 * where `$` actually lands, plus an operation that cannot launder `any` into a
 * plausible output type — and the negative controls are `@ts-expect-error`
 * rows that FAIL LOUDLY if the encoding ever becomes permissive enough to
 * accept them.
 */

import type { ISignalTree, NodeAccessor, TreeNode } from './types';

/* ------------------------------------------------------------------ *
 * Assertion helpers
 * ------------------------------------------------------------------ */

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Expect<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

/* ------------------------------------------------------------------ *
 * T0-A — the INERT extension declaration
 *
 * Not `(tree) => tree & TAdded`. No host tree, no call signature. `TAdded`
 * rides in a phantom position, which is the whole experiment: if the tree type
 * still accumulates, accumulation never needed sequential application.
 * ------------------------------------------------------------------ */

declare const ADDED: unique symbol;

interface ExtensionDeclaration<TAdded> {
  // COVARIANT phantom. Measured wrong first: `(added: TAdded) => void` puts
  // `TAdded` in a contravariant position, so `ExtensionDeclaration<{...}>` is
  // NOT assignable to `ExtensionDeclaration<unknown>` and the tuple constraint
  // rejects every real declaration. The variance of the phantom is load-bearing.
  readonly [ADDED]?: TAdded;
}

type AddedOf<E> = E extends ExtensionDeclaration<infer A> ? A : never;

type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

type AccumulatedAdditions<E extends readonly unknown[]> = UnionToIntersection<
  AddedOf<E[number]>
>;

/* ------------------------------------------------------------------ *
 * T0-B — probe construction signature over the REAL facade
 * ------------------------------------------------------------------ */

type DeclaredTree<S, D, E extends readonly unknown[]> = ISignalTree<S> & {
  readonly derived: { [K in keyof D]: D[K] extends (...a: never[]) => infer R ? R : never };
} & AccumulatedAdditions<E>;

declare function declareTree<
  S,
  const D extends Record<string, ($: TreeNode<S>) => unknown>,
  const E extends readonly ExtensionDeclaration<unknown>[]
>(config: { store: S; derived?: D; extensions?: E }): DeclaredTree<S, D, E>;

/* Two extension declarations with disjoint contributions. */
declare function transactionsDecl(): ExtensionDeclaration<{
  transaction(fn: () => void): void;
}>;
declare function timeTravelDecl(): ExtensionDeclaration<{
  undo(): void;
  redo(): void;
  canUndo(): boolean;
}>;

/* ------------------------------------------------------------------ *
 * T0-C — the nine positive rows, all from ONE declaration
 * ------------------------------------------------------------------ */

const tree = declareTree({
  store: {
    count: 0,
    label: 'a',
    nested: { depth: 1, flag: true },
  },
  derived: {
    doubled: ($) => $.count() * 2,
    // cannot survive imprecision: `any + any` is `any`, so a `number` result
    // here is only possible if `$` is genuinely typed
    sum: ($) => $.count() + $.nested.depth(),
    // the detector, INSIDE the projector where `$` actually lands
    detect: ($) => {
      const dollarIsNotAny: IsAny<typeof $> = false;
      return dollarIsNotAny;
    },
  },
  extensions: [transactionsDecl(), timeTravelDecl()],
});

// 1. store leaf types remain precise
type _c1_leaf_number = Expect<Equal<ReturnType<typeof tree.$.count>, number>>;
type _c1_leaf_string = Expect<Equal<ReturnType<typeof tree.$.label>, string>>;

// 2. nested store topology remains precise — the NodeAccessor & TreeNode branch
type _c2_nested_leaf = Expect<
  Equal<ReturnType<typeof tree.$.nested.depth>, number>
>;
// MEASURED, and the toy probe could not have found it: `NodeAccessor` is
// OVERLOADED (read / partial-write / updater-write), and `ReturnType` resolves
// the LAST overload — `void` — not the read. Probe the READ signature at the
// value level, where a `void` result would fail loudly.
const _c2_nested_read: { depth: number; flag: boolean } = tree.$.nested();

// 3. the derived projector's `$` is precisely store-typed, asserted positively
// The projector returns `IsAny<typeof $>`, so a PRECISE `$` yields the literal
// `false`. Had `$` been `any`, `IsAny` would be `true` and the assignment inside
// the projector would already have failed. Both directions are pinned.
type _c3_dollar_not_any = Expect<Equal<typeof tree.derived.detect, false>>;

// 4. derived result types remain precise
type _c4_doubled = Expect<Equal<typeof tree.derived.doubled, number>>;
type _c4_sum_survived_any = Expect<Equal<typeof tree.derived.sum, number>>;

// 5/6/7. both extension contributions exist and coexist
type _c5_transaction = Expect<
  Equal<typeof tree.transaction, (fn: () => void) => void>
>;
type _c6_undo = Expect<Equal<typeof tree.undo, () => void>>;
type _c6_canUndo = Expect<Equal<typeof tree.canUndo, () => boolean>>;
type _c7_coexist = Expect<
  Equal<
    [typeof tree.transaction, typeof tree.redo] extends [
      (fn: () => void) => void,
      () => void
    ]
      ? true
      : false,
    true
  >
>;

// 8. the callable-tree contract survives accumulation
const _c8_callable_read: {
  count: number;
  label: string;
  nested: { depth: number; flag: boolean };
} = tree();
declare const accessorCheck: NodeAccessor<{
  count: number;
  label: string;
  nested: { depth: number; flag: boolean };
}>;
type _c8_is_node_accessor = Expect<
  typeof tree extends typeof accessorCheck ? true : false
>;

/* ------------------------------------------------------------------ *
 * T0-E — declaration order does not change the resulting TYPE
 *
 * Type accumulation is a SET/INTERSECTION concern, not a sequential
 * application concern. This says nothing about runtime execution order.
 * ------------------------------------------------------------------ */

const orderAB = declareTree({
  store: { count: 0 },
  extensions: [transactionsDecl(), timeTravelDecl()],
});
const orderBA = declareTree({
  store: { count: 0 },
  extensions: [timeTravelDecl(), transactionsDecl()],
});

type _e_order_irrelevant = Expect<
  Equal<
    AccumulatedAdditions<[ReturnType<typeof transactionsDecl>, ReturnType<typeof timeTravelDecl>]>,
    AccumulatedAdditions<[ReturnType<typeof timeTravelDecl>, ReturnType<typeof transactionsDecl>]>
  >
>;
type _e_both_orders_have_both = Expect<
  Equal<
    [typeof orderAB.transaction, typeof orderAB.undo] extends [
      typeof orderBA.transaction,
      typeof orderBA.undo
    ]
      ? true
      : false,
    true
  >
>;

/* ------------------------------------------------------------------ *
 * T0-D — negative controls. Each MUST error; an unused `@ts-expect-error`
 * is itself a compile error, so a permissive encoding fails loudly here.
 * ------------------------------------------------------------------ */

// @ts-expect-error store key does not exist
const _d_missing_key = tree.$.missingKey;

// @ts-expect-error method contributed by no declared extension
tree.notContributedByAnyExtension();

// @ts-expect-error derived result is number, not string
const _d_wrong_derived: string = tree.derived.doubled;

// @ts-expect-error extension method argument is checked
tree.transaction(42);

// a capability from an extension NOT present in this declaration must not exist
const withoutTimeTravel = declareTree({
  store: { count: 0 },
  extensions: [transactionsDecl()],
});
// @ts-expect-error timeTravel was not declared here
withoutTimeTravel.undo();

// the projector parameter is typed, so a bogus member is rejected
declareTree({
  store: { count: 0 },
  derived: {
    // @ts-expect-error `$.count` is a signal accessor, not a string
    bogus: ($) => $.count().definitelyNotANumberMethod(),
  },
});

/* ------------------------------------------------------------------ *
 * T0-F — collision falsifier
 *
 * Two declarations contributing the SAME public key with INCOMPATIBLE types.
 * `.with()` serializes contributions; a declarative compiler sees the whole set
 * at once. This records only the TYPING FACT and designs no collision policy.
 * ------------------------------------------------------------------ */

declare function collidesA(): ExtensionDeclaration<{ shared(): number }>;
declare function collidesB(): ExtensionDeclaration<{ shared(): string }>;

const collided = declareTree({
  store: { count: 0 },
  extensions: [collidesA(), collidesB()],
});

/**
 * MEASURED, not designed, and measured wrong first: intersection produces NO
 * error at the declaration site. `{shared(): number} & {shared(): string}` is an
 * overloaded member, and the LAST constituent wins under probing — not the
 * first, as an earlier draft of this row assumed. The declaration order of the
 * extensions silently decides which contribution survives.
 */
type _f_collision_is_silent = Expect<
  Equal<ReturnType<typeof collided.shared>, string>
>;

/**
 * The consequence, pinned so it cannot be discovered late: a colliding
 * contribution is NOT surfaced by the type system under a plain intersection.
 * Whether the compiler should reject it is a POLICY question this file does not
 * answer — but any future declarative form that relies on intersection alone
 * inherits silent shadowing, which is strictly worse than `.with()`'s
 * serialization only because it is invisible.
 */
type _f_first_contribution_shadowed = Expect<
  Equal<Equal<ReturnType<typeof collided.shared>, number>, false>
>;

/* ------------------------------------------------------------------ *
 * T0-G — STATIC COLLISION REJECTION
 *
 * T0-F measured the hole: incompatible same-key contributions form an
 * overloaded member with NO declaration-site error. SHAPE-T1 CASE 3 closed the
 * RUNTIME half (whole-set DISCOVER refuses before exposure). This section asks
 * the remaining half:
 *
 *   Can the construction signature reject incompatible contributions AT THE
 *   DECLARATION SITE, while preserving every T0 inference property?
 *
 * The mechanism: walk the tuple accumulating contributed keys, and yield the
 * colliding key names. When that set is non-empty, the config parameter gains a
 * REQUIRED property the caller has not written, so the object literal fails
 * where it is authored — and the message names the offending key.
 * ------------------------------------------------------------------ */

type ContributionsOf<E extends readonly unknown[]> = {
  [I in keyof E]: AddedOf<E[I]>;
};

/** Keys contributed by more than one declaration, with INCOMPATIBLE types. */
type CollidingKeys<
  Parts extends readonly unknown[],
  Seen = unknown
> = Parts extends readonly [infer H, ...infer R]
  ? // keys of H already present in Seen, whose types disagree
    | {
        [K in Extract<keyof H, keyof Seen>]: Equal<
          H[K],
          Seen[K & keyof Seen]
        > extends true
          ? never
          : K;
      }[Extract<keyof H, keyof Seen>]
    | CollidingKeys<R, Seen & H>
  : never;

type Collisions<E extends readonly unknown[]> = CollidingKeys<
  ContributionsOf<E>
>;

/** Empty unless a collision exists; then a property the caller cannot satisfy. */
type CollisionGuard<E extends readonly unknown[]> = [Collisions<E>] extends [
  never
]
  ? unknown
  : { readonly CONFLICTING_EXTENSION_CONTRIBUTION: Collisions<E> };

declare function guardedTree<
  S,
  const D extends Record<string, ($: TreeNode<S>) => unknown>,
  const E extends readonly ExtensionDeclaration<unknown>[]
>(
  config: { store: S; derived?: D; extensions?: E } & CollisionGuard<E>
): DeclaredTree<S, D, E>;

// g1 — disjoint contributions still compile, and still accumulate
const guardedOk = guardedTree({
  store: { count: 0, label: 'a' },
  derived: { doubled: ($) => $.count() * 2 },
  extensions: [transactionsDecl(), timeTravelDecl()],
});
type _g1_accumulates = Expect<
  Equal<typeof guardedOk.transaction, (fn: () => void) => void>
>;
type _g1_other_side = Expect<Equal<typeof guardedOk.undo, () => void>>;

// g2 — store inference stays precise under the guard
type _g2_store = Expect<Equal<ReturnType<typeof guardedOk.$.count>, number>>;
type _g2_label = Expect<Equal<ReturnType<typeof guardedOk.$.label>, string>>;

// g3 — derived `$` is still not `any`, asserted positively under the guard
const guardedDetect = guardedTree({
  store: { count: 0 },
  derived: {
    detect: ($) => {
      const dollarIsNotAny: IsAny<typeof $> = false;
      return dollarIsNotAny;
    },
  },
  extensions: [transactionsDecl()],
});
type _g3_not_any = Expect<Equal<typeof guardedDetect.derived.detect, false>>;

// g4 — derived results survive an operation that cannot launder `any`
const guardedSum = guardedTree({
  store: { count: 0 },
  derived: { sum: ($) => $.count() + $.count() },
  extensions: [timeTravelDecl()],
});
type _g4_sum = Expect<Equal<typeof guardedSum.derived.sum, number>>;

// g5 — THE ROW THIS SECTION EXISTS FOR.
// Incompatible same-key contributions now fail where they are authored.
// @ts-expect-error `shared` is contributed twice with incompatible types; the
// guard names the offending key in the message
guardedTree({
  store: { count: 0 },
  extensions: [collidesA(), collidesB()],
});

// g6 — and in the reverse order, so the guard is not order-sensitive
// @ts-expect-error same collision in the reverse order — the guard is not
// order-sensitive
guardedTree({
  store: { count: 0 },
  extensions: [collidesB(), collidesA()],
});

// g7 — order reversal does not change the valid resulting type
const guardedAB = guardedTree({
  store: { count: 0 },
  extensions: [transactionsDecl(), timeTravelDecl()],
});
const guardedBA = guardedTree({
  store: { count: 0 },
  extensions: [timeTravelDecl(), transactionsDecl()],
});
type _g7_order_irrelevant = Expect<
  Equal<
    [typeof guardedAB.transaction, typeof guardedAB.undo] extends [
      typeof guardedBA.transaction,
      typeof guardedBA.undo
    ]
      ? true
      : false,
    true
  >
>;

/**
 * CHARACTERIZED, not designed: two declarations contributing the SAME key with
 * an IDENTICAL type are accepted by this guard, because the comparison is
 * `Equal<H[K], Seen[K]>`. Whether identical duplicate contribution should be
 * legal is a POLICY question this file does not answer — it is recorded so the
 * behaviour is a known choice rather than an accident.
 */
declare function twinA(): ExtensionDeclaration<{ shared(): number }>;
declare function twinB(): ExtensionDeclaration<{ shared(): number }>;
const twins = guardedTree({
  store: { count: 0 },
  extensions: [twinA(), twinB()],
});
type _g8_identical_twins_allowed = Expect<
  Equal<ReturnType<typeof twins.shared>, number>
>;

export { guardedOk, guardedDetect, guardedSum, guardedAB, guardedBA, twins };
export { _c2_nested_read, _c8_callable_read, _d_missing_key, _d_wrong_derived };

export type {
  _c1_leaf_number,
  _c1_leaf_string,
  _c2_nested_leaf,
  _c3_dollar_not_any,
  _c4_doubled,
  _c4_sum_survived_any,
  _c5_transaction,
  _c6_undo,
  _c6_canUndo,
  _c7_coexist,
  _c8_is_node_accessor,
  _e_order_irrelevant,
  _e_both_orders_have_both,
  _f_collision_is_silent,
  _f_first_contribution_shadowed,
  _g1_accumulates,
  _g1_other_side,
  _g2_store,
  _g2_label,
  _g3_not_any,
  _g4_sum,
  _g7_order_irrelevant,
  _g8_identical_twins_allowed,
};
