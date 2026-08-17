/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * THE CONSUMER CONTRACT for `timeTravel()`, pinned so the
 * `Enhancer<TimeTravelMethods>` migration can be proven not to change it.
 * Written and proven GREEN BEFORE the signature change, re-run unchanged after.
 *
 * WHY THIS ONE IS NOT BATCHING-SHAPED. Two properties make a superficially
 * green conversion dangerous here, and both get their own rows:
 *
 *   1. `getHistory()` is RECEIVER-DERIVED:
 *
 *        getHistory(): TimeTravelEntry<
 *          this extends NodeAccessor<infer S> ? S : never
 *        >[]
 *
 *      The state is recovered from polymorphic `this`, not from a generic on
 *      the enhancer. `EnhancerHost` is NOT a `NodeAccessor`, so if `TAdded` ever
 *      resolved against the host rather than the caller's tree, `S` would
 *      silently collapse to `never` — method present, state gone. A row
 *      asserting only that `getHistory` EXISTS would not notice.
 *
 *   2. `TimeTravelMethods extends TransactionMethods`, so this enhancer adds a
 *      SECOND surface. Both must survive.
 *
 * `b266457d` removed `TimeTravelMethods<T>`'s state generic precisely because
 * it "forced enhancer signatures to name `ISignalTree<T>`" — this migration is
 * what that change was for. These rows are the check that it delivered.
 *
 * SCOPE: this slice asks whether the EXISTING capability can be expressed
 * through `Enhancer<TimeTravelMethods>`. It does not reopen time-travel's public
 * contract — nothing here asserts a change to `TimeTravelMethods`' shape.
 */
import { signalTree } from '../../lib/signal-tree';
import { timeTravel } from './time-travel';

import type {
  CallableWritableSignal,
  Enhancer,
  PendingTransaction,
  TimeTravelEntry,
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

// The call site under test. No generics, no casts, no annotation.
const tree = signalTree<AppState>({ count: 0, user: { name: 'Ada', age: 36 } });
const travelled = tree.with(timeTravel());

// ============================================================================
// 1 — THE LOAD-BEARING ROW: history keeps the CONCRETE state type
// ============================================================================
// If the receiver stops being seen as a `NodeAccessor<AppState>`, `S` becomes
// `never` and this row fails. That is the whole risk of this migration.
const entries = travelled.getHistory();
export type _HistoryStateIsConcrete = [
  Expect<Equal<typeof entries, TimeTravelEntry<AppState>[]>>,
  Expect<Equal<(typeof entries)[number]['state'], AppState>>
];
export const _stateCount: number = entries[0].state.count;
export const _stateName: string = entries[0].state.user.name;

// Negative control — proves the row above is not vacuously true because
// `TimeTravelEntry<never>` happens to satisfy it.
export type _HistoryIsNotNever = ExpectFalse<
  Equal<(typeof entries)[number]['state'], never>
>;

// ============================================================================
// 2 — the time-travel surface, exact signatures
// ============================================================================
export type _MethodTypes = [
  Expect<Equal<(typeof travelled)['undo'], () => void>>,
  Expect<Equal<(typeof travelled)['redo'], () => void>>,
  Expect<Equal<(typeof travelled)['canUndo'], () => boolean>>,
  Expect<Equal<(typeof travelled)['canRedo'], () => boolean>>,
  Expect<Equal<(typeof travelled)['resetHistory'], () => void>>,
  Expect<Equal<(typeof travelled)['jumpTo'], (index: number) => void>>,
  Expect<Equal<(typeof travelled)['getCurrentIndex'], () => number>>
];
travelled.undo();
travelled.redo();
export const _canUndo: boolean = travelled.canUndo();
export const _canRedo: boolean = travelled.canRedo();
export const _idx: number = travelled.getCurrentIndex();
travelled.jumpTo(0);
travelled.resetHistory();

// ============================================================================
// 3 — the INHERITED transaction surface survives too
// ============================================================================
// `TimeTravelMethods extends TransactionMethods`, so this enhancer adds two
// surfaces. A migration that kept only the time-travel half would pass §2.
export type _TransactionSurvives = Expect<
  Equal<(typeof travelled)['transaction'], (fn: () => void) => PendingTransaction>
>;
export const _pending: PendingTransaction = travelled.transaction(() => undefined);

// ============================================================================
// 4 — the state surface is untouched by enhancement
// ============================================================================
export type _StateSurvives = [
  Expect<Equal<(typeof travelled)['$']['count'], CallableWritableSignal<number>>>,
  Expect<
    Equal<(typeof travelled)['$']['user']['name'], CallableWritableSignal<string>>
  >
];
export const _count: number = travelled.$.count();
export const _user: { name: string; age: number } = travelled.$.user();
travelled.$.user({ age: 37 });
export const _snapshot: AppState = travelled();
travelled({ count: 1 });

// ============================================================================
// 5 — accumulation in BOTH orders, with history state still concrete
// ============================================================================
declare const labeller: Enhancer<{ label(): string }>;

const travelledThenLabelled = tree.with(timeTravel()).with(labeller);
const labelledThenTravelled = tree.with(labeller).with(timeTravel());

export const _b1: string = travelledThenLabelled.label();
export const _b2: boolean = travelledThenLabelled.canUndo();
export const _b3: string = labelledThenTravelled.label();
export const _b4: boolean = labelledThenTravelled.canUndo();

// The receiver-derived state must survive the NEXT enhancer too — this is the
// row that would catch `S` collapsing only once another enhancer is chained.
export type _HistoryStateSurvivesChaining = [
  Expect<
    Equal<ReturnType<(typeof travelledThenLabelled)['getHistory']>, TimeTravelEntry<AppState>[]>
  >,
  Expect<
    Equal<ReturnType<(typeof labelledThenTravelled)['getHistory']>, TimeTravelEntry<AppState>[]>
  >
];

// ============================================================================
// 6 — config is optional and does not change the added surface
// ============================================================================
const disabled = tree.with(timeTravel({ enabled: false }));
export type _ConfigDoesNotChangeSurface = [
  Expect<Equal<(typeof disabled)['undo'], (typeof travelled)['undo']>>,
  Expect<
    Equal<ReturnType<(typeof disabled)['getHistory']>, TimeTravelEntry<AppState>[]>
  >
];
// @ts-expect-error config is checked, not `any`
tree.with(timeTravel({ nope: true }));

// ============================================================================
// 7 — negative controls
// ============================================================================
// @ts-expect-error `undo` requires timeTravel()
export type _NoUndoBefore = (typeof tree)['undo'];
// @ts-expect-error `getHistory` requires timeTravel()
export type _NoHistoryBefore = (typeof tree)['getHistory'];
export type _EnhancedDiffers = ExpectFalse<Equal<typeof travelled, typeof tree>>;
