import { ISignalTree, MemoizationConfig, MemoizationMethods } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { withMemoization } from './memoization';

type ExpectedSignature = (
  config?: MemoizationConfig
) => <Tree extends ISignalTree<any>>(
  tree: Tree
) => Tree & MemoizationMethods<any>;

type ActualSignature = typeof withMemoization;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
interface TestState {
  users: { id: string; name: string }[];
  filter: string;
}

declare const tree: ISignalTree<TestState>;
const enhanced = withMemoization({ maxCacheSize: 100 })(tree);

// Memoize should work with selectors
const filtered = enhanced.memoize((state: TestState) =>
  state.users.filter((u) => u.name.includes(state.filter))
);

// Other methods
enhanced.clearMemoCache();
enhanced.clearMemoCache('key');
const stats = enhanced.getCacheStats();
const _size: number = stats.size;

export {};
