/* eslint-disable @typescript-eslint/no-unused-vars */
// Type-level tests for memoization enhancer
import type {
  withMemoization,
  withHighPerformanceMemoization,
} from './memoization';
import type { SignalTreeBase, MemoizationMethods } from '../../../lib/types';
import type { MemoizationConfig } from '../../../lib/enhancers/memoization';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type Assert<T extends true> = T;

type WMType = typeof withMemoization;
type ExpectedWM = (config?: MemoizationConfig) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & MemoizationMethods<S>;

// Ensure exported enhancer factory has expected shape
type _memoization_signature = Assert<Equals<WMType, ExpectedWM>>;

type WMPH = typeof withHighPerformanceMemoization;
// High-performance variant should also be an enhancer factory
type _highperf_signature = Assert<Equals<WMPH, ExpectedWM>>;

export {};
