/**
 * Enhanced test case definitions with enhancer specifications
 *
 * Each test case includes:
 * - Purpose: What the test specifically measures
 * - Enhancers: Required and optional SignalTree enhancers
 * - Data requirements: Size scaling and complexity
 * - Rationale: Why specific enhancers are chosen
 */

export interface BenchmarkTestCase {
  id: string;
  name: string;
  description: string;
  operations: string;
  complexity: string;
  selected: boolean;
  signalTreeOnly?: boolean; // True if this scenario is only supported by SignalTree
  disabledReason?: string; // Optional explanation why a scenario was auto-disabled
  partialUnsupportedBy?: string[]; // Libraries that partially support the scenario
  category: 'core' | 'async' | 'time-travel' | 'middleware' | 'full-stack';
  purpose: string; // What this test specifically measures
  frequencyWeight?: number; // Multiplier for real-world frequency (0.1 = very rare, 3.0 = very common)
  realWorldFrequency?: string; // Human-readable frequency description
  architecturalTradeOffs?: string; // Explanation of when this operation helps vs hurts
  enhancers: {
    required: string[]; // SignalTree enhancers required for this test
    optional: string[]; // SignalTree enhancers that could be beneficial
    rationale: string; // Why these enhancers are needed
  };
  dataRequirements: {
    minSize: number;
    maxSize: number;
    defaultSize: number;
    scalesWith: 'linear' | 'logarithmic' | 'exponential';
  };
}

export const ENHANCED_TEST_CASES: BenchmarkTestCase[] = [
  // Core Performance Tests
  /**
   * Rationale Alignment Note (2025-11):
   * Deep Nested scenario now mapped in implementation to batching + shallow memoization.
   * This file already lists batching as required and shallow as optional.
   * We intentionally keep shallow memoization optional here so downstream consumers can
   * evaluate raw batching only vs batching+shallow. The comparison components and
   * `SignalTreeBenchmarkService` treat shallow memoization as part of the default set
   * for Deep Nested fairness versus NgRx/SignalStore which rebuild nested objects.
   */
  {
    id: 'deep-nested',
    name: 'Deep Nested Updates',
    description: 'Updates to deeply nested state (15 levels)',
    operations: '1000 updates',
    complexity: 'High',
    selected: true,
    category: 'core',
    purpose:
      'Measures surgical update performance in complex object hierarchies',
    frequencyWeight: 2.5, // Very common in forms, configuration objects, complex UI state
    realWorldFrequency: 'Very High - Forms, settings, nested UI components',
    architecturalTradeOffs:
      'Direct mutation excels with deep updates vs immutable rebuilding',
    enhancers: {
      required: ['batching'],
      optional: ['shallowMemoization'],
      rationale:
        'Batching prevents excessive notifications; shallow memoization helps with object updates',
    },
    dataRequirements: {
      minSize: 100,
      maxSize: 10000,
      defaultSize: 1000,
      scalesWith: 'linear',
    },
  },
  // 'cold-start' scenario removed: startup/init timings are no longer
  // collected by default in the orchestrator. Use a dedicated harness or
  // enable it explicitly for nightly/manual profiling.
  {
    id: 'large-array',
    name: 'Large Array Mutations',
    description: 'Array operations on large datasets',
    operations: 'Size × 10',
    complexity: 'Medium',
    selected: false,
    category: 'core',
    purpose:
      'Tests O(1) direct mutation vs O(n) immutable array rebuilding. Enterprise enhancer provides +16.7% speedup through diff-based change detection.',
    frequencyWeight: 1.8, // High - Lists, tables, collections are very common
    realWorldFrequency: 'High - Lists, tables, data grids, search results',
    architecturalTradeOffs:
      'Direct mutation provides massive advantages for large arrays vs immutable rebuilding. Enterprise enhancer adds diff engine for targeted updates (skip unchanged elements).',
    enhancers: {
      required: ['highPerformanceBatching'],
      optional: [],
      rationale:
        'High-performance batching essential for rapid array updates; memoization counterproductive (adds cache mgmt overhead without repeated reads). Enterprise variant uses OptimizedUpdateEngine for +16.7% gain. Lazy array coalescing may be conditionally injected for very large datasets (>5k) by the benchmark service but is benchmark-only and therefore not listed here.',
    },
    dataRequirements: {
      minSize: 1000,
      maxSize: 100000,
      defaultSize: 10000,
      scalesWith: 'linear',
    },
  },
  {
    id: 'computed-chains',
    name: 'Complex Computed Chains',
    description: 'Cascading computed values with dependencies',
    operations: '500 computations',
    complexity: 'High',
    selected: false,
    category: 'core',
    purpose:
      'Evaluates dependency graph resolution and computed value performance',
    frequencyWeight: 2.2, // High - Computed values are fundamental to reactive apps
    realWorldFrequency:
      'High - Derived state, calculated fields, data transformations',
    architecturalTradeOffs:
      'Granular reactivity prevents unnecessary recalculations vs coarse invalidation',
    enhancers: {
      required: ['batching', 'shallowMemoization'],
      optional: [],
      rationale:
        'Batching reduces cascading updates; shallow memoization chosen over full to minimize cache layers while still skipping unchanged branch recalculations. Full memoization removed to avoid overstating win vs selector-focused libraries.',
    },
    dataRequirements: {
      minSize: 100,
      maxSize: 1000,
      defaultSize: 500,
      scalesWith: 'logarithmic',
    },
  },
  {
    id: 'batch-updates',
    name: 'Batched Operations',
    description: 'Multiple simultaneous state updates',
    operations: '100 batches',
    complexity: 'Medium',
    selected: false,
    category: 'core',
    purpose: 'Tests batching system efficiency and transaction-like behavior',
    frequencyWeight: 2.0, // Common - Form submissions, bulk operations, data synchronization
    realWorldFrequency:
      'Common - Form saves, bulk edits, transaction-like updates',
    architecturalTradeOffs:
      'Batching reduces render thrashing vs individual update overhead',
    enhancers: {
      required: ['highPerformanceBatching'],
      optional: [],
      rationale:
        'Core batching functionality being tested - no other enhancers needed',
    },
    dataRequirements: {
      minSize: 50,
      maxSize: 1000,
      defaultSize: 100,
      scalesWith: 'linear',
    },
  },
  {
    id: 'selector-memoization',
    name: 'Selector/Memoization',
    description: 'Memoized selector performance',
    operations: '1000 selections',
    complexity: 'Low',
    selected: false,
    category: 'core',
    purpose: 'Evaluates memoization effectiveness and cache hit rates',
    frequencyWeight: 2.8, // Very High - Selectors are used everywhere in modern apps
    realWorldFrequency:
      'Very High - Data filtering, searching, computed UI state',
    architecturalTradeOffs:
      'Memoization prevents expensive recalculations vs memory overhead',
    enhancers: {
      required: ['lightweightMemoization'],
      optional: ['batching'],
      rationale:
        'Testing memoization system using lightweight tier for realistic selector access cost (shallower caches, lower memory). Shallow/full tiers intentionally excluded to avoid unfair amplification versus NgRx Store selector memoization.',
    },
    dataRequirements: {
      minSize: 500,
      maxSize: 5000,
      defaultSize: 1000,
      scalesWith: 'linear',
    },
  },
  {
    id: 'serialization',
    name: 'Serialization (Snapshot + JSON)',
    description: 'Convert state to plain JSON (unwrap + stringify)',
    operations: 'Per iteration',
    complexity: 'Medium',
    selected: false,
    category: 'core',
    purpose: 'Measures serialization overhead and JSON conversion performance',
    frequencyWeight: 0.8, // Below normal - Only needed for persistence, debugging, SSR
    realWorldFrequency:
      'Low - State persistence, debugging, server-side rendering',
    architecturalTradeOffs:
      'Direct JSON serialization vs complex immutable structure traversal',
    enhancers: {
      required: ['serialization', 'memoization', 'highPerformanceBatching'],
      optional: [],
      rationale:
        "Testing serialization feature; memoization and batching stabilize signal read patterns before snapshot. Serialization enhancer performs unwrap + JSON conversion; memoization ensures dependent computed signals aren't re-evaluated spuriously.",
    },
    dataRequirements: {
      minSize: 100,
      maxSize: 10000,
      defaultSize: 1000,
      scalesWith: 'exponential',
    },
  },
  {
    id: 'concurrent-updates',
    name: 'Rapid Sequential Updates',
    description: 'High-frequency sequential modifications',
    operations: '50 concurrent',
    complexity: 'Extreme',
    selected: false,
    category: 'core',
    purpose: 'Tests performance under high-frequency update pressure',
    frequencyWeight: 0.4, // Rare - Only in specific scenarios like gaming, real-time data
    realWorldFrequency:
      'Rare - Gaming, real-time data streams, intensive animations',
    architecturalTradeOffs:
      'SignalTree integrates with Angular\'s change detection (automatic microtask batching). This scenario tests "unmanaged" rapid updates that bypass framework batching, which doesn\'t reflect real Angular usage. Use highPerformanceBatching() for 60Hz+ updates in production.',
    enhancers: {
      required: ['batching'],
      optional: [],
      rationale:
        "Batching essential to prevent overwhelming the reactivity system. Memoization intentionally excluded—hot update loop rarely benefits from cache hits and would inflate overhead. Note: This scenario is architecturally incompatible with Angular's reactive system, not a performance limitation.",
    },
    dataRequirements: {
      minSize: 50,
      maxSize: 500,
      defaultSize: 50,
      scalesWith: 'linear',
    },
  },
  {
    id: 'subscriber-scaling',
    name: 'Subscriber Scaling',
    description:
      'Performance with increasing numbers of subscribers to a single state node',
    operations: '1000 updates with N subscribers',
    complexity: 'High',
    selected: true,
    category: 'core',
    purpose:
      'Measures update fanout performance at extreme scale (1000 subscribers). SignalTree is ~15% slower due to Angular computed() dependency tracking (~2μs) vs NgRx pure function selectors (~0.3μs). At realistic scale (10-50 subscribers), the difference is <0.5ms and negligible. Fine-grained reactivity prevents full component re-renders, saving 100-1000x more time downstream.',
    frequencyWeight: 1.5, // Medium-High - Reactive apps often have multiple subscribers
    realWorldFrequency:
      'Medium-High - Reactive UIs, data binding, multiple components',
    architecturalTradeOffs:
      'Micro-overhead (~2μs per computed) enables macro-optimization (prevents unnecessary component renders). Trade-off: small reactivity cost for massive rendering savings.',
    enhancers: {
      required: [],
      optional: ['batching'],
      rationale:
        'Testing core reactivity scaling without artificial batching assistance; batching optional for exploring mitigation of notification fanout cost. Real apps use OnPush to limit subscriber evaluations.',
    },
    dataRequirements: {
      minSize: 10,
      maxSize: 1000,
      defaultSize: 100,
      scalesWith: 'linear',
    },
  },

  // Time-travel Tests
  {
    id: 'undo-redo',
    name: 'Undo/Redo Operations',
    description: 'Time-travel through state history',
    operations: '100 undo/redo',
    complexity: 'Medium',
    selected: false,
    category: 'time-travel',
    // This scenario relies on the timeTravel enhancer from @signaltree/core
    signalTreeOnly: true,
    purpose:
      'Tests time-travel functionality and history navigation performance',
    frequencyWeight: 0.6, // Low - Only design tools, editors, debugging scenarios
    realWorldFrequency: 'Low - Text editors, design tools, debugging workflows',
    architecturalTradeOffs:
      'Time-travel requires immutable snapshots vs direct mutation benefits',
    enhancers: {
      required: ['timeTravel'],
      optional: ['batching'],
      rationale:
        'Time-travel enhancer required; batching may improve performance',
    },
    dataRequirements: {
      minSize: 50,
      maxSize: 500,
      defaultSize: 100,
      scalesWith: 'linear',
    },
  },
  {
    id: 'history-size',
    name: 'History Buffer Scaling',
    description: 'Performance with large history buffers',
    operations: '1000 history entries',
    complexity: 'High',
    selected: false,
    category: 'time-travel',
    // This scenario uses timeTravel enhancer from @signaltree/core
    signalTreeOnly: true,
    purpose: 'Tests time-travel performance with large history buffers',
    frequencyWeight: 0.3, // Rare - Only specific debugging/development scenarios
    realWorldFrequency: 'Rare - Development tools, complex debugging workflows',
    architecturalTradeOffs:
      'Large history requires significant memory vs lightweight state tracking',
    enhancers: {
      required: ['timeTravel'],
      optional: [],
      rationale: 'Time-travel enhancer with large history size configuration',
    },
    dataRequirements: {
      minSize: 500,
      maxSize: 5000,
      defaultSize: 1000,
      scalesWith: 'logarithmic',
    },
  },
  {
    id: 'jump-to-state',
    name: 'Jump to State',
    description: 'Jumping to arbitrary points in history',
    operations: '50 jumps',
    complexity: 'Medium',
    selected: false,
    category: 'time-travel',
    // This scenario uses timeTravel enhancer from @signaltree/core
    signalTreeOnly: true,
    purpose: 'Tests random access performance in time-travel history',
    frequencyWeight: 0.2, // Very rare - Only advanced debugging/development tools
    realWorldFrequency: 'Very Rare - Advanced debugging, development tools',
    architecturalTradeOffs:
      'Random state access requires indexed history vs linear traversal',
    enhancers: {
      required: ['timeTravel'],
      optional: [],
      rationale: 'Time-travel enhancer for state jumping functionality',
    },
    dataRequirements: {
      minSize: 25,
      maxSize: 200,
      defaultSize: 50,
      scalesWith: 'linear',
    },
  },

  // (Async scenarios removed - demo no longer includes the async workflow page)

  // Full-stack Tests
  // Full-stack Tests
];
