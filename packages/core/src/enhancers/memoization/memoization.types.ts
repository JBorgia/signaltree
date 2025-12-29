/**
 * Type-level tests for memoization enhancer.
 */

import type { withMemoization } from './memoization';
import type { withMemoization } from './memoization';
import type {
  SignalTreeBase,
  MemoizationMethods,
  MemoizationConfig,
} from '../../lib/types';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B
  ? 1
  : 2
  ? true
  : false;

type Assert<T extends true> = T;

type ExpectedSignature = (
  config?: MemoizationConfig
) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & MemoizationMethods<S>;

type ActualSignature = typeof withMemoization;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
interface TestState {
  users: { id: string; name: string }[];
  filter: string;
}

declare const tree: SignalTreeBase<TestState>;
const enhanced = withMemoization({ maxCacheSize: 100 })(tree);

// Memoize should work with selectors
const filtered = enhanced.memoize((state) =>
  state.users.filter((u) => u.name.includes(state.filter))
);

// Other methods
enhanced.clearMemoCache();
enhanced.clearCache('key');
const stats = enhanced.getCacheStats();
const _size: number = stats.size;

export {};
