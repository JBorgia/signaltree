/**
 * Type-level tests for devtools enhancer.
 */

import type { withDevTools } from './devtools';
import type {
  SignalTreeBase,
  DevToolsMethods,
  DevToolsConfig,
} from '../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Assert<T extends true> = T;

type ExpectedSignature = (
  config?: DevToolsConfig
) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & DevToolsMethods;

type ActualSignature = typeof withDevTools;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: SignalTreeBase<{ count: number }>;
const enhanced = withDevTools({ name: 'Test' })(tree);

enhanced.connectDevTools();
enhanced.disconnectDevTools();

// State should still be accessible
const _count: number = enhanced().count;

export {};
