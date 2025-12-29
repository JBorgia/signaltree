/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for time-travel enhancer
import type {
  withTimeTravel,
  TimeTravelInterface,
  TimeTravelConfig,
} from './time-travel';
import type { SignalTreeBase } from '../../../lib/types';

type Equals<A, B> = A extends B ? (B extends A ? true : false) : false;
type Assert<T extends true> = T;

type WTT = typeof withTimeTravel;
type Expected = <T>(config?: TimeTravelConfig) => (
  tree: SignalTreeBase<T>
) => SignalTreeBase<T> & {
  __timeTravel: TimeTravelInterface<T>;
};

type _debug_actual = WTT;
type _debug_expected = Expected;
type _debug_match = Equals<WTT, Expected>;

type _time_travel_signature = Assert<_debug_match>;

export {};
