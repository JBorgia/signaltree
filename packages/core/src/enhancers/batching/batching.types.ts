import { Assert, Equals } from '../test-helpers/types-equals';
import { withBatching } from './batching';

import type {
  ISignalTree,
  BatchingMethods,
  BatchingConfig,
} from '../../lib/types';

// The expected signature
type ExpectedSignature = (
  config?: BatchingConfig
) => <Tree extends ISignalTree<any>>(tree: Tree) => Tree & BatchingMethods<any>;

// The actual signature
type ActualSignature = typeof withBatching;

// This line will fail to compile if signatures don't match
type _ContractCheck = Assert<Equals<ActualSignature, ExpectedSignature>>;

// ============================================================================
// Usage Verification
// ============================================================================

// Verify the enhancer works with different state types
declare const tree1: ISignalTree<{ count: number }>;
declare const tree2: ISignalTree<{ users: string[]; active: boolean }>;

// These should all compile
const enhanced1 = withBatching()(tree1);
const enhanced2 = withBatching({ debounceMs: 16 })(tree2);

// Verify methods are available
enhanced1.batch(() => void 0);
enhanced2.batch(() => void 0);

// Verify state type is preserved
const _count: number = enhanced1().count;
const _users: string[] = enhanced2().users;

// Export to make this a module
export {};
