// Type-level tests for memoization enhancer
import type {
  withMemoization,
  withHighPerformanceMemoization,
} from './memoization';
import type { MemoizationConfig, MemoizationMethods } from './memoization';
import type { Enhancer } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WMType = typeof withMemoization;
type ExpectedWM = <T = any>(
  config?: MemoizationConfig
) => Enhancer<MemoizationMethods<T>>;

// Ensure exported enhancer factory has expected shape
type _memoization_signature = Assert<Equals<WMType, ExpectedWM>>;

type WMPH = typeof withHighPerformanceMemoization;
// High-performance variant should also be an enhancer factory
type _highperf_signature = Assert<Equals<WMPH, ExpectedWM>>;

export {};
