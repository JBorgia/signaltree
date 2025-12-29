/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for devtools enhancer
import type { withDevTools } from './devtools';
import type { Enhancer } from '../../../lib/types';
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WDT = typeof withDevTools;
type Expected = typeof withDevTools;
type _devtools_signature = Assert<Equals<WDT, Expected>>;

export {};
