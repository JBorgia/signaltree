/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE CONSUMER CONTRACT for `devTools()`, pinned so the
 * `Enhancer<DevToolsMethods>` migration can be proven not to change it.
 * Written and proven GREEN BEFORE the signature change, re-run unchanged after.
 *
 * WHY THIS ONE IS A THIRD SHAPE. `batching` was one implementation;
 * `timeTravel` was one implementation with a receiver-derived method. `devTools`
 * is a CONDITIONAL DISPATCH over two different enhancers selected at module
 * load:
 *
 *     const devToolsImpl =
 *       typeof ngDevMode !== 'undefined' && !ngDevMode
 *         ? prodNoopDevTools        // MUTATES the tree (Object.assign)
 *         : createDevToolsEnhancer; // REPLACES tree identity
 *
 * So one public signature fronts two implementations with different identity
 * semantics, and both must satisfy it. The selection is deliberately
 * module-level so esbuild can constant-fold it and drop the ~12KB impl module
 * in production — a migration that moved the choice into a function body would
 * silently defeat that, which is a bundling property no type row can see.
 * Recorded here so the next reader does not "simplify" it.
 */
import { signalTree } from '../../lib/signal-tree';
import { devTools } from './devtools';

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
const devved = tree.with(devTools());

// ============================================================================
// 1 — the two methods are inferred, with exact signatures
// ============================================================================
export type _MethodTypes = [
  Expect<Equal<(typeof devved)['connectDevTools'], (name?: string) => void>>,
  Expect<Equal<(typeof devved)['disconnectDevTools'], () => void>>
];
devved.connectDevTools();
devved.connectDevTools('MyTree');
devved.disconnectDevTools();

// ============================================================================
// 2 — the state surface is untouched by enhancement
// ============================================================================
export type _StateSurvives = [
  Expect<Equal<(typeof devved)['$']['count'], CallableWritableSignal<number>>>,
  Expect<
    Equal<(typeof devved)['$']['user']['name'], CallableWritableSignal<string>>
  >
];
export const _count: number = devved.$.count();
export const _user: { name: string; age: number } = devved.$.user();
devved.$.user({ age: 37 });
export const _snapshot: AppState = devved();
devved({ count: 1 });

// ============================================================================
// 3 — accumulation in BOTH orders
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const devvedThenLabelled = tree.with(devTools()).with(labeller);
const labelledThenDevved = tree.with(labeller).with(devTools());

export const _c1: string = devvedThenLabelled.label();
devvedThenLabelled.connectDevTools();
export const _c2: string = labelledThenDevved.label();
labelledThenDevved.connectDevTools();
export const _c3: number = devvedThenLabelled.$.count();

// ============================================================================
// 4 — config is optional and does not change the added surface
// ============================================================================
const configured = tree.with(
  devTools({ name: 'X', enableLogging: false, performanceThreshold: 10 })
);
export type _ConfigDoesNotChangeSurface = Expect<
  Equal<(typeof configured)['connectDevTools'], (typeof devved)['connectDevTools']>
>;
// @ts-expect-error config is checked, not `any`
tree.with(devTools({ nope: true }));

// ============================================================================
// 5 — negative controls
// ============================================================================
// @ts-expect-error `connectDevTools` requires devTools()
export type _NoConnectBefore = (typeof tree)['connectDevTools'];
// @ts-expect-error `disconnectDevTools` requires devTools()
export type _NoDisconnectBefore = (typeof tree)['disconnectDevTools'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof devved, typeof tree>>;
