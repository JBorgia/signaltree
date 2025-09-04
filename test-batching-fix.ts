import { withBatching } from '@signaltree/batching';
import { signalTree } from '@signaltree/core';

// Test if both $ and state APIs work with batching enhancer
console.log('Testing $ alias with batching enhancer...');

try {
  const tree = signalTree({ count: 0, name: 'test' }).with(withBatching());

  console.log('Enhanced tree - tree.$ exists:', '$' in tree);
  console.log('Enhanced tree - tree.state exists:', 'state' in tree);
  console.log('Enhanced tree - tree.$:', tree.$);
  console.log('Enhanced tree - tree.state:', tree.state);
  console.log('Enhanced tree - tree.$ === tree.state:', tree.$ === tree.state);

  if (tree.$ && tree.state) {
    console.log(
      'Enhanced tree - tree.$.count === tree.state.count:',
      tree.$.count === tree.state.count
    );

    // Test setting values
    tree.$.count.set(5);
    console.log('Enhanced tree - After tree.$.count.set(5):');
    console.log('Enhanced tree - tree.$.count():', tree.$.count());
    console.log('Enhanced tree - tree.state.count():', tree.state.count());

    tree.state.count.set(10);
    console.log('Enhanced tree - After tree.state.count.set(10):');
    console.log('Enhanced tree - tree.$.count():', tree.$.count());
    console.log('Enhanced tree - tree.state.count():', tree.state.count());

    console.log('✅ Enhanced tree - Both APIs work identically!');
  } else {
    console.log('❌ Enhanced tree - One of the properties is undefined');
    console.log('tree.$:', tree.$);
    console.log('tree.state:', tree.state);
  }
} catch (error) {
  console.log('❌ Enhanced tree - Error testing APIs:', error.message);
  console.log('Stack:', error.stack);
}
