/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for memoization enhancer
import type {
  withMemoization,
  withHighPerformanceMemoization,
} from './memoization';
import type { MemoizationConfig } from '../../../lib/enhancers/memoization';
import type { SignalTreeBase } from '../../../lib/types';
import type { MemoizedSignalTree } from './memoization';

type Equals<A, B> = A extends B ? (B extends A ? true : false) : false;
type Assert<T extends true> = T;

type WMType = typeof withMemoization;
type ExpectedWM = <T>(
  config?: MemoizationConfig
) => (tree: SignalTreeBase<T>) => MemoizedSignalTree<T>;

// Ensure exported enhancer factory has expected shape
type _debug_actual = WMType;
type _debug_expected = ExpectedWM;
type _debug_match = Equals<WMType, ExpectedWM>;
type _memoization_signature = Assert<_debug_match>;

type WMPH = typeof withHighPerformanceMemoization;
// High-performance variant should also be an enhancer factory
type _highperf_signature = Assert<Equals<WMPH, ExpectedWM>>;

export {};
