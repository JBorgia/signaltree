/**
 * Enhanced scenario definitions with enhancer specifications
 *
 * Each scenario includes:
 * - Purpose: What the test specifically measures
 * - Enhancers: Required and optional SignalTree enhancers
 * - Data requirements: Size scaling and complexity
 * - Rationale: Why specific enhancers are chosen
 */

export interface Scenario {
  id: string;
  name: string;
  description: string;
  operations: string;
  complexity: string;
  selected: boolean;
  category: 'core' | 'async' | 'time-travel' | 'middleware' | 'full-stack';
  purpose: string; // What this test specifically measures
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

export const ENHANCED_SCENARIOS: Scenario[] = [
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
  {
    id: 'large-array',
    name: 'Large Array Mutations',
    description: 'Array operations on large datasets',
    operations: 'Size × 10',
    complexity: 'Medium',
    selected: false,
    category: 'core',
    purpose: 'Tests O(1) direct mutation vs O(n) immutable array rebuilding',
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
    id: 'memory-efficiency',
    name: 'Memory Usage',
    description: 'Memory consumption patterns',
    operations: 'Continuous',
    complexity: 'Variable',
    selected: false,
    category: 'core',
    purpose: 'Measures memory overhead and garbage collection impact',
    enhancers: {
      required: ['withLightweightMemoization', 'withBatching'],
      optional: [],
      rationale:
        'Lightweight memoization minimizes memory overhead; batching reduces allocation pressure',
    },
    dataRequirements: {
      minSize: 1000,
      maxSize: 50000,
      defaultSize: 10000,
      scalesWith: 'exponential',
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
    purpose:
      'Tests time-travel functionality and history navigation performance',
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
    purpose: 'Tests time-travel performance with large history buffers',
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
    purpose: 'Tests random access performance in time-travel history',
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

  // Async Tests
  {
    id: 'async-workflow',
    name: 'Async Workflow',
    description: 'Multiple async operations with loading states',
    operations: '100 async calls',
    complexity: 'High',
    selected: false,
    category: 'async',
    purpose: 'Tests async state management and loading state handling',
    enhancers: {
      required: ['withBatching'],
      optional: ['withAsync'],
      rationale:
        'Batching for state updates; async enhancer if available for workflow management',
    },
    dataRequirements: {
      minSize: 50,
      maxSize: 500,
      defaultSize: 100,
      scalesWith: 'linear',
    },
  },

  // Full-stack Tests
  {
    id: 'all-features-enabled',
    name: 'All Features Enabled',
    description: 'All features: async, time-travel, middleware, memoization',
    operations: 'Mixed workload',
    complexity: 'Extreme',
    selected: false,
    category: 'full-stack',
    purpose: 'Tests performance with all SignalTree features enabled',
    enhancers: {
      required: ['withMemoization', 'withBatching', 'withSerialization'],
      optional: ['withTimeTravel', 'withAsync'],
      rationale:
        'Full feature test - all enhancers active to test integration overhead',
    },
    dataRequirements: {
      minSize: 1000,
      maxSize: 50000,
      defaultSize: 10000,
      scalesWith: 'exponential',
    },
  },
  {
    id: 'production-setup',
    name: 'Production Configuration',
    description: 'Realistic production-ready configuration',
    operations: 'Real-world workload',
    complexity: 'High',
    selected: false,
    category: 'full-stack',
    purpose: 'Tests realistic production setup performance',
    enhancers: {
      required: ['withMemoization', 'withBatching', 'withSerialization'],
      optional: [],
      rationale:
        'Production-ready configuration - stable, performant enhancer combination',
    },
    dataRequirements: {
      minSize: 5000,
      maxSize: 100000,
      defaultSize: 25000,
      scalesWith: 'linear',
    },
  },
];
