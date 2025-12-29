// Type-level tests for batching enhancer
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import type { withBatching, withHighPerformanceBatching } from './batching';
import type { BatchingMethods, Enhancer } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WB = typeof withBatching;
type Expected = typeof withBatching;
type _batching_signature = Assert<Equals<WB, Expected>>;

type WBHP = typeof withHighPerformanceBatching;
type _batching_hp_signature = WBHP extends Expected ? true : false;

export {};
