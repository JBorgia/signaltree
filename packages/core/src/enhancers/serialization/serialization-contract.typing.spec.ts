/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE CONSUMER CONTRACT for `serialization()`, pinned so the
 * `Enhancer<SerializationMethods>` migration can be proven not to change it.
 * Written and proven GREEN BEFORE the signature change, re-run unchanged after.
 *
 * FOURTH SHAPE, characterized rather than assumed:
 *
 *   - `serialization` MUTATES (`const enhanced = tree as …`); it does not
 *     replace tree identity, unlike the three enhancers migrated before it.
 *   - `SerializationMethods` has no `this`, no conditional types and no state
 *     generic — every payload is `SerializedState<unknown>`. So there is no
 *     receiver-derived precision to lose here, which is what made `timeTravel`
 *     risky. Recorded as a MEASURED fact, not an assumption carried over.
 *   - It is CONSUMED INTERNALLY by `persistence()`, which applies
 *     `serialization(config)(tree)` inside its own body. That coupling is why
 *     migrating this one touches `persistence`'s implementation while leaving
 *     `persistence`'s own public signature alone for its own slice.
 *
 * NOTE, not a change: `snapshot()` returns `SerializedState<unknown>`, so the
 * state type is already erased in the 14.x contract. This migration neither
 * improves nor worsens that; reopening it would be a different decision.
 */
import { signalTree } from '../../lib/signal-tree';
import { serialization } from './serialization';

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

// The call site under test. No generics, no casts, no annotation.
const tree = signalTree<AppState>({ count: 0, user: { name: 'Ada', age: 36 } });
const serial = tree.with(serialization());

// ============================================================================
// 1 — the six methods are inferred, with exact signatures
// ============================================================================
export const _json: string = serial.serialize();
serial.deserialize('{}');
export const _plain: unknown = serial.toJSON();
serial.fromJSON({});
export const _snap: SerializedState<unknown> = serial.snapshot();
serial.restore(_snap);

export type _MethodTypes = [
  Expect<Equal<(typeof serial)['toJSON'], () => unknown>>,
  Expect<Equal<(typeof serial)['snapshot'], () => SerializedState<unknown>>>,
  Expect<
    Equal<(typeof serial)['restore'], (snapshot: SerializedState<unknown>) => void>
  >
];

// ============================================================================
// 2 — the state surface is untouched by enhancement
// ============================================================================
export type _StateSurvives = [
  Expect<Equal<(typeof serial)['$']['count'], CallableWritableSignal<number>>>,
  Expect<
    Equal<(typeof serial)['$']['user']['name'], CallableWritableSignal<string>>
  >
];
export const _count: number = serial.$.count();
export const _user: { name: string; age: number } = serial.$.user();
serial.$.user({ age: 37 });
export const _snapshotState: AppState = serial();
serial({ count: 1 });

// ============================================================================
// 3 — accumulation in BOTH orders
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const serialThenLabelled = tree.with(serialization()).with(labeller);
const labelledThenSerial = tree.with(labeller).with(serialization());

export const _d1: string = serialThenLabelled.label();
export const _d2: string = serialThenLabelled.serialize();
export const _d3: string = labelledThenSerial.label();
export const _d4: string = labelledThenSerial.serialize();
export const _d5: number = serialThenLabelled.$.count();

// ============================================================================
// 4 — config is optional and does not change the added surface
// ============================================================================
const configured = tree.with(
  serialization({ includeMetadata: false, maxDepth: 10 })
);
export type _ConfigDoesNotChangeSurface = Expect<
  Equal<(typeof configured)['serialize'], (typeof serial)['serialize']>
>;
// @ts-expect-error config is checked, not `any`
tree.with(serialization({ nope: true }));

// ============================================================================
// 5 — negative controls
// ============================================================================
// @ts-expect-error `serialize` requires serialization()
export type _NoSerializeBefore = (typeof tree)['serialize'];
// @ts-expect-error `snapshot` requires serialization()
export type _NoSnapshotBefore = (typeof tree)['snapshot'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof serial, typeof tree>>;
