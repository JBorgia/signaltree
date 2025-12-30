import { Assert, Equals } from '../test-helpers/types-equals';
import { effects } from './effects';

/**
 * Type-level tests for effects enhancer.
 */
import type { ISignalTree, EffectsMethods } from '../../lib/types';
// Expected signature (config is optional and has no required fields)
type ExpectedSignature = (config?: {
  enabled?: boolean;
}) => <Tree extends ISignalTree<any>>(tree: Tree) => Tree & EffectsMethods<any>;

type ActualSignature = typeof effects;

// Contract check
type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: ISignalTree<{ count: number }>;
const enhanced = effects()(tree);

// Effect method should be available
const cleanup = enhanced.effect((state) => {
  const _count: number = state.count;
});

// Cleanup should be callable
cleanup();

export {};
