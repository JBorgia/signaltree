#!/usr/bin/env node

import { signalTree } from './dist/packages/core/fesm2022/signaltree-core.mjs';
import {
  withBatching,
  flushBatchedUpdates,
  hasPendingUpdates,
  getBatchQueueSize,
} from './dist/packages/batching/fesm2022/signaltree-batching.mjs';

console.log('🧪 Testing batching package...');

// Create a tree with batching
const tree = signalTree({ count: 0, items: [] }).pipe(withBatching());

console.log('✅ Tree with batching created successfully');
console.log('Initial count:', tree.state.count());
console.log('Initial queue size:', getBatchQueueSize());

// Test batched updates
tree.batchUpdate((state) => ({ count: state.count + 1 }));
tree.batchUpdate((state) => ({ count: state.count + 2 }));
tree.batchUpdate((state) => ({ count: state.count + 3 }));

console.log('After batched updates:');
console.log('Count (should be 0):', tree.state.count());
console.log('Queue size (should be 3):', getBatchQueueSize());
console.log('Has pending (should be true):', hasPendingUpdates());

// Manual flush
flushBatchedUpdates();

console.log('After manual flush:');
console.log('Count (should be 6):', tree.state.count());
console.log('Queue size (should be 0):', getBatchQueueSize());
console.log('Has pending (should be false):', hasPendingUpdates());

// Test automatic batching
tree.batchUpdate((state) => ({ count: state.count + 10 }));

console.log('After another batch update:');
console.log('Count before microtask:', tree.state.count());
console.log('Queue size:', getBatchQueueSize());

// Wait for microtask
await new Promise((resolve) => queueMicrotask(resolve));

console.log('After microtask:');
console.log('Count (should be 16):', tree.state.count());
console.log('Queue size (should be 0):', getBatchQueueSize());

console.log('✅ All batching functionality tests passed!');
