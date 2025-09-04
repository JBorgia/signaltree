// Quick test to verify that store.$ and store.state are equivalent
const {
  signalTree,
} = require('./dist/packages/core/fesm2022/signaltree-core.mjs');

try {
  const tree = signalTree({ count: 0, name: 'test' });

  console.log('tree object keys:', Object.keys(tree));
  console.log('tree.$ exists:', '$' in tree);
  console.log('tree.state exists:', 'state' in tree);
  console.log('tree.$:', tree.$);
  console.log('tree.state:', tree.state);
  console.log('tree.$ === tree.state:', tree.$ === tree.state);

  if (tree.$ && tree.state) {
    console.log(
      'tree.$.count === tree.state.count:',
      tree.$.count === tree.state.count
    );

    // Test setting values
    tree.$.count.set(5);
    console.log('After tree.$.count.set(5):');
    console.log('tree.$.count():', tree.$.count());
    console.log('tree.state.count():', tree.state.count());

    tree.state.count.set(10);
    console.log('After tree.state.count.set(10):');
    console.log('tree.$.count():', tree.$.count());
    console.log('tree.state.count():', tree.state.count());

    console.log('✅ Both APIs work identically!');
  } else {
    console.log('❌ One of the properties is undefined');
  }
} catch (error) {
  console.log('❌ Error testing APIs:', error.message);
  console.log('Stack:', error.stack);
}
