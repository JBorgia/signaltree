import { withBatching } from './dist/packages/core/src/enhancers/batching/index.js';
import { withMemoization } from './dist/packages/core/src/enhancers/memoization/index.js';
import { withMiddleware } from './dist/packages/core/src/enhancers/middleware/index.js';
import { create } from './dist/packages/core/src/index.js';

// Tree-shaking validation test using relative imports
// Test 1: Import only core functionality
const tree1 = create({ count: 0 });

// Test 2: Import core + one enhancer
const tree2 = create({ count: 0 }, [withBatching()]);

// Test 3: Import core + multiple enhancers
const tree3 = create({ count: 0 }, [
  withBatching(),
  withMemoization(),
  withMiddleware(),
]);

console.log('Tree-shaking test completed successfully');
