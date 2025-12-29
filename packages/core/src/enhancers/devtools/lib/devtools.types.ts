/* eslint-disable @typescript-eslint/no-unused-vars */
import type { withDevTools } from './devtools';
import type {
  SignalTreeBase,
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
type Expected = (
  config?: DevToolsConfig
) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & DevToolsMethods;
type _devtools_signature = Assert<Equals<WDT, Expected>>;

export {};
