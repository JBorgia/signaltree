/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE CONSUMER CONTRACT for `batching()`, pinned so the `Enhancer<Methods>`
 * migration can be proven not to change it.
 *
 * Written and run GREEN BEFORE the signature change, then re-run unchanged
 * after. That ordering is the point: a proof written after the fact only shows
 * the new signature is self-consistent, not that it preserved anything.
 *
 * Deliberately asserts only what a CONSUMER can observe — inference at the call
 * site, exact method types, state typing, accumulation. There is no row here
 * pinning `batching`'s own declared signature shape, because that is the
 * implementation vocabulary the migration exists to change. (`batching.types.ts`
 * does assert that shape and is expected to need a deliberate update.)
 *
 * The load-bearing property is NO CASTS AND NO EXPLICIT GENERICS at the call
 * site. If a consumer has to write `.with<BatchingMethods>(...)` or cast the
 * result, the migration has failed even when every type below still resolves.
 */
import { signalTree } from '../../lib/signal-tree';
import { batching } from './batching';

import type { CallableWritableSignal, Enhancer } from '../../index';

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
const batched = tree.with(batching());

// ============================================================================
// 1 — the four methods are inferred, with exact signatures
// ============================================================================
export type _MethodTypes = [
  Expect<Equal<(typeof batched)['batch'], (fn: () => void) => void>>,
  Expect<Equal<(typeof batched)['coalesce'], (fn: () => void) => void>>,
  Expect<Equal<(typeof batched)['hasPendingNotifications'], () => boolean>>,
  Expect<Equal<(typeof batched)['flushNotifications'], () => void>>
];

// They are callable with no ceremony.
batched.batch(() => undefined);
batched.coalesce(() => undefined);
export const _pending: boolean = batched.hasPendingNotifications();
batched.flushNotifications();

// ============================================================================
// 2 — the state surface is untouched by enhancement
// ============================================================================
export type _StateSurvives = [
  Expect<Equal<(typeof batched)['$']['count'], CallableWritableSignal<number>>>,
  Expect<
    Equal<(typeof batched)['$']['user']['name'], CallableWritableSignal<string>>
  >
];
export const _count: number = batched.$.count();
export const _name: string = batched.$.user.name();
// Rule 0d still holds through the enhancer: a branch keeps its three call forms.
export const _user: { name: string; age: number } = batched.$.user();
batched.$.user({ age: 37 });

// Root callable forms survive.
export const _snapshot: AppState = batched();
batched({ count: 1 });
batched((current) => ({ ...current, count: current.count + 1 }));

// ============================================================================
// 3 — accumulation, in BOTH orders
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const batchedThenLabelled = tree.with(batching()).with(labeller);
const labelledThenBatched = tree.with(labeller).with(batching());

export const _a1: void = batchedThenLabelled.batch(() => undefined);
export const _a2: string = batchedThenLabelled.label();
export const _a3: void = labelledThenBatched.batch(() => undefined);
export const _a4: string = labelledThenBatched.label();
// ...and the state surface survives the whole chain.
export const _a5: number = batchedThenLabelled.$.count();
export const _a6: string = labelledThenBatched.$.user.name();

// ============================================================================
// 4 — config is optional and does not change the added surface
// ============================================================================
const configured = tree.with(batching({ enabled: false, notificationDelayMs: 5 }));
export type _ConfigDoesNotChangeSurface = Expect<
  Equal<(typeof configured)['batch'], (typeof batched)['batch']>
>;
// @ts-expect-error config is checked, not `any`
tree.with(batching({ nope: true }));

// ============================================================================
// 5 — negative controls
// ============================================================================
// The methods do NOT exist before the enhancer is applied. Without this, every
// row above could pass because the base tree already had them.
// @ts-expect-error `batch` requires batching()
export type _NoBatchBefore = (typeof tree)['batch'];
// @ts-expect-error `coalesce` requires batching()
export type _NoCoalesceBefore = (typeof tree)['coalesce'];

// A batched tree is not interchangeable with a plain one at the type level.
export type _EnhancedDiffers = ExpectFalse<Equal<typeof batched, typeof tree>>;
