import { Assert, Equals } from '../test-helpers/types-equals';
import { effects } from './effects';

/**
 * Type-level tests for effects enhancer.
 */
import type { ISignalTree, EffectsMethods } from '../../lib/types';
// Expected signature (config is optional and has no required fields)
type ExpectedSignature = (config?: {
  enabled?: boolean;
}) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & EffectsMethods<T>;

type ActualSignature = typeof effects;

// Contract check
type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// .with() preserves accumulated types via `this & TAdded` pattern.

export {};
