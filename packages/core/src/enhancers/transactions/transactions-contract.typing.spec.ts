/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE CONSUMER CONTRACT for `transactions()`, pinned so the
 * `Enhancer<TransactionMethods>` migration can be proven not to change it.
 * Proven GREEN BEFORE the signature change, re-run unchanged after.
 *
 * SIXTH SHAPE, characterized rather than assumed:
 *
 *   - it MUTATES and returns the SAME tree (`return tree as …`), assigning
 *     `transaction` onto it directly;
 *   - it stores per-tree state on a SIDE CHANNEL — a module-level
 *     `Symbol(INTERNAL_TRANSACTION_RUNTIME)` keyed off the tree —
 *     which is the reason a generic `tree + additions` combiner cannot express
 *     this enhancer, and is untouched by a signature change;
 *   - its metadata declares `capabilities: ['causal-runtime']`, so like
 *     `timeTravel` it participates in `buildTreePlan` substrate provisioning;
 *   - `TransactionMethods` is a single method with no `this`, no conditional
 *     types and no state generic, so there is no receiver-derived precision at
 *     risk.
 *
 * `TransactionMethods` is also INHERITED by `TimeTravelMethods`, so this
 * contract is reachable two ways. The rows here cover the direct application;
 * `time-travel-contract.typing.spec.ts` covers the inherited path.
 */
import { signalTree } from '../../lib/signal-tree';
import { transactions } from './transactions';

import type {
  CallableWritableSignal,
  Enhancer,
  PendingTransaction,
} from '../../index';

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

const tree = signalTree<AppState>({ count: 0, user: { name: 'Ada', age: 36 } });
const txn = tree.with(transactions());

// ============================================================================
// 1 — the method is inferred, with its exact signature
// ============================================================================
export type _MethodType = Expect<
  Equal<(typeof txn)['transaction'], (fn: () => void) => PendingTransaction>
>;
export const _pending: PendingTransaction = txn.transaction(() => undefined);

// ============================================================================
// 2 — the state surface is untouched by enhancement
// ============================================================================
export type _StateSurvives = [
  Expect<Equal<(typeof txn)['$']['count'], CallableWritableSignal<number>>>,
  Expect<Equal<(typeof txn)['$']['user']['name'], CallableWritableSignal<string>>>
];
export const _count: number = txn.$.count();
export const _user: { name: string; age: number } = txn.$.user();
txn.$.user({ age: 37 });
export const _snapshot: AppState = txn();
txn({ count: 1 });

// ============================================================================
// 3 — accumulation in BOTH orders
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const txnThenLabelled = tree.with(transactions()).with(labeller);
const labelledThenTxn = tree.with(labeller).with(transactions());

export const _f1: string = txnThenLabelled.label();
export const _f2: PendingTransaction = txnThenLabelled.transaction(() => undefined);
export const _f3: string = labelledThenTxn.label();
export const _f4: PendingTransaction = labelledThenTxn.transaction(() => undefined);
export const _f5: number = txnThenLabelled.$.count();

// ============================================================================
// 4 — takes no config
// ============================================================================
// @ts-expect-error `transactions()` takes no arguments
tree.with(transactions({ nope: true }));

// ============================================================================
// 5 — negative controls
// ============================================================================
// @ts-expect-error `transaction` requires transactions()
export type _NoTransactionBefore = (typeof tree)['transaction'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof txn, typeof tree>>;
