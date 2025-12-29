/* eslint-disable @typescript-eslint/no-unused-vars */
// Type-level tests for time-travel enhancer
import type { withTimeTravel } from './time-travel';
import type { SignalTreeBase, TimeTravelMethods } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type Assert<T extends true> = T;

type WTT = typeof withTimeTravel;
type Expected = (config?: unknown) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & TimeTravelMethods;
type _time_travel_signature = Assert<Equals<WTT, Expected>>;

export {};
