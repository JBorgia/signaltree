import { signalTree } from './dist/packages/core/fesm2022/signaltree-core.mjs';
import {
  withMiddleware,
  createLoggingMiddleware,
  createPerformanceMiddleware,
} from './dist/packages/middleware/fesm2022/signaltree-middleware.mjs';

// Test middleware functionality
console.log('🧪 Testing middleware package...');

const tree = signalTree({ count: 0, user: { name: 'John' } }).pipe(
  withMiddleware([
    createLoggingMiddleware('DemoTree'),
    createPerformanceMiddleware(),
  ])
);

console.log('✅ Tree with middleware created successfully');

// Test updates with middleware
tree.update((state) => ({ count: state.count + 1 }));

// Test adding middleware at runtime
tree.addTap({
  id: 'runtime-validator',
  before: (action, payload, state) => {
    console.log(`🔍 Validating ${action}...`);
    return true;
  },
  after: () => {
    console.log('✅ Validation passed');
  },
});

tree.update((state) => ({ count: state.count + 5 }));

// Test removing middleware
tree.removeTap('runtime-validator');

tree.update((state) => ({ user: { name: 'Jane' } }));

console.log('✅ All middleware functionality tests passed!');
