/**
 * Type-level tests for time-travel enhancer.
 */

import type { withTimeTravel } from './time-travel';
import type {
  SignalTreeBase,
  TimeTravelMethods,
  TimeTravelConfig,
} from '../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Assert<T extends true> = T;

type ExpectedSignature = (
  config?: TimeTravelConfig
) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & TimeTravelMethods;

type ActualSignature = typeof withTimeTravel;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: SignalTreeBase<{ count: number }>;
const enhanced = withTimeTravel({ maxHistorySize: 50 })(tree);

// All time travel methods should be available
enhanced.undo();
enhanced.redo();
const _canUndo: boolean = enhanced.canUndo();
const _canRedo: boolean = enhanced.canRedo();
const _history: unknown[] = enhanced.getHistory();
enhanced.resetHistory();
enhanced.jumpTo(0);
const _index: number = enhanced.getCurrentIndex();

// State should still be accessible
const _count: number = enhanced().count;

export {};
