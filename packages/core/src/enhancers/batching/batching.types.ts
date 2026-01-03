import { batching } from './batching';

import type { ISignalTree, BatchingMethods } from '../../lib/types';

// Test: batching returns correct enhancer type
type BatchingEnhancer = ReturnType<typeof batching>;

// Test: enhancer signature is correct (simple pattern)
type _TestSignature = BatchingEnhancer extends <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & BatchingMethods<T>
  ? true
  : false;
const _signatureTest: _TestSignature = true;

// Runtime usage through .with() works correctly.
// .with() preserves accumulated types via `this & TAdded` pattern.

export {};
