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
      required: ['withBatching'],
      optional: ['withShallowMemoization'],
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
    purpose: 'Tests O(1) direct mutation vs O(n) immutable array rebuilding',
    frequencyWeight: 1.8, // High - Lists, tables, collections are very common
    realWorldFrequency: 'High - Lists, tables, data grids, search results',
    architecturalTradeOffs:
      'Direct mutation provides massive advantages for large arrays vs immutable rebuilding',
    enhancers: {
      required: ['withHighPerformanceBatching'],
      optional: [],
      rationale:
        'High-performance batching essential for rapid array updates; memoization counterproductive',
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
      required: ['withBatching', 'withShallowMemoization'],
      optional: [],
      rationale:
        'Batching reduces cascading updates; memoization prevents redundant computations',
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
      required: ['withHighPerformanceBatching'],
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
      required: ['withLightweightMemoization'],
      optional: ['withBatching'],
      rationale:
        'Testing memoization system - lightweight version for better performance',
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
      required: [
        'withSerialization',
        'withMemoization',
        'withHighPerformanceBatching',
      ],
      optional: [],
      rationale:
        'Testing serialization feature; memoization and batching for stable baseline',
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
      'Direct mutation handles rapid updates vs immutable bottlenecks',
    enhancers: {
      required: ['withBatching'],
      optional: [],
      rationale:
        'Batching essential to prevent overwhelming the reactivity system',
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
      'Measures update fanout performance and scalability as subscriber count increases',
    frequencyWeight: 1.5, // Medium-High - Reactive apps often have multiple subscribers
    realWorldFrequency:
      'Medium-High - Reactive UIs, data binding, multiple components',
    architecturalTradeOffs:
      'Direct mutation scales better with many subscribers vs immutable notification overhead',
    enhancers: {
      required: [],
      optional: ['withBatching'],
      rationale:
        'Testing core reactivity scaling; batching may help with fanout',
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
    // This scenario is only supported by SignalTree (uses @signaltree/time-travel)
    signalTreeOnly: true,
    purpose:
      'Tests time-travel functionality and history navigation performance',
    frequencyWeight: 0.6, // Low - Only design tools, editors, debugging scenarios
    realWorldFrequency: 'Low - Text editors, design tools, debugging workflows',
    architecturalTradeOffs:
      'Time-travel requires immutable snapshots vs direct mutation benefits',
    enhancers: {
      required: ['withTimeTravel'],
      optional: ['withBatching'],
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
    name: 'Large History Size',
    description: 'Performance with large history buffers',
    operations: '1000 history entries',
    complexity: 'High',
    selected: false,
    category: 'time-travel',
    // This scenario is only supported by SignalTree (uses @signaltree/time-travel)
    signalTreeOnly: true,
    purpose: 'Tests time-travel performance with large history buffers',
    frequencyWeight: 0.3, // Rare - Only specific debugging/development scenarios
    realWorldFrequency: 'Rare - Development tools, complex debugging workflows',
    architecturalTradeOffs:
      'Large history requires significant memory vs lightweight state tracking',
    enhancers: {
      required: ['withTimeTravel'],
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
    // This scenario is only supported by SignalTree (uses @signaltree/time-travel)
    signalTreeOnly: true,
    purpose: 'Tests random access performance in time-travel history',
    frequencyWeight: 0.2, // Very rare - Only advanced debugging/development tools
    realWorldFrequency: 'Very Rare - Advanced debugging, development tools',
    architecturalTradeOffs:
      'Random state access requires indexed history vs linear traversal',
    enhancers: {
      required: ['withTimeTravel'],
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

  // Middleware Tests
  {
    id: 'single-middleware',
    name: 'Single Middleware',
    description: 'Performance impact of one middleware',
    operations: '1000 operations',
    complexity: 'Low',
    selected: false,
    category: 'middleware',
    purpose: 'Measures overhead of middleware layer on performance',
    frequencyWeight: 1.2, // Slightly above normal - Logging, analytics are common
    realWorldFrequency: 'Medium - Logging, analytics, error tracking',
    architecturalTradeOffs:
      'Middleware adds flexibility vs direct performance overhead',
    enhancers: {
      required: [],
      optional: ['withBatching'],
      rationale: 'No enhancers required - testing middleware impact',
    },
    dataRequirements: {
      minSize: 500,
      maxSize: 5000,
      defaultSize: 1000,
      scalesWith: 'linear',
    },
  },
  {
    id: 'multiple-middleware',
    name: 'Multiple Middleware',
    description: 'Stack of multiple middleware layers',
    operations: '1000 operations',
    complexity: 'Medium',
    selected: false,
    category: 'middleware',
    purpose: 'Tests performance impact of middleware stack depth',
    frequencyWeight: 0.7, // Below normal - Only complex enterprise applications
    realWorldFrequency: 'Low - Enterprise apps with complex middleware stacks',
    architecturalTradeOffs:
      'Middleware composition flexibility vs cumulative performance overhead',
    enhancers: {
      required: [],
      optional: ['withBatching'],
      rationale:
        'No enhancers required - testing cumulative middleware overhead',
    },
    dataRequirements: {
      minSize: 500,
      maxSize: 5000,
      defaultSize: 1000,
      scalesWith: 'linear',
    },
  },
  {
    id: 'conditional-middleware',
    name: 'Conditional Middleware',
    description: 'Middleware with conditional logic',
    operations: '1000 operations',
    complexity: 'Medium',
    selected: false,
    category: 'middleware',
    purpose: 'Tests performance of conditional middleware execution paths',
    frequencyWeight: 0.5, // Rare - Only sophisticated middleware implementations
    realWorldFrequency: 'Rare - Advanced middleware with conditional logic',
    architecturalTradeOffs:
      'Conditional middleware provides smart optimization vs branching overhead',
    enhancers: {
      required: [],
      optional: ['withBatching'],
      rationale: 'No enhancers required - testing conditional middleware logic',
    },
    dataRequirements: {
      minSize: 500,
      maxSize: 5000,
      defaultSize: 1000,
      scalesWith: 'linear',
    },
  },

  // (Async scenarios removed - demo no longer includes the async workflow page)

  // Full-stack Tests
  // Full-stack Tests
];
