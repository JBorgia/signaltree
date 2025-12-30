import { Assert, Equals } from '../test-helpers/types-equals';
import { withEffects } from './effects';

/**
 * Type-level tests for effects enhancer.
 */
import type { SignalTreeBase, EffectsMethods } from '../../lib/types';
// Expected signature (config is optional and has no required fields)
type ExpectedSignature = (config?: {
  enabled?: boolean;
}) => <Tree extends SignalTreeBase<any>>(
  tree: Tree
) => Tree & EffectsMethods<any>;

type ActualSignature = typeof withEffects;

// Contract check
type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// Usage verification
declare const tree: SignalTreeBase<{ count: number }>;
const enhanced = withEffects()(tree);

// Effect method should be available
const cleanup = enhanced.effect((state) => {
  const _count: number = state.count;
});

// Cleanup should be callable
cleanup();

export {};
