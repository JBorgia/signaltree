import { ISignalTree, MemoizationConfig, MemoizationMethods } from '../../lib/types';
import { Assert, Equals } from '../test-helpers/types-equals';
import { memoization } from './memoization';

type ExpectedSignature = (
  config?: MemoizationConfig
) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & MemoizationMethods<T>;

type ActualSignature = typeof memoization;

type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// .with() preserves accumulated types via `this & TAdded` pattern.

export {};
