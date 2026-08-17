/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE CONSUMER CONTRACT for `persistence()`, pinned so the
 * `Enhancer<SerializationMethods & PersistenceMethods>` migration can be proven
 * not to change it. Proven GREEN BEFORE the signature change, re-run unchanged
 * after.
 *
 * FIFTH SHAPE — a COMPOSITE `TAdded`. Every enhancer migrated so far added one
 * interface; `persistence` adds two:
 *
 *     ISignalTree<T> & SerializationMethods & PersistenceMethods
 *
 * so the rows below check BOTH halves independently. A migration that carried
 * only `PersistenceMethods` would still pass any test that merely called
 * `save()`.
 *
 * It is also the enhancer that motivated the capability-authority decision:
 * its metadata is `{ name: 'persistence', provides: ['persistence',
 * 'serialization'], requires: [] }` — it advertises a capability it does not
 * own as a NAME, which under the pre-`681ffb8e` name-based guard was
 * unsatisfiable. The runtime half of that is covered by
 * `enhancer-metadata-authority.spec.ts`.
 *
 * `persistence` requires config (no default), unlike every enhancer before it.
 */
import { signalTree } from '../../lib/signal-tree';
import { persistence } from './serialization';

import type { CallableWritableSignal, Enhancer } from '../../index';
import type { SerializedState } from './serialization';

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
const persisted = tree.with(persistence({ key: 'app-state' }));

// ============================================================================
// 1 — the PersistenceMethods half
// ============================================================================
export type _PersistenceHalf = [
  Expect<Equal<(typeof persisted)['save'], () => Promise<void>>>,
  Expect<Equal<(typeof persisted)['load'], () => Promise<void>>>,
  Expect<Equal<(typeof persisted)['clear'], () => Promise<void>>>
];
export const _save: Promise<void> = persisted.save();
export const _load: Promise<void> = persisted.load();
export const _clear: Promise<void> = persisted.clear();

// ============================================================================
// 2 — the SerializationMethods half, which the composite must ALSO carry
// ============================================================================
// The row that catches a migration dropping half the intersection.
export const _json: string = persisted.serialize();
persisted.deserialize('{}');
export const _plain: unknown = persisted.toJSON();
export const _snap: SerializedState<unknown> = persisted.snapshot();
persisted.restore(_snap);
export type _SerializationHalf = [
  Expect<Equal<(typeof persisted)['toJSON'], () => unknown>>,
  Expect<Equal<(typeof persisted)['snapshot'], () => SerializedState<unknown>>>
];

// ============================================================================
// 3 — the state surface is untouched by enhancement
// ============================================================================
export type _StateSurvives = [
  Expect<Equal<(typeof persisted)['$']['count'], CallableWritableSignal<number>>>,
  Expect<
    Equal<(typeof persisted)['$']['user']['name'], CallableWritableSignal<string>>
  >
];
export const _count: number = persisted.$.count();
export const _user: { name: string; age: number } = persisted.$.user();
persisted.$.user({ age: 37 });
export const _snapshotState: AppState = persisted();
persisted({ count: 1 });

// ============================================================================
// 4 — accumulation in BOTH orders, with BOTH halves surviving
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const persistedThenLabelled = tree
  .with(persistence({ key: 'a' }))
  .with(labeller);
const labelledThenPersisted = tree
  .with(labeller)
  .with(persistence({ key: 'b' }));

export const _e1: string = persistedThenLabelled.label();
export const _e2: Promise<void> = persistedThenLabelled.save();
export const _e3: string = persistedThenLabelled.serialize();
export const _e4: string = labelledThenPersisted.label();
export const _e5: Promise<void> = labelledThenPersisted.save();
export const _e6: string = labelledThenPersisted.serialize();

// ============================================================================
// 5 — config is REQUIRED here, unlike every other built-in
// ============================================================================
// @ts-expect-error `persistence()` requires a config with a `key`
tree.with(persistence());
// @ts-expect-error config is checked, not `any`
tree.with(persistence({ nope: true }));

// ============================================================================
// 6 — negative controls
// ============================================================================
// @ts-expect-error `save` requires persistence()
export type _NoSaveBefore = (typeof tree)['save'];
// @ts-expect-error `serialize` requires an enhancer
export type _NoSerializeBefore = (typeof tree)['serialize'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof persisted, typeof tree>>;
