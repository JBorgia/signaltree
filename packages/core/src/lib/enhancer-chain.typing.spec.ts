/**
 * TYPE-TEST — compile-time only (`*typing*.spec.ts` is excluded from vitest).
 *
 * `.with()` returns `this & TAdded`, so every enhancer's surface ACCUMULATES
 * across a chain.
 *
 * It used to return `SignalTreeBuilder<TSource, TAccum> & TAdded`, discarding
 * everything added before it — so a three-enhancer chain typed as
 * `SignalTreeBuilder<…> & BatchingMethods` and lost `canUndo` and `serialize`.
 * Runtime was always fine; only the type forgot, so the workaround was a cast,
 * and the demo's time-travel page carried exactly that cast for exactly this
 * reason.
 *
 * `all-chains.spec.ts` did not catch it because it asserts on hand-written type
 * expressions (`BatchingMethods & TimeTravelMethods & …`) rather than on what
 * `.with().with()` actually RETURNS. The intersection was always associative;
 * the builder was what dropped it.
 */
import { batching } from '../enhancers/batching/batching';
import { serialization } from '../enhancers/serialization/serialization';
import { signalTree } from './signal-tree';
import { timeTravel } from '../enhancers/time-travel/time-travel';

const chained = signalTree({ n: 0 })
  .with(timeTravel())
  .with(serialization())
  .with(batching());

// FIRST link survives to the end of the chain.
export const _canUndo: boolean = chained.canUndo();
export const _undo: void = chained.undo() as unknown as void;
// MIDDLE link survives.
export const _serialize: string = chained.serialize();
// LAST link, which was the only one that used to survive.
export const _batch: void = chained.batch(() => undefined);

// Order must not matter.
const reordered = signalTree({ n: 0 })
  .with(batching())
  .with(timeTravel())
  .with(serialization());
export const _r1: void = reordered.batch(() => undefined);
export const _r2: boolean = reordered.canUndo();
export const _r3: string = reordered.serialize();

// A single enhancer still works, and the base surface is intact.
const single = signalTree({ n: 0 }).with(batching());
export const _s1: void = single.batch(() => undefined);
export const _s2: number = single.$.n();
