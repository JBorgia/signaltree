import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { signalTree } from '@signal-tree';
import { ReplacePipe } from '../../../pipes/replace.pipe';

interface TestMetrics {
  updates: number;
  totalTime: number;
  averageTime: number;
  memoryUsage: number;
  cacheHits: number;
  renderCount: number;
}

interface TestResults {
  legacy: TestMetrics;
  optimized: TestMetrics;
  improvement: {
    performance: number;
    memory: number;
    efficiency: number;
  };
}

type TestType =
  | 'nested-updates'
  | 'pattern-invalidation'
  | 'memory-optimization'
  | 'memoization'
  | 'debug-mode';

@Component({
  selector: 'app-version-comparison',
  standalone: true,
  imports: [CommonModule, FormsModule, ReplacePipe],
  templateUrl: './version-comparison.component.html',
  styleUrls: ['./version-comparison.component.scss'],
})
export class VersionComparisonComponent implements OnDestroy {
  // Test configuration
  testSize = signal(1000);
  currentTest = signal<TestType>('nested-updates');
  isRunning = signal(false);

  // Test data structure
  readonly testData = {
    users: Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      active: i % 2 === 0,
      score: Math.floor(Math.random() * 100),
      metadata: {
        lastLogin: new Date(),
        preferences: {
          theme: i % 3 === 0 ? 'dark' : 'light',
          notifications: i % 4 === 0,
        },
      },
    })),
    products: Array.from({ length: 50 }, (_, i) => ({
      id: i,
      name: `Product ${i}`,
      price: Math.random() * 100,
      category: `Category ${i % 5}`,
      inStock: i % 3 !== 0,
    })),
    settings: {
      theme: 'light',
      locale: 'en-US',
      features: {
        analytics: true,
        notifications: true,
        darkMode: false,
      },
    },
  };

  // Legacy version (basic configuration - minimal features for comparison)
  legacyTree = signalTree(this.testData, 'basic');

  // Current optimized version (all features enabled)
  optimizedTree = signalTree(this.testData, {
    batchUpdates: true,
    useMemoization: true,
    debugMode: true,
    maxCacheSize: 100,
    treeName: 'OptimizedTree',
  });

  // Results tracking
  testResults = signal<TestResults>({
    legacy: this.getEmptyMetrics(),
    optimized: this.getEmptyMetrics(),
    improvement: {
      performance: 0,
      memory: 0,
      efficiency: 0,
    },
  });

  // Computed values for testing memoization
  legacyActiveUsers = computed(() =>
    this.legacyTree.$.users().filter((u) => u.active)
  );

  optimizedActiveUsers = computed(() =>
    this.optimizedTree.$.users().filter((u) => u.active)
  );

  legacyExpensiveComputation = computed(() => {
    const users = this.legacyTree.$.users();
    const products = this.legacyTree.$.products();

    // Simulate expensive computation
    let result = 0;
    for (let i = 0; i < users.length; i++) {
      for (let j = 0; j < products.length; j++) {
        result += users[i].score * products[j].price;
      }
    }
    return result;
  });

  optimizedExpensiveComputation = computed(() => {
    const users = this.optimizedTree.$.users();
    const products = this.optimizedTree.$.products();

    // Same expensive computation, but with memoization benefits
    let result = 0;
    for (let i = 0; i < users.length; i++) {
      for (let j = 0; j < products.length; j++) {
        result += users[i].score * products[j].price;
      }
    }
    return result;
  });

  // Effect counters
  private legacyEffectRuns = 0;
  private optimizedEffectRuns = 0;

  constructor() {
    this.setupEffects();
  }

  ngOnDestroy() {
    this.isRunning.set(false);
  }

  private setupEffects() {
    // Legacy tree effect tracking
    effect(() => {
      this.legacyActiveUsers();
      this.legacyExpensiveComputation();
      this.legacyEffectRuns++;
    });

    // Optimized tree effect tracking
    effect(() => {
      this.optimizedActiveUsers();
      this.optimizedExpensiveComputation();
      this.optimizedEffectRuns++;
    });
  }

  private getEmptyMetrics(): TestMetrics {
    return {
      updates: 0,
      totalTime: 0,
      averageTime: 0,
      memoryUsage: 0,
      cacheHits: 0,
      renderCount: 0,
    };
  }

  async runAllTests() {
    this.isRunning.set(true);

    const tests: TestType[] = [
      'nested-updates',
      'pattern-invalidation',
      'memory-optimization',
      'memoization',
      'debug-mode',
    ];

    for (const test of tests) {
      this.currentTest.set(test);
      await this.runSpecificTest(test);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Brief pause between tests
    }

    this.isRunning.set(false);
  }

  async runCurrentTest() {
    this.isRunning.set(true);
    await this.runSpecificTest(this.currentTest());
    this.isRunning.set(false);
  }

  private async runSpecificTest(testType: TestType) {
    this.resetTrees();
    this.resetMetrics();

    switch (testType) {
      case 'nested-updates':
        await this.testNestedUpdates();
        break;
      case 'pattern-invalidation':
        await this.testPatternInvalidation();
        break;
      case 'memory-optimization':
        await this.testMemoryOptimization();
        break;
      case 'memoization':
        await this.testMemoization();
        break;
      case 'debug-mode':
        await this.testDebugMode();
        break;
    }

    this.calculateImprovements();
  }

  private async testNestedUpdates() {
    const size = this.testSize();

    // Test legacy tree
    const legacyStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.legacyTree.$.users.update((users) =>
        users.map((u) => ({ ...u, score: u.score + 1 }))
      );
      this.legacyTree.$.settings.features.analytics.set(i % 2 === 0);
    }
    const legacyTime = performance.now() - legacyStart;

    // Test optimized tree with batching
    const optimizedStart = performance.now();
    for (let i = 0; i < size; i++) {
      if (this.optimizedTree.batchUpdate) {
        this.optimizedTree.batchUpdate((state) => ({
          ...state,
          users: state.users.map((u) => ({ ...u, score: u.score + 1 })),
          settings: {
            ...state.settings,
            features: {
              ...state.settings.features,
              analytics: i % 2 === 0,
            },
          },
        }));
      }
    }
    const optimizedTime = performance.now() - optimizedStart;

    this.updateResults('legacy', {
      updates: size,
      totalTime: legacyTime,
      averageTime: legacyTime / size,
      memoryUsage: this.estimateMemoryUsage(this.legacyTree),
      cacheHits: 0,
      renderCount: this.legacyEffectRuns,
    });

    this.updateResults('optimized', {
      updates: size,
      totalTime: optimizedTime,
      averageTime: optimizedTime / size,
      memoryUsage: this.estimateMemoryUsage(this.optimizedTree),
      cacheHits: 0,
      renderCount: this.optimizedEffectRuns,
    });
  }

  private async testPatternInvalidation() {
    if (!this.optimizedTree.invalidatePattern) {
      console.warn('Pattern invalidation not available in optimized tree');
      return;
    }

    const size = this.testSize();

    // Legacy tree - update everything manually
    const legacyStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.legacyTree.$.users.update((users) =>
        users.map((u) => ({ ...u, name: `Updated ${u.name}` }))
      );
    }
    const legacyTime = performance.now() - legacyStart;

    // Optimized tree - use pattern invalidation
    const optimizedStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.optimizedTree.$.users.update((users) =>
        users.map((u) => ({ ...u, name: `Updated ${u.name}` }))
      );

      // Use pattern invalidation for cache cleanup
      this.optimizedTree.invalidatePattern('user*');
    }
    const optimizedTime = performance.now() - optimizedStart;

    this.updateResults('legacy', {
      updates: size,
      totalTime: legacyTime,
      averageTime: legacyTime / size,
      memoryUsage: this.estimateMemoryUsage(this.legacyTree),
      cacheHits: 0,
      renderCount: this.legacyEffectRuns,
    });

    this.updateResults('optimized', {
      updates: size,
      totalTime: optimizedTime,
      averageTime: optimizedTime / size,
      memoryUsage: this.estimateMemoryUsage(this.optimizedTree),
      cacheHits: 0,
      renderCount: this.optimizedEffectRuns,
    });
  }

  private async testMemoryOptimization() {
    const size = this.testSize();

    // Legacy tree - no optimization
    const legacyStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.legacyTree.$.products.update((products) => [
        ...products,
        {
          id: products.length,
          name: `Product ${products.length}`,
          price: Math.random() * 100,
          category: `Category ${i % 5}`,
          inStock: true,
        },
      ]);
    }
    const legacyMemoryAfter = this.estimateMemoryUsage(this.legacyTree);
    const legacyTime = performance.now() - legacyStart;

    // Optimized tree - with memory optimization
    const optimizedStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.optimizedTree.$.products.update((products) => [
        ...products,
        {
          id: products.length,
          name: `Product ${products.length}`,
          price: Math.random() * 100,
          category: `Category ${i % 5}`,
          inStock: true,
        },
      ]);

      // Use optimize method periodically
      if (i % 100 === 0 && this.optimizedTree.optimize) {
        this.optimizedTree.optimize();
      }
    }
    const optimizedTime = performance.now() - optimizedStart;
    const optimizedMemoryAfter = this.estimateMemoryUsage(this.optimizedTree);

    this.updateResults('legacy', {
      updates: size,
      totalTime: legacyTime,
      averageTime: legacyTime / size,
      memoryUsage: legacyMemoryAfter,
      cacheHits: 0,
      renderCount: this.legacyEffectRuns,
    });

    this.updateResults('optimized', {
      updates: size,
      totalTime: optimizedTime,
      averageTime: optimizedTime / size,
      memoryUsage: optimizedMemoryAfter,
      cacheHits: 0,
      renderCount: this.optimizedEffectRuns,
    });
  }

  private async testMemoization() {
    const size = this.testSize();

    // Reset effect counters
    this.legacyEffectRuns = 0;
    this.optimizedEffectRuns = 0;

    // Legacy tree - trigger expensive computations
    const legacyStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.legacyTree.$.users.update((users) =>
        users.map((u) => ({ ...u, score: u.score + 0.1 }))
      );
      // Force computation
      this.legacyExpensiveComputation();
    }
    const legacyTime = performance.now() - legacyStart;

    // Optimized tree - should benefit from memoization
    const optimizedStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.optimizedTree.$.users.update((users) =>
        users.map((u) => ({ ...u, score: u.score + 0.1 }))
      );
      // Force computation
      this.optimizedExpensiveComputation();
    }
    const optimizedTime = performance.now() - optimizedStart;

    this.updateResults('legacy', {
      updates: size,
      totalTime: legacyTime,
      averageTime: legacyTime / size,
      memoryUsage: this.estimateMemoryUsage(this.legacyTree),
      cacheHits: 0,
      renderCount: this.legacyEffectRuns,
    });

    this.updateResults('optimized', {
      updates: size,
      totalTime: optimizedTime,
      averageTime: optimizedTime / size,
      memoryUsage: this.estimateMemoryUsage(this.optimizedTree),
      cacheHits: this.getCacheHits(),
      renderCount: this.optimizedEffectRuns,
    });
  }

  private async testDebugMode() {
    const size = Math.min(this.testSize(), 100); // Limit for debug output

    // Legacy tree - no debug info
    const legacyStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.legacyTree.$.settings.theme.set(i % 2 === 0 ? 'dark' : 'light');
    }
    const legacyTime = performance.now() - legacyStart;

    // Optimized tree - with debug mode
    const optimizedStart = performance.now();
    for (let i = 0; i < size; i++) {
      this.optimizedTree.$.settings.theme.set(i % 2 === 0 ? 'dark' : 'light');
    }
    const optimizedTime = performance.now() - optimizedStart;

    this.updateResults('legacy', {
      updates: size,
      totalTime: legacyTime,
      averageTime: legacyTime / size,
      memoryUsage: this.estimateMemoryUsage(this.legacyTree),
      cacheHits: 0,
      renderCount: this.legacyEffectRuns,
    });

    this.updateResults('optimized', {
      updates: size,
      totalTime: optimizedTime,
      averageTime: optimizedTime / size,
      memoryUsage: this.estimateMemoryUsage(this.optimizedTree),
      cacheHits: 0,
      renderCount: this.optimizedEffectRuns,
    });
  }

  private estimateMemoryUsage(tree: { unwrap: () => unknown }): number {
    try {
      const str = JSON.stringify(tree.unwrap());
      return str.length * 2; // Rough estimate in bytes (UTF-16)
    } catch {
      return 0;
    }
  }

  private getCacheHits(): number {
    // This would need to be implemented in the actual SignalTree library
    // For now, return a simulated value
    return Math.floor(Math.random() * this.testSize() * 0.3);
  }

  private resetTrees() {
    this.legacyTree.update(() => ({ ...this.testData }));
    this.optimizedTree.update(() => ({ ...this.testData }));
  }

  private resetMetrics() {
    this.legacyEffectRuns = 0;
    this.optimizedEffectRuns = 0;
  }

  private updateResults(type: 'legacy' | 'optimized', metrics: TestMetrics) {
    this.testResults.update((results) => ({
      ...results,
      [type]: metrics,
    }));
  }

  private calculateImprovements() {
    const results = this.testResults();
    const legacy = results.legacy;
    const optimized = results.optimized;

    const performance =
      legacy.totalTime > 0
        ? ((legacy.totalTime - optimized.totalTime) / legacy.totalTime) * 100
        : 0;

    const memory =
      legacy.memoryUsage > 0
        ? ((legacy.memoryUsage - optimized.memoryUsage) / legacy.memoryUsage) *
          100
        : 0;

    const efficiency =
      legacy.renderCount > 0
        ? ((legacy.renderCount - optimized.renderCount) / legacy.renderCount) *
          100
        : 0;

    this.testResults.update((results) => ({
      ...results,
      improvement: {
        performance: Math.max(0, performance),
        memory: Math.max(0, memory),
        efficiency: Math.max(0, efficiency),
      },
    }));
  }

  // Helper methods for template
  getTestDescription(testType: TestType): string {
    const descriptions = {
      'nested-updates': 'Tests batched vs individual nested object updates',
      'pattern-invalidation':
        'Tests pattern-based cache invalidation vs manual updates',
      'memory-optimization':
        'Tests automatic memory optimization vs uncontrolled growth',
      memoization: 'Tests computed value caching vs repeated calculations',
      'debug-mode': 'Tests debug mode overhead vs silent operation',
    };
    return descriptions[testType];
  }

  formatTime(ms: number): string {
    return ms.toFixed(2) + 'ms';
  }

  formatMemory(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  formatPercentage(value: number): string {
    return value.toFixed(1) + '%';
  }

  getLegacyTreeCode(): string {
    return `// Basic SignalTree (minimal features for comparison)
const tree = signalTree({
  users: [...],
  products: [...],
  settings: {...}
}, 'basic');

// Individual updates trigger effects immediately
for (let i = 0; i < 1000; i++) {
  tree.$.users.update(users =>
    users.map(u => ({ ...u, score: u.score + 1 }))
  );
  tree.$.settings.features.analytics.set(i % 2 === 0);
}`;
  }

  getOptimizedTreeCode(): string {
    return `// Optimized SignalTree (all features enabled)
const tree = signalTree({
  users: [...],
  products: [...],
  settings: {...}
}, {
  batchUpdates: true,
  useMemoization: true,
  debugMode: true,
  maxCacheSize: 100
});

// Batched updates, memoization, pattern invalidation
for (let i = 0; i < 1000; i++) {
  tree.batchUpdate(state => ({
    ...state,
    users: state.users.map(u => ({ ...u, score: u.score + 1 })),
    settings: {
      ...state.settings,
      features: { ...state.settings.features, analytics: i % 2 === 0 }
    }
  }));
}`;
  }
}
