// Type-level tests for time-travel enhancer
import type { withTimeTravel } from './time-travel';
import type { TimeTravelMethods } from './time-travel';
import type { Enhancer } from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WTT = typeof withTimeTravel;
type Expected = <T = any>() => Enhancer<TimeTravelMethods<T>>;
type _time_travel_signature = Assert<Equals<WTT, Expected>>;

export {};
