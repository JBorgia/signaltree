/**
 * THE CONSUMER CONTRACT for `guardrails()` — characterization, pre-migration.
 *
 * Type-only. Typechecked by `tsconfig.lib.json` (`include: src/**\/*.ts`),
 * NOT by vitest — guardrails' vitest config does not exclude `*typing*.spec.ts`,
 * so the `.types.ts` precedent core already uses is the form that works here.
 * Verified with a deliberately-invalid control before writing this.
 *
 * WHY GUARDRAILS GOES FIRST in #4a. It is the one external enhancer that
 * falsified the literal-shape grep: searching for
 * `(tree: ISignalTree<T>) => ISignalTree<T> &` missed it entirely, because it
 * expresses the same dependency through a GENERIC CONSTRAINT:
 *
 *     guardrails(config): <Tree extends ISignalTree<any>>(tree: Tree)
 *                            => Tree & { __guardrails?: GuardrailsAPI }
 *
 * Only the compiler found it. So it is the best test of whether
 * `Enhancer<TAdded>` can honestly represent a nontrivial external authoring
 * style, rather than only the one core happened to use.
 *
 * THE QUESTION THIS FILE EXISTS TO ANSWER:
 *
 *   Does `Tree`-preservation in the enhancer's own signature give a consumer
 *   anything that `Enhancer<TAdded>` cannot, given `.with()` already returns
 *   `this & TAdded`?
 *
 * Rows below pin what a call site gets TODAY. No signature changes here.
 */
import { signalTree } from '@signaltree/core';

import { guardrails } from './guardrails';

import type { Enhancer } from '@signaltree/core';
import type { GuardrailsAPI } from './types';

// --- compile-time assertion helpers -----------------------------------------
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;

interface AppState {
  count: number;
  user: { name: string; age: number };
}

// The call site under test. No generics, no casts, no annotation.
const tree = signalTree<AppState>({ count: 0, user: { name: 'Ada', age: 36 } });
const guarded = tree.with(guardrails());

// ============================================================================
// 1 — the added surface, exactly as a consumer sees it
// ============================================================================
// NOTE `__guardrails` is OPTIONAL in the declared addition, so the consumer
// type is `GuardrailsAPI | undefined`. Pinned as CURRENT BEHAVIOUR — an
// optional addition is unusual among SignalTree enhancers and the migration
// must not silently make it required (or silently keep it optional if that
// turns out to be wrong; either change would be a separate decision).
export type _AddedSurface = Expect<
  Equal<(typeof guarded)['__guardrails'], GuardrailsAPI | undefined>
>;

// ============================================================================
// 2 — the state surface survives, and `Tree` preservation is not what does it
// ============================================================================
// `.with()` returns `this & TAdded`, so the caller's own tree type is preserved
// by the CALL SITE, independently of the enhancer declaring `Tree` in and
// `Tree &` out. These rows are what a migration must keep true.
export const _count: number = guarded.$.count();
export const _name: string = guarded.$.user.name();
export const _user: { name: string; age: number } = guarded.$.user();

// Rule 0d — a branch keeps all three call forms through the enhancer.
guarded.$.user({ age: 37 });
guarded.$.user((current) => ({ ...current, age: current.age + 1 }));

// Root call forms — READ and both WRITE forms, not just the read.
export const _snapshot: AppState = guarded();
guarded({ count: 1 });
guarded((current) => ({ ...current, count: current.count + 1 }));
// @ts-expect-error a root write must not accept a foreign key
guarded({ nope: 1 });

// ============================================================================
// 3 — accumulation in BOTH orders, against a SECOND enhancer
// ============================================================================
// The first draft of this section applied `guardrails()` alone and called that
// "both orders", which proved nothing about accumulation. Corrected before this
// file was used as migration evidence.
declare const labeller: Enhancer<{ label(): string }>;

const guardedThenLabelled = tree.with(guardrails()).with(labeller);
const labelledThenGuarded = tree.with(labeller).with(guardrails());

export const _acc1: number = guardedThenLabelled.$.count();
export const _acc2: string = guardedThenLabelled.label();
export const _acc3: number = labelledThenGuarded.$.count();
export const _acc4: string = labelledThenGuarded.label();

export type _AccKeepsAddition = [
  Expect<
    Equal<(typeof guardedThenLabelled)['__guardrails'], GuardrailsAPI | undefined>
  >,
  Expect<
    Equal<(typeof labelledThenGuarded)['__guardrails'], GuardrailsAPI | undefined>
  >
];

// ============================================================================
// 4 — config is optional and does not change the added surface
// ============================================================================
const _configured = tree.with(guardrails({ enabled: false }));
export type _ConfigDoesNotChangeSurface = Expect<
  Equal<(typeof _configured)['__guardrails'], (typeof guarded)['__guardrails']>
>;

// ============================================================================
// 5 — negative controls
// ============================================================================
// @ts-expect-error `__guardrails` requires guardrails()
export type _NoApiBefore = (typeof tree)['__guardrails'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof guarded, typeof tree>>;
