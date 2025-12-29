/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import type { withDevTools, ModularDevToolsInterface } from './devtools';
import type { Enhancer, DevToolsConfig } from '../../../lib/types';

type Equals<A, B> = A extends B ? (B extends A ? true : false) : false;
type Assert<T extends true> = T;

type WDT = typeof withDevTools;
type Expected = <T>(config?: {
  enabled?: boolean;
  treeName?: string;
  enableBrowserDevTools?: boolean;
  enableLogging?: boolean;
  performanceThreshold?: number;
}) => (
  tree: import('../../../lib/types').SignalTreeBase<T>
) => import('../../../lib/types').SignalTreeBase<T> & {
  __devTools: ModularDevToolsInterface<T>;
};

type _debug_actual = WDT;
type _debug_expected = Expected;
type _debug_match = Equals<WDT, Expected>;

type _devtools_signature = Assert<_debug_match>;

export {};
