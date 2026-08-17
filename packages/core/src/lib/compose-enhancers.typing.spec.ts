/**
 * TYPE-TEST — compile-time only. Checked by
 * `tsc -p packages/core/tsconfig.typecheck.json`, EXCLUDED from vitest (the
 * `*typing*.spec.ts` ignore).
 *
 * CHARACTERIZATION of `composeEnhancers` before deciding its fate.
 *
 * The ledger records the rationale for deleting it — "typed `(tree: T) => T`,
 * so it erases `TAdded`". That is a reading of a signature, not a measurement
 * of what a consumer gets. This file measures it, and deliberately keeps the
 * two questions apart, because "runtime equivalent" and "type equivalent" are
 * different properties and conflating them is how a bad API survives review:
 *
 *   P2  SEMANTIC CAPABILITY  does it permit a composition that ordered
 *                            enhancer application cannot express?
 *   P3  TYPE CONTRACT        does it preserve accumulated enhancer additions,
 *                            or erase them?
 *
 * P2's runtime half lives in `compose-enhancers.spec.ts`. This is P3.
 *
 * NOTE ON SCOPE: the canonical replacement is `tree.with(A).with(B)`, which
 * exists today. Nothing here depends on variadic `tree.with(A, B)` — that is a
 * separate, independently-decided API item, and coupling them would merge two
 * decisions that were deliberately separated.
 */
import { composeEnhancers } from '../authoring';
import { signalTree } from './signal-tree';

import type { Enhancer } from '../index';

// --- compile-time assertion helpers -----------------------------------------
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;

interface AMethods {
  a(): string;
}
interface BMethods {
  b(): number;
}

declare const A: Enhancer<AMethods>;
declare const B: Enhancer<BMethods>;

const tree = signalTree({ count: 0 });

// ============================================================================
// CONTROL — the canonical path preserves BOTH enhancers' additions
// ============================================================================
// This is the row that makes the composed result below meaningful. Without it,
// "composed loses `a`" could just mean the fixture is wrong.
const chained = tree.with(A).with(B);
export const _chainedA: string = chained.a();
export const _chainedB: number = chained.b();
// ...and the state surface is untouched.
export const _chainedState: number = chained.$.count();

// ============================================================================
// P3 — the composed result ERASES both
// ============================================================================
// `composeEnhancers<T>(...enhancers: Array<(tree: T) => T>): (tree: T) => T`
// uses ONE `T` for the parameter and the return, so there is no type variable
// left to carry what an enhancer ADDS. `TAdded` is not merely widened — it has
// nowhere to go.
const composed = composeEnhancers(A, B);
const composedTree = tree.with(composed);

// @ts-expect-error composeEnhancers erased `a` — present at runtime, gone from the type
composedTree.a();
// @ts-expect-error composeEnhancers erased `b` — present at runtime, gone from the type
composedTree.b();

// The erasure is total, not partial: the composed result adds NOTHING to the
// tree's type. Recovering `a`/`b` requires a cast or a hand-written
// re-annotation, which is precisely the workaround the chained form removes.
export type _ComposedAddsNothing = Expect<
  Equal<typeof composedTree, typeof tree>
>;

// The state surface does survive — this is an ADDITIONS-erasure, not a
// wholesale type loss. Stating it precisely matters: the defect is narrower
// than "composeEnhancers breaks the type" and the accurate claim is stronger.
export const _composedState: number = composedTree.$.count();

// ============================================================================
// P3b — the SINGLE-enhancer case is worse: it does not apply AT ALL
// ============================================================================
// This is not the defect the ledger recorded, and it is a stronger one. With
// one enhancer there is no second type to force `T` down to a common supertype,
// so `T` infers as `EnhancerHost & AMethods` from the RETURN, and `T`'s
// parameter position then DEMANDS it:
//
//     composeEnhancers(A)  ->  (tree: EnhancerHost & AMethods)
//                                     => EnhancerHost & AMethods
//
// i.e. a function that requires the tree to ALREADY have `a` before it can add
// `a`. `.with()` rejects it against both overloads:
//
//     Type 'EnhancerHost' is not assignable to type 'EnhancerHost & AMethods'.
//       Property 'a' is missing in type 'EnhancerHost'
//
// So the two arities fail differently, and neither is usable:
//
//     composeEnhancers(A)      does not compile when applied
//     composeEnhancers(A, B)   compiles, silently erases every addition
//
// The 2-argument case only "works" because two disagreeing enhancers collapse
// `T` to `EnhancerHost`, which is exactly why it can carry nothing.
// @ts-expect-error a single composed enhancer demands the additions it exists to add
tree.with(composeEnhancers(A));

// The same enhancer applied directly is fine, which localizes the fault to
// `composeEnhancers` rather than to `.with()` or to `Enhancer<TAdded>`.
export const _directA: string = tree.with(A).a();
