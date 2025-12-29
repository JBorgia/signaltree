// packages/core/src/enhancers/batching/lib/batching.types.ts

/* eslint-disable @typescript-eslint/no-unused-vars */
import type { withBatching, withHighPerformanceBatching } from './batching';
import type {
  SignalTreeBase,
  BatchingMethods,
  BatchingConfig,
} from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

// withBatching signature
type WB = typeof withBatching;
type ExpectedWB = (
  <T = any>(config?: BatchingConfig
) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & BatchingMethods;
type _batching_signature = Assert<Equals<WB, ExpectedWB>>;

// withHighPerformanceBatching signature
type WHPB = typeof withHighPerformanceBatching;
type ExpectedWHPB = () => <S>(
  <T = any>() => <S>(tree: SignalTreeBase<S>
) => SignalTreeBase<S> & BatchingMethods;
type _hp_batching_signature = Assert<Equals<WHPB, ExpectedWHPB>>;

export {};
