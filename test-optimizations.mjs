// Test the new optimization features
import { signalTree } from './signal-tree';

// Test the new invalidatePattern and debugMode features
function testNewOptimizations() {
  console.log('🧪 Testing new optimization features...');

  // Create enhanced tree with debug mode
  const tree = signalTree(
    {
      users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ],
      posts: [
        { id: 1, title: 'Hello World', userId: 1 },
        { id: 2, title: 'Test Post', userId: 2 },
      ],
      comments: [{ id: 1, content: 'Great post!', postId: 1 }],
    },
    {
      enablePerformanceFeatures: true,
      useMemoization: true,
      usePathBasedMemoization: true,
      debugMode: true,
      treeName: 'TestTree',
      trackPerformance: true,
    }
  );

  console.log('\n🔄 Creating cached computations...');

  // Create various cached computations
  const userCount = tree.memoize((state) => state.users.length, 'user.count');
  const activeUsers = tree.memoize(
    (state) => state.users.filter((u) => u.active),
    'user.active'
  );
  const postCount = tree.memoize((state) => state.posts.length, 'post.count');
  const commentCount = tree.memoize(
    (state) => state.comments.length,
    'comment.count'
  );
  const userNames = tree.memoize(
    (state) => state.users.map((u) => u.name),
    'user.names'
  );

  // Execute computations to create cache entries
  console.log('\n📊 Initial computations:');
  console.log('User count:', userCount());
  console.log('Active users:', activeUsers());
  console.log('Post count:', postCount());
  console.log('Comment count:', commentCount());
  console.log('User names:', userNames());

  // Test pattern invalidation
  console.log('\n🔍 Testing pattern invalidation...');

  console.log('\n1. Invalidating all user-related cache entries:');
  const userInvalidated = tree.invalidatePattern('user.*');
  console.log(`Invalidated ${userInvalidated} user cache entries`);

  console.log('\n2. Invalidating all count-related cache entries:');
  const countInvalidated = tree.invalidatePattern('*.count');
  console.log(`Invalidated ${countInvalidated} count cache entries`);

  console.log('\n3. Invalidating specific pattern:');
  const specificInvalidated = tree.invalidatePattern('user.active');
  console.log(`Invalidated ${specificInvalidated} specific cache entries`);

  // Test enhanced optimize function
  console.log('\n🧹 Testing enhanced optimization...');
  tree.optimize();

  // Get performance metrics
  console.log('\n📈 Performance metrics:');
  const metrics = tree.getMetrics();
  console.log(`Updates: ${metrics.updates}`);
  console.log(`Computations: ${metrics.computations}`);
  console.log(`Cache hits: ${metrics.cacheHits}`);
  console.log(`Cache misses: ${metrics.cacheMisses}`);
  console.log(`Average update time: ${metrics.averageUpdateTime}ms`);
  if (metrics.memoryUsage) {
    console.log(
      `Memory usage: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB`
    );
  }

  // Test tree destruction
  console.log('\n🗑️ Testing tree destruction...');
  tree.destroy();

  console.log('\n✅ All optimization features tested successfully!');
}

// Run the test
testNewOptimizations();
