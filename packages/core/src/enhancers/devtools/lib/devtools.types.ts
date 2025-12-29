/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
// Type-level tests for devtools enhancer (assert intended public contract)
import type { withDevTools } from './devtools';
import type {
  Enhancer,
  DevToolsMethods,
  DevToolsConfig,
} from '../../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;
type Assert<T extends true> = T;

type WDT = typeof withDevTools;
type Expected = (config?: DevToolsConfig) => Enhancer<DevToolsMethods>;
type _devtools_signature = Assert<Equals<WDT, Expected>>;

export {};
