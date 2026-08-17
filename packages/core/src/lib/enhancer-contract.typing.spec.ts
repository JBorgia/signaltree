/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE PERMANENT GUARD ON THE NEUTRAL ENHANCER CONTRACT.
 *
 * `Enhancer<TAdded>` is framework-neutral: it names `EnhancerHost`, not
 * `ISignalTree`, so nothing in the enhancer-authoring surface reaches Angular.
 * The value of that is real but the RISK is invisible to every other gate, which
 * is why this file exists rather than a comment.
 *
 * WHY PACKAGE BUILDS CANNOT REPLACE THIS. Two earlier neutral encodings were
 * adopted after `nx build core` went green, and both were broken:
 *
 *   1. `bind(): NodeAccessor<unknown>` on a GENERIC host constraint. Variance
 *      killed it — `NodeAccessor<T>` has input positions (`(value: Partial<T>)`),
 *      so no real tree satisfied the constraint.
 *   2. `<TTree extends EnhancerHost>(tree: TTree) => TTree & TAdded`. TypeScript
 *      cannot split one intersection against two inference targets, so `TAdded`
 *      silently collapsed to `unknown` and every added method vanished.
 *
 * Nothing inside core exercises `createEnhancer`'s `TAdded` inference at a call
 * site, so the builds stayed green while the PUBLIC authoring API was unusable.
 * That is the exact gap these assertions close: they are written from the
 * position of a third-party extension author, which no other test in the repo
 * occupies.
 *
 * A same-name signature change is also invisible to the API-surface inventory
 * (`tools/api-inventory.mjs` compares symbols, not their types), so the
 * inventory cannot catch a regression here either.
 *
 * THE BAR, and it is deliberately brutal: no annotations, no explicit generic
 * arguments, no casts. If a future change makes any assertion below require one,
 * the neutral contract has regressed even if everything still compiles.
 */
import { createEnhancer } from '../enhancers/index';
import { signalTree } from './signal-tree';

import type { EnhancerMeta } from './types';

const metaFoo: EnhancerMeta = { name: 'foo' };
const metaBar: EnhancerMeta = { name: 'bar' };
const metaBaz: EnhancerMeta = { name: 'baz' };

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHOR ERGONOMICS. Bare lambdas. This is the assertion that failed under
//    the generic-constraint encoding, and the whole reason it was rejected.
// ─────────────────────────────────────────────────────────────────────────────
const addFoo = createEnhancer(metaFoo, (tree) =>
  Object.assign(tree, { foo: () => 'foo' as const })
);
const addBar = createEnhancer(metaBar, (tree) =>
  Object.assign(tree, { bar: () => 'bar' as const })
);
const addBaz = createEnhancer(metaBaz, (tree) =>
  Object.assign(tree, { baz: () => 'baz' as const })
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ACCUMULATION. Every link survives to the end of the chain, and the LITERAL
//    types survive with them — `string` here would mean TAdded had widened.
// ─────────────────────────────────────────────────────────────────────────────
const chained = signalTree({ n: 0 }).with(addFoo).with(addBar).with(addBaz);

export const _foo: 'foo' = chained.foo();
export const _bar: 'bar' = chained.bar();
export const _baz: 'baz' = chained.baz();

// 3. The concrete state type is untouched by any of it.
export const _n: number = chained.$.n();

// 4. Order independence — accumulation must not depend on position.
const reordered = signalTree({ n: 0 }).with(addBaz).with(addFoo).with(addBar);
export const _r1: 'baz' = reordered.baz();
export const _r2: 'foo' = reordered.foo();
export const _r3: 'bar' = reordered.bar();

// ─────────────────────────────────────────────────────────────────────────────
// 5. NEGATIVE CONTROLS.
//
//    Without these the file proves nothing: if a regression widened the result
//    to `any`, every assertion above would still pass. `@ts-expect-error` is
//    itself an error when the line does NOT error, so these fail loudly if the
//    result type ever stops being precise.
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error - a method no enhancer added must not exist
chained.notAdded();

// @ts-expect-error - 'foo' is a literal, not an arbitrary string
export const _notWide: 'other' = chained.foo();

// @ts-expect-error - an enhancer's additions must NOT leak onto a bare tree
signalTree({ n: 0 }).foo();
