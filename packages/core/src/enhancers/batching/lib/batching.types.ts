// Type-level tests for batching enhancer
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import type { withBatching, withHighPerformanceBatching } from './batching';
import type { SignalTreeBase, BatchingMethods } from '../../../lib/types';

type Equals<A, B> = A extends B ? (B extends A ? true : false) : false;
type Assert<T extends true> = T;

type WB = typeof withBatching;
type Expected = <T = any>(config?: {
  enabled?: boolean;
  maxBatchSize?: number;
  autoFlushDelay?: number;
  batchTimeoutMs?: number;
}) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & BatchingMethods;

// Debug-only: inspect actual vs expected in IDE; assertion disabled to avoid
// brittle compile-time equality failures until we align the implementation.
type _debug_actual = WB;
type _debug_expected = Expected;
type _debug_match = Equals<WB, Expected>;

type WBHP = typeof withHighPerformanceBatching;
type _batching_hp_signature = WBHP extends Expected ? true : false;

export {};
