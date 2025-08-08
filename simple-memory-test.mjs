// Comprehensive Memory Leak Testing Suite for SignalTree
// Run with: node --expose-gc memory-test.js

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

class MockSignal {
  constructor(value) {
    this.value = value;
    this.listeners = new Set();
  }

  get() {
    return this.value;
  }

  set(newValue) {
    this.value = newValue;
    this.notifyListeners();
  }

  update(updateFn) {
    this.value = updateFn(this.value);
    this.notifyListeners();
  }

  notifyListeners() {
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy() {
    this.listeners.clear();
  }
}

function signal(initialValue) {
  return new MockSignal(initialValue);
}

function computed(computeFn) {
  const computedSignal = new MockSignal(computeFn());
  return computedSignal;
}

// ============================================
// ENHANCED SIGNAL TREE IMPLEMENTATION
// ============================================

class EnhancedSignalTree {
  constructor(initialData, config = {}) {
    this.config = config;
    this.treeName = config.treeName || 'SignalTree';
    this._signal = signal(initialData);

    // Memory management structures (matching your real implementation)
    this.lazyProxyCache = new WeakMap();
    this.proxyCleanupTasks = new Set();
    this.computedCache = new Map();
    this.pathDependencies = new Map();
    this.pathToCache = new Map();
    this.cacheVersionSignals = new Map();
    this.cacheAccessTimes = new Map();
    this.cacheAccessCounts = new Map();

    // Metrics
    this.metrics = {
      proxyCreations: 0,
      proxyCacheHits: 0,
      computations: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  createTrackingProxy(target, path = '') {
    // Check cache first
    if (this.lazyProxyCache.has(target)) {
      this.metrics.proxyCacheHits++;
      return this.lazyProxyCache.get(target);
    }

    this.metrics.proxyCreations++;

    const proxy = new Proxy(target, {
      get: (obj, prop) => {
        const fullPath = path ? `${path}.${String(prop)}` : String(prop);

        if (typeof obj[prop] === 'object' && obj[prop] !== null) {
          return this.createTrackingProxy(obj[prop], fullPath);
        }

        // Track path access for memoization
        if (this.config.trackPaths) {
          this.addPathDependency(fullPath);
        }

        return obj[prop];
      },
      set: (obj, prop, value) => {
        obj[prop] = value;
        const fullPath = path ? `${path}.${String(prop)}` : String(prop);
        this.invalidatePath(fullPath);
        this._signal.notifyListeners();
        return true;
      },
    });

    // Cache the proxy
    this.lazyProxyCache.set(target, proxy);

    // Register cleanup task
    const cleanup = () => {
      this.lazyProxyCache.delete(target);
    };
    this.proxyCleanupTasks.add(cleanup);

    return proxy;
  }

  addPathDependency(path) {
    // Simulate path tracking
    if (!this.pathDependencies.has(path)) {
      this.pathDependencies.set(path, new Set());
    }
  }

  invalidatePath(path) {
    // Simulate cache invalidation
    const dependent = this.pathToCache.get(path);
    if (dependent) {
      dependent.forEach((cacheKey) => {
        this.computedCache.delete(cacheKey);
      });
    }
  }

  memoize(fn, cacheKey) {
    if (this.computedCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      this.trackCacheAccess(cacheKey);
      return this.computedCache.get(cacheKey);
    }

    this.metrics.cacheMisses++;
    this.metrics.computations++;

    const result = computed(() => fn(this.get()));
    this.computedCache.set(cacheKey, result);
    this.trackCacheAccess(cacheKey);

    return result;
  }

  trackCacheAccess(key) {
    this.cacheAccessTimes.set(key, Date.now());
    this.cacheAccessCounts.set(key, (this.cacheAccessCounts.get(key) || 0) + 1);
  }

  optimize(maxCacheSize = 100) {
    // Smart cache eviction
    if (this.computedCache.size > maxCacheSize) {
      const entries = Array.from(this.computedCache.entries());
      const scoredEntries = entries.map(([key, value]) => ({
        key,
        value,
        score: this.getCacheScore(key),
      }));

      scoredEntries.sort((a, b) => b.score - a.score);
      const keepCount = Math.floor(maxCacheSize * 0.8);

      this.computedCache.clear();
      scoredEntries.slice(0, keepCount).forEach(({ key, value }) => {
        this.computedCache.set(key, value);
      });
    }

    // Clean up lazy proxies
    this.cleanupLazyProxies();
  }

  getCacheScore(key) {
    const lastAccess = this.cacheAccessTimes.get(key) || 0;
    const accessCount = this.cacheAccessCounts.get(key) || 0;
    const ageInSeconds = Math.max(1, (Date.now() - lastAccess) / 1000);
    return (accessCount * 1000) / ageInSeconds;
  }

  cleanupLazyProxies() {
    // Run all cleanup tasks
    this.proxyCleanupTasks.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    this.proxyCleanupTasks.clear();

    // Reset proxy cache (WeakMap will GC naturally)
    this.lazyProxyCache = new WeakMap();
  }

  get() {
    return this.createTrackingProxy(this._signal.get());
  }

  update(updateFn) {
    this._signal.update(updateFn);
  }

  clearCache() {
    this.computedCache.clear();
    this.pathDependencies.clear();
    this.pathToCache.clear();
    this.cacheVersionSignals.clear();
    this.cacheAccessTimes.clear();
    this.cacheAccessCounts.clear();
    this.cleanupLazyProxies();
  }

  destroy() {
    this.clearCache();
    this._signal.destroy();
    this.metrics = null;
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

// ============================================
// MEMORY TESTING UTILITIES
// ============================================

class MemoryProfiler {
  constructor() {
    this.snapshots = [];
    this.forceGC();
  }

  forceGC() {
    if (global.gc) {
      global.gc();
      global.gc(); // Run twice to be thorough
    }
  }

  takeSnapshot(label) {
    this.forceGC();
    const usage = process.memoryUsage();
    const snapshot = {
      label,
      timestamp: Date.now(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
    };
    this.snapshots.push(snapshot);
    return snapshot;
  }

  formatBytes(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  compareSnapshots(label1, label2) {
    const snap1 = this.snapshots.find((s) => s.label === label1);
    const snap2 = this.snapshots.find((s) => s.label === label2);

    if (!snap1 || !snap2) {
      throw new Error('Snapshot not found');
    }

    const diff = {
      heapUsed: snap2.heapUsed - snap1.heapUsed,
      heapTotal: snap2.heapTotal - snap1.heapTotal,
      external: snap2.external - snap1.external,
    };

    return {
      heapUsedDiff: this.formatBytes(diff.heapUsed),
      heapTotalDiff: this.formatBytes(diff.heapTotal),
      percentIncrease:
        ((diff.heapUsed / snap1.heapUsed) * 100).toFixed(1) + '%',
    };
  }

  generateReport() {
    console.log('\n📊 Memory Profile Report');
    console.log('━'.repeat(60));

    this.snapshots.forEach((snap, i) => {
      console.log(`\n${i + 1}. ${snap.label}`);
      console.log(`   Heap Used:     ${this.formatBytes(snap.heapUsed)}`);
      console.log(`   Heap Total:    ${this.formatBytes(snap.heapTotal)}`);
      console.log(`   External:      ${this.formatBytes(snap.external)}`);

      if (i > 0) {
        const prev = this.snapshots[i - 1];
        const diff = snap.heapUsed - prev.heapUsed;
        const sign = diff > 0 ? '+' : '';
        console.log(`   Change:        ${sign}${this.formatBytes(diff)}`);
      }
    });
  }
}

// ============================================
// TEST SCENARIOS
// ============================================

async function runMemoryTests() {
  console.log('🧪 SignalTree Memory Testing Suite');
  console.log('='.repeat(60));

  const profiler = new MemoryProfiler();

  // Test 1: Baseline Memory Usage
  console.log('\n📝 Test 1: Baseline Memory Usage');
  profiler.takeSnapshot('Initial');

  // Test 2: Large State Tree Creation
  console.log('\n📝 Test 2: Large State Tree Creation');
  const createLargeState = () => {
    const state = { users: {}, items: {}, metadata: {} };

    // Create 1000 users with nested data
    for (let i = 0; i < 1000; i++) {
      state.users[`user${i}`] = {
        id: i,
        name: `User ${i}`,
        profile: {
          age: 20 + (i % 50),
          email: `user${i}@example.com`,
          settings: {
            theme: 'dark',
            notifications: true,
            preferences: {
              language: 'en',
              timezone: 'UTC',
            },
          },
        },
        posts: Array(10)
          .fill(null)
          .map((_, j) => ({
            id: `${i}-${j}`,
            title: `Post ${j}`,
            content: 'Lorem ipsum'.repeat(10),
          })),
      };
    }

    // Create 500 items
    for (let i = 0; i < 500; i++) {
      state.items[`item${i}`] = {
        id: i,
        title: `Item ${i}`,
        description: 'Description text'.repeat(5),
        metadata: {
          created: Date.now(),
          updated: Date.now(),
          tags: ['tag1', 'tag2', 'tag3'],
        },
      };
    }

    return state;
  };

  const largeState = createLargeState();
  const tree = new EnhancedSignalTree(largeState, {
    treeName: 'TestTree',
    trackPaths: true,
  });

  profiler.takeSnapshot('After tree creation');

  // Test 3: Proxy Creation Storm (without cleanup)
  console.log('\n📝 Test 3: Proxy Creation Storm');
  for (let iteration = 0; iteration < 100; iteration++) {
    const state = tree.get();

    // Access many nested properties
    for (let i = 0; i < 10; i++) {
      const user = state.users[`user${i}`];
      const _ = user?.profile?.settings?.preferences?.language;
    }

    for (let i = 0; i < 10; i++) {
      const item = state.items[`item${i}`];
      const _ = item?.metadata?.tags;
    }
  }

  profiler.takeSnapshot('After proxy storm');
  console.log(`   Proxy creations: ${tree.getMetrics().proxyCreations}`);
  console.log(`   Proxy cache hits: ${tree.getMetrics().proxyCacheHits}`);

  // Test 4: Memoization Memory Usage
  console.log('\n📝 Test 4: Memoization Memory Usage');

  // Create many memoized computations
  for (let i = 0; i < 200; i++) {
    tree.memoize((state) => Object.keys(state.users).length, `userCount-${i}`);

    tree.memoize(
      (state) => Object.values(state.items).filter((item) => item.id < 50),
      `filteredItems-${i}`
    );
  }

  profiler.takeSnapshot('After memoization');
  console.log(`   Cache entries: ${tree.computedCache.size}`);
  console.log(`   Cache hits: ${tree.getMetrics().cacheHits}`);
  console.log(`   Cache misses: ${tree.getMetrics().cacheMisses}`);

  // Test 5: Optimization (Smart Eviction)
  console.log('\n📝 Test 5: Smart Cache Eviction');
  tree.optimize(50); // Keep only 50 cache entries

  profiler.takeSnapshot('After optimization');
  console.log(
    `   Cache entries after optimization: ${tree.computedCache.size}`
  );

  // Test 6: Update Storm (Path Invalidation)
  console.log('\n📝 Test 6: Update Storm with Path Invalidation');

  for (let i = 0; i < 100; i++) {
    tree.update((state) => ({
      ...state,
      users: {
        ...state.users,
        [`user${i}`]: {
          ...state.users[`user${i}`],
          profile: {
            ...state.users[`user${i}`].profile,
            age: Math.random() * 100,
          },
        },
      },
    }));
  }

  profiler.takeSnapshot('After update storm');

  // Test 7: Clear Cache
  console.log('\n📝 Test 7: Cache Clearing');
  tree.clearCache();

  profiler.takeSnapshot('After cache clear');
  console.log(`   Cache entries: ${tree.computedCache.size}`);
  console.log(`   Path dependencies: ${tree.pathDependencies.size}`);

  // Test 8: Tree Destruction
  console.log('\n📝 Test 8: Tree Destruction');
  tree.destroy();

  profiler.takeSnapshot('After destruction');

  // Test 9: Multiple Trees (Memory Isolation)
  console.log('\n📝 Test 9: Multiple Trees Memory Isolation');
  const trees = [];

  for (let i = 0; i < 10; i++) {
    const miniState = {
      id: i,
      data: Array(100)
        .fill(null)
        .map((_, j) => ({
          value: `${i}-${j}`,
          nested: { deep: { value: Math.random() } },
        })),
    };

    trees.push(
      new EnhancedSignalTree(miniState, {
        treeName: `Tree${i}`,
      })
    );
  }

  profiler.takeSnapshot('After creating 10 trees');

  // Access all trees
  trees.forEach((tree, i) => {
    const state = tree.get();
    for (let j = 0; j < 10; j++) {
      const _ = state.data[j]?.nested?.deep?.value;
    }
  });

  profiler.takeSnapshot('After accessing all trees');

  // Destroy half the trees
  for (let i = 0; i < 5; i++) {
    trees[i].destroy();
  }
  trees.splice(0, 5);

  profiler.takeSnapshot('After destroying half');

  // Destroy remaining trees
  trees.forEach((tree) => tree.destroy());
  trees.length = 0;

  profiler.takeSnapshot('After destroying all');

  // Generate final report
  profiler.generateReport();

  // Analysis
  console.log('\n\n🔍 Memory Analysis');
  console.log('━'.repeat(60));

  const comparisons = [
    { from: 'Initial', to: 'After tree creation', label: 'Tree Creation Cost' },
    {
      from: 'After tree creation',
      to: 'After proxy storm',
      label: 'Proxy Caching Efficiency',
    },
    {
      from: 'After proxy storm',
      to: 'After memoization',
      label: 'Memoization Cost',
    },
    {
      from: 'After memoization',
      to: 'After optimization',
      label: 'Optimization Savings',
    },
    {
      from: 'After optimization',
      to: 'After cache clear',
      label: 'Cache Clear Savings',
    },
    {
      from: 'After cache clear',
      to: 'After destruction',
      label: 'Destruction Cleanup',
    },
    {
      from: 'After creating 10 trees',
      to: 'After destroying all',
      label: 'Multi-tree Cleanup',
    },
  ];

  comparisons.forEach(({ from, to, label }) => {
    try {
      const diff = profiler.compareSnapshots(from, to);
      console.log(`\n${label}:`);
      console.log(
        `  Heap change: ${diff.heapUsedDiff} (${diff.percentIncrease})`
      );
    } catch (e) {
      // Skip if snapshot doesn't exist
    }
  });

  // Final verdict
  console.log('\n\n🎯 Test Results');
  console.log('━'.repeat(60));

  const initialSnap = profiler.snapshots[0];
  const finalSnap = profiler.snapshots[profiler.snapshots.length - 1];
  const totalLeak = finalSnap.heapUsed - initialSnap.heapUsed;
  const leakMB = (totalLeak / 1024 / 1024).toFixed(2);

  console.log(`Initial memory:  ${profiler.formatBytes(initialSnap.heapUsed)}`);
  console.log(`Final memory:    ${profiler.formatBytes(finalSnap.heapUsed)}`);
  console.log(`Memory leaked:   ${leakMB} MB`);

  if (Math.abs(totalLeak) < 5 * 1024 * 1024) {
    // Less than 5MB
    console.log('\n✅ EXCELLENT: No significant memory leaks detected!');
  } else if (Math.abs(totalLeak) < 10 * 1024 * 1024) {
    // Less than 10MB
    console.log('\n⚠️ GOOD: Minor memory retention detected.');
  } else {
    console.log('\n❌ WARNING: Significant memory retention detected!');
  }

  console.log('\n🎉 Memory testing complete!');
}

// ============================================
// RUN TESTS
// ============================================

// Check if running with --expose-gc flag
if (!global.gc) {
  console.log('⚠️  Warning: Run with --expose-gc flag for accurate results:');
  console.log('   node --expose-gc memory-test.js\n');
}

// Run the test suite
runMemoryTests().catch(console.error);
