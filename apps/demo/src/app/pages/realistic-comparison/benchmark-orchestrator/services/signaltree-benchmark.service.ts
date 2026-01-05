import { computed, Injectable } from '@angular/core';
import {
  batching,
  computedMemoization,
  ENHANCER_META,
  highPerformanceBatching,
  lightweightMemoization,
  memoization,
  selectorMemoization,
  serialization,
  shallowMemoization,
  signalTree,
  timeTravel,
} from '@signaltree/core';
import { resolveEnhancerOrder } from '@signaltree/core/enhancers';
import { enterprise } from '@signaltree/enterprise';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { createYieldToUI } from '../shared/benchmark-utils';
import { withLazyArrays } from '../with-lazy-arrays';
import { BenchmarkResult } from './_types';
import {
  BenchmarkComparison,
  EnhancedBenchmarkOptions,
  EnhancedBenchmarkResult,
  PerformanceEnvironment,
  runEnhancedBenchmark,
} from './benchmark-runner';

// Enterprise enhancer (premium optimization bundle)
// async package removed; rely on middleware and batching for async semantics
// demo-only: use benchmark-optimized async enhancer when available
/**
 * SignalTree Architecture Trade-offs Analysis
 *
 * This service demonstrates different state management architectures and their trade-offs.
 * Rather than declaring winners, it helps developers understand when each approach excels.
 *
 * 🎯 ARCHITECTURAL PATTERNS:
 *
 * SignalTree: Direct mutation with fine-grained reactivity
 * - Best for: Frequent, targeted updates to large state trees
 * - Trade-offs: Slower serialization (signals must be unwrapped)
 * - Use when: Building interactive editors, real-time dashboards, forms with complex validation
 *
 * NgRx/Redux: Immutable updates with predictable state flow
 * - Best for: Complex apps requiring time-travel debugging and predictable state transitions
 * - Trade-offs: More boilerplate, full object recreation on updates
 * - Use when: Large teams, complex business logic, audit requirements
 *
 * Entity Stores (Akita/Elf): Specialized for entity collections
 * - Best for: Managing normalized data with relationships
 * - Trade-offs: Domain-specific, less general-purpose
 * - Use when: CRUD apps, data-heavy applications
 *
 * NgXs: CQRS pattern with action-based flow
 * - Best for: Clear separation of commands and queries
 * - Trade-offs: Learning curve, action overhead
 * - Use when: Event-sourced architectures, complex workflows
 *
 * 📊 MEASUREMENT CONSIDERATIONS:
 * - Performance varies significantly based on data patterns and usage frequency
 * - Memory measurements are Chrome-specific and affected by GC timing
 * - Real-world performance depends on your specific use case patterns
 * - Consider developer experience, maintainability, and team familiarity
 *
 * 🔍 FREQUENCY MATTERS:
 * These benchmarks don't weight operations by real-world frequency. Consider:
 * - How often do you update vs serialize state?
 * - Are your updates targeted or bulk operations?
 * - Do you need time-travel debugging in production?
 * - What's your team's experience with different patterns?
 */

// Consider importing performance preset for consistency
// import { createPresetConfig } from '@signaltree/core';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class SignalTreeBenchmarkService {
  // Helper to produce standardized BenchmarkResult
  private toResult(durationMs: number, memoryDeltaMB?: number, notes?: string) {
    return {
      durationMs: Math.round(durationMs * 100) / 100,
      memoryDeltaMB,
      notes,
    } as BenchmarkResult;
  }
  // ==========================================
  // YIELD STRATEGY: HYBRID APPROACH
  // ==========================================

  /**
   * UI yield between benchmarks - maintains responsiveness without affecting measurement accuracy
   */
  private async yieldBetweenBenchmarks(): Promise<void> {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }

  private yieldToUI = createYieldToUI();

  // Read runtime memo mode set by the orchestrator (or URL param)
  private getRuntimeMemoMode(): 'off' | 'light' | 'shallow' | 'full' {
    try {
      const g = window.__SIGNALTREE_MEMO_MODE;
      if (g === 'off' || g === 'light' || g === 'shallow' || g === 'full')
        return g;
    } catch {
      // ignore
    }
    return 'light';
  }

  /**
   * Apply the set of enhancers requested by the orchestrator UI (if any).
   * The orchestrator exposes an array of enhancer names on
   * `window.__SIGNALTREE_ACTIVE_ENHANCERS` before invoking SignalTree
   * benchmarks so the service can apply the exact same set programmatically.
   */
  private applyConfiguredEnhancers(tree: any, defaults?: any[]): any {
    try {
      const requested = window.__SIGNALTREE_ACTIVE_ENHANCERS__ as
        | string[]
        | undefined;
      const memoMode = this.getRuntimeMemoMode();

      const enhancers: any[] = [];
      if (requested && Array.isArray(requested) && requested.length > 0) {
        for (const name of requested) {
          switch (name) {
            case 'batching':
              enhancers.push(batching());
              break;
            case 'highPerformanceBatching':
              enhancers.push(highPerformanceBatching());
              break;
            case 'lightweightMemoization':
              enhancers.push(lightweightMemoization());
              break;
            case 'shallowMemoization':
              enhancers.push(shallowMemoization());
              break;
            case 'memoization':
              enhancers.push(memoization());
              break;
            case 'computedMemoization':
              enhancers.push(computedMemoization());
              break;
            case 'selectorMemoization':
              enhancers.push(selectorMemoization());
              break;
            case 'serialization':
              enhancers.push(serialization());
              break;
            case 'timeTravel':
              enhancers.push(timeTravel());
              break;
            case 'enterprise':
              // Apply the enterprise enhancer for second-pass enterprise runs
              enhancers.push(enterprise());
              break;
            default:
              // Unknown enhancer name — ignore to maintain robustness
              break;
          }
        }
      }

      // Auto-add memoization based on runtime memo mode if none explicitly requested
      // Prefer using enhancer metadata (ENHANCER_META) when available rather than
      // relying on function name heuristics. This is more robust across builds.
      const hasMemo = enhancers.some((e: any) => {
        try {
          const meta = (e as any)[ENHANCER_META] || (e as any).metadata;
          if (meta && Array.isArray(meta.provides)) {
            return meta.provides.some((p: string) =>
              String(p).toLowerCase().includes('memo')
            );
          }
          const name = meta?.name || (e && e.name) || '';
          return String(name).toLowerCase().includes('memo');
        } catch {
          return false;
        }
      });
      if (!hasMemo && memoMode !== 'off') {
        switch (memoMode) {
          case 'light':
            enhancers.push(lightweightMemoization());
            break;
          case 'shallow':
            enhancers.push(shallowMemoization());
            break;
          case 'full':
            enhancers.push(memoization());
            break;
        }
      }

      if (enhancers.length > 0) {
        // Use the resolver to ensure enhancers are applied in dependency order
        try {
          const ordered = resolveEnhancerOrder(enhancers as any);
          // record applied enhancer names for diagnostics and export
          try {
            (window as any).__SIGNALTREE_ACTIVE_ENHANCERS__ = ordered.map(
              (en: any) =>
                (en &&
                  (en.metadata?.name || (en as any)[ENHANCER_META]?.name)) ||
                'unknown'
            );
          } catch {}

          let t = tree;
          for (const e of ordered) {
            t = t.with(e);
          }
          return t;
        } catch {
          // Fallback to original order on error
          let t = tree;
          for (const e of enhancers) {
            t = t.with(e);
          }
          try {
            (window as any).__SIGNALTREE_ACTIVE_ENHANCERS__ = enhancers.map(
              (en: any) =>
                (en &&
                  (en.metadata?.name || (en as any)[ENHANCER_META]?.name)) ||
                'unknown'
            );
          } catch {}
          return t;
        }
      }

      // No requested enhancers — apply scenario defaults if provided
      if (defaults && Array.isArray(defaults) && defaults.length > 0) {
        let t = tree;
        for (const e of defaults) {
          t = t.with(e);
        }
        return t;
      }
    } catch {
      // ignore errors and return tree unchanged
    }
    return tree;
  }

  async runDeepNestedBenchmark(
    dataSize: number,
    depth = 15
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    // ARCHITECTURAL ADVANTAGE: Surgical updates without parent rebuilding
    // Use case: Complex forms, nested configuration objects, tree-like data
    const base = signalTree(createNested(depth));
    const tree = this.applyConfiguredEnhancers(base, [
      batching(),
      shallowMemoization(), // Optimal for nested object structures
    ]);

    // Match NgXs cap of 1000 iterations for fair comparison
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED);
      i++
    ) {
      let current: any = tree.state;
      for (let j = 0; j < depth; j++) {
        if (!current?.level) break;
        current = current.level;
      }
      // At leaf, value is a signal accessor function; call setter via .set
      if (current?.value && typeof current.value.set === 'function') {
        current.value.set(i);
      } else if (typeof current?.value === 'function') {
        // Fallback in case of different signal shape
        current.value(i);
      }
      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree deep nested updates');
  }

  async runArrayBenchmark(dataSize: number): Promise<number | BenchmarkResult> {
    const start = performance.now();

    // ARCHITECTURAL SHOWCASE: Direct mutation vs immutable rebuilding
    // SignalTree: O(1) targeted updates | NgRx: O(n) array reconstruction
    // Use case: Real-time dashboards, live data grids, gaming score boards
    const base = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    });
    const defaultEnhancers: any[] = [highPerformanceBatching()];
    // Add lazy array coalescing for very large datasets
    if (dataSize > 5000) {
      defaultEnhancers.push(withLazyArrays({ enabled: true, maxOps: 2048 }));
    }
    const tree = this.applyConfiguredEnhancers(base, defaultEnhancers); // Batching (+ lazy arrays when large)

    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    );
    for (let i = 0; i < updates; i++) {
      const idx = i % dataSize;
      // Use update method to properly modify the items array signal
      tree.state.items.update((items: any[]) => {
        items[idx].value = Math.random() * 1000;
        return items;
      });
      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree array updates');
  }

  async runComputedBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    // SHOWCASING SIGNALTREE: Use computed-optimized memoization preset
    // This preset is publicly available - users can import and use:
    // import { computedMemoization } from '@signaltree/core';
    // const tree = signalTree(state).with(computedMemoization());
    const base: any = signalTree({
      value: 0,
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
    });
    const tree: any = this.applyConfiguredEnhancers(base, [
      // Align with scenario definition: requires batching + shallow memoization
      batching(),
      shallowMemoization(),
    ]); // Scenario-aligned enhancer set

    // FIX: Use Angular's computed() for proper memoization like NgRx SignalStore
    const compute = computed(() => {
      const v = tree.state.value();
      let acc = 0;
      for (const f of tree.state.factors())
        acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });

    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
      i++
    ) {
      tree.state.value.set(i);
      compute(); // Now this is properly memoized!
      if ((i & 1023) === 0) {
        // REMOVED: yielding during measurement for accuracy
        // REMOVED: yielding during measurement for accuracy
      }
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree computed chains');
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    const base = signalTree({
      items: Array.from({ length: batchSize }, (_, i) => i),
    });
    const tree = this.applyConfiguredEnhancers(base, [
      highPerformanceBatching(),
    ]);

    for (let b = 0; b < batches; b++) {
      (tree.state as any)['items'].update((arr: any[]) => {
        for (let i = 0; i < batchSize; i++) {
          arr[i] = (arr[i] + 1) | 0;
        }
        return arr;
      });
      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree batch updates');
  }

  async runSelectorBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    // SHOWCASING SIGNALTREE: Use selector-optimized memoization preset
    // This preset is publicly available - users can import and use:
    // import { selectorMemoization } from '@signaltree/core';
    // const tree = signalTree(state).with(selectorMemoization());
    const base: any = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
        value: Math.random() * 100,
        metadata: { category: i % 5, priority: i % 3 },
      })),
    });
    const tree: any = this.applyConfiguredEnhancers(base, [
      // Align with scenario definition: selector-memoization requires lightweight memoization
      lightweightMemoization(),
    ]); // Scenario-aligned enhancer set

    // Use Angular's computed() for proper memoization - works with SignalTree's signals
    // SignalTree's memoization enhancer optimizes the underlying signal access
    const selectEven = computed(
      () => tree.state.items().filter((x: any) => x.flag).length
    );

    // Test multiple selectors to stress memoization
    const selectHighValue = computed(
      () => tree.state.items().filter((x: any) => x.value > 50).length
    );

    const selectByCategory = computed(() => {
      const items = tree.state.items();
      return items.reduce((acc: Record<number, number>, item: any) => {
        const cat = item.metadata.category;
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
    });

    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      selectEven(); // Memoized - returns cached result if no changes
      selectHighValue(); // Test cache hit rate with multiple selectors
      selectByCategory(); // More complex computation

      // Occasionally update to test cache invalidation (same frequency as NgRx)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR) === 0) {
        tree.state.items.update((items: any[]) => {
          const idx = i % items.length;
          items[idx].flag = !items[idx].flag;
          return items;
        });
      }
    }

    const duration = performance.now() - start;
    return this.toResult(
      duration,
      undefined,
      'SignalTree selector memoization'
    );
  }

  async runSerializationBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    // ARCHITECTURAL TRADE-OFF: SignalTree's signal unwrapping creates serialization overhead
    // This is the cost of fine-grained reactivity vs immutable snapshots
    // Consider: How often does your app serialize state vs perform updates?
    const base = signalTree({
      users: Array.from(
        {
          length: Math.max(
            BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.USER_SIMULATION.MIN,
            Math.min(
              BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.USER_SIMULATION.MAX,
              dataSize
            )
          ),
        },
        (_, i) => ({
          id: i,
          name: `User ${i}`,
          roles: i % 5 === 0 ? ['admin', 'user'] : ['user'],
          active: i % 3 === 0,
          meta: { createdAt: new Date(2020, 0, 1 + (i % 28)) },
        })
      ),
      settings: {
        theme: 'dark',
        flags: {
          a: true,
          b: false,
          c: iota(8).reduce(
            (o, j) => ({ ...o, [j]: j % 2 === 0 }),
            {} as Record<number, boolean>
          ),
        },
      },
    });
    const tree = this.applyConfiguredEnhancers(base, [
      memoization(),
      highPerformanceBatching(),
      serialization({ preserveTypes: false, includeMetadata: false }),
    ]);

    // Helper to avoid ts errors
    function iota(n: number) {
      return Array.from({ length: n }, (_, i) => i);
    }

    // Mutate a little so shape stabilizes
    for (let i = 0; i < 10; i++) {
      (tree.state as any)['users'].update((arr: any[]) => {
        const idx = i % arr.length;
        (arr[idx] as any).active = !(arr[idx] as any).active;
        return arr;
      });
    }

    // Measure snapshot (unwrap) + stringify separately for fairness
    const t0 = performance.now();
    const snapshot = tree.snapshot();
    JSON.stringify({ data: snapshot.data });
    const duration = performance.now() - t0;
    return this.toResult(duration, undefined, 'SignalTree serialization');
  }

  async runMemoryEfficiencyBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    // NOTE: Memory measurements are unreliable across browsers and affected by GC timing.
    // This benchmark focuses on operational performance rather than heap measurements.
    const itemsCount = Math.max(
      BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MIN,
      Math.min(BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MAX, dataSize)
    );
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    // SignalTree's memory trade-off: more wrappers, but efficient targeted updates
    const base = signalTree({
      groups: Array.from({ length: groups }, (_, g) => ({
        id: g,
        items: Array.from(
          { length: Math.floor(itemsCount / groups) },
          (_, i) => ({
            id: g * 1_000_000 + i,
            score: (i * 13) % 997,
            tags: i % 7 === 0 ? ['hot', 'new'] : ['cold'],
          })
        ),
      })),
    });
    const tree = this.applyConfiguredEnhancers(base, [
      lightweightMemoization(),
      batching(),
    ]); // Minimal overhead for memory tests

    const start = performance.now();

    // Demonstrate SignalTree's efficiency: targeted updates without full rebuilds
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const g = t % groups;
      // Update the entire groups array to modify nested items
      tree.state.groups.update((groupsArray: any[]) => {
        // Clone the array to maintain immutability
        const newGroups = [...groupsArray];
        const group = newGroups[g];
        if (group && group.items) {
          // Clone the group and its items array
          newGroups[g] = {
            ...group,
            items: group.items.map((item: any, index: number) => {
              const idx = t % group.items.length;
              if (index === idx) {
                return {
                  ...item,
                  score: (item.score + 1) | 0,
                  tags:
                    (t & 63) === 0
                      ? item.tags.includes('hot')
                        ? ['cold']
                        : ['hot']
                      : item.tags,
                };
              }
              return item;
            }),
          };
        }
        return newGroups;
      });
      // REMOVED: yielding during measurement for accuracy
    }

    // Return operational time (memory measurement would be unreliable across environments)
    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree memory efficiency');
  }

  async runDataFetchingBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    // Simulate fetching data and hydrating state
    const mockApiData = Array.from(
      {
        length: Math.min(
          dataSize,
          BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.USER_SIMULATION.MAX
        ),
      },
      (_, i) => ({
        id: i,
        title: `Item ${i}`,
        description: `Description for item ${i}`,
        tags: [`tag${i % 10}`, `category${i % 5}`],
        meta: {
          createdAt: new Date(2023, 0, 1 + (i % 365)),
          updatedAt: new Date(2023, 6, 1 + (i % 180)),
          views: Math.floor(Math.random() * 1000),
          rating: Math.random() * 5,
        },
        relations: {
          authorId: Math.floor(i / 10),
          parentId: i > 0 ? i - 1 : null,
          childIds: i < dataSize - 1 ? [i + 1] : [],
        },
      })
    );

    const base = signalTree({
      items: [] as any[],
      metadata: { total: 0, loaded: false, lastFetch: null as Date | null },
      filters: { search: '', category: '', tags: [] as string[] },
      pagination: { page: 1, size: 50, total: 0 },
    });
    const tree = this.applyConfiguredEnhancers(base, [
      batching(),
      shallowMemoization(),
    ]); // Good for stable fetched data

    // Simulate API response parsing and state hydration
    tree.state.metadata.loaded.set(false);
    tree.state.items.set(mockApiData);
    tree.state.metadata.total.set(mockApiData.length);
    tree.state.metadata.lastFetch.set(new Date());
    tree.state.metadata.loaded.set(true);

    // Simulate filtering operations (common after data fetch)
    for (
      let i = 0;
      i < Math.min(BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES, dataSize / 10);
      i++
    ) {
      tree.state.filters.search.set(`search${i}`);
      tree.state.filters.category.set(`cat${i % 5}`);

      // Trigger computed-like operations
      const filteredItems = tree.state
        .items()
        .filter(
          (item: any) =>
            item.title.includes(tree.state.filters.search()) ||
            item.tags.includes(tree.state.filters.category())
        );

      // Update pagination based on filtered results
      tree.state.pagination.total.set(filteredItems.length);

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree data fetching');
  }

  async runRealTimeUpdatesBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    // Simulate real-time dashboard or live data scenario
    // Use lightweight memoization for constantly changing real-time data
    const base = signalTree({
      liveMetrics: {
        activeUsers: 0,
        totalSessions: 0,
        pageViews: 0,
        serverLoad: 0.0,
        responseTime: 0,
      },
      recentEvents: [] as any[],
      notifications: [] as any[],
      alerts: [] as any[],
    });
    const rtEnhancers: any[] = [
      highPerformanceBatching(),
      lightweightMemoization(),
    ];
    if (dataSize > 5000) {
      rtEnhancers.push(withLazyArrays({ enabled: true, maxOps: 1024 }));
    }
    const tree = this.applyConfiguredEnhancers(base, rtEnhancers);

    // Simulate real-time updates (like WebSocket messages)
    const updateFrequency = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.REAL_TIME_UPDATES,
      dataSize
    );
    for (let i = 0; i < updateFrequency; i++) {
      // Live metrics updates
      tree.state.liveMetrics.activeUsers.update(
        (x: number) => x + Math.floor(Math.random() * 10 - 5)
      );
      tree.state.liveMetrics.pageViews.update(
        (x: number) => x + Math.floor(Math.random() * 20)
      );
      tree.state.liveMetrics.serverLoad.set(Math.random());
      tree.state.liveMetrics.responseTime.set(50 + Math.random() * 200);

      // Add new events (with size limit)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DATA_FETCHING) === 0) {
        tree.state.recentEvents.update((events: any[]) => [
          ...events.slice(-99), // Keep last 100 events
          {
            id: i,
            type: 'user_action',
            timestamp: Date.now(),
            data: `event${i}`,
          },
        ]);
      }

      // Add notifications occasionally
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.REAL_TIME_UPDATES) === 0) {
        tree.state.notifications.update((notifs: any[]) => [
          ...notifs.slice(-9), // Keep last 10 notifications
          {
            id: i,
            message: `Notification ${i}`,
            priority: 'normal',
            timestamp: Date.now(),
          },
        ]);
      }

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree real-time updates');
  }

  async runStateSizeScalingBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();

    // Test how well each library handles increasing state size
    const largeDataSet = Array.from(
      {
        length: Math.min(
          dataSize *
            BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.LARGE_DATASET.MULTIPLIER,
          BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.LARGE_DATASET.MAX
        ),
      },
      (_, i) => ({
        id: i,
        name: `Entity ${i}`,
        properties: Array.from({ length: 20 }, (_, j) => ({
          key: `prop_${j}`,
          value: `value_${i}_${j}`,
          metadata: { type: 'string', indexed: j % 3 === 0 },
        })),
        relations: Array.from({ length: Math.min(5, i) }, (_, k) => ({
          targetId: i - k - 1,
          type: 'reference',
        })),
      })
    );

    const base = signalTree({
      entities: largeDataSet,
      indices: {} as Record<string, number[]>,
      cache: {} as Record<string, any>,
      stats: { size: 0, lastUpdate: null as Date | null },
    });
    const scalingEnhancers: any[] = [lightweightMemoization(), batching()];
    if (largeDataSet.length > 20000) {
      scalingEnhancers.push(withLazyArrays({ enabled: true }));
    }
    const tree = this.applyConfiguredEnhancers(base, scalingEnhancers); // Lightweight (+ lazy arrays on huge sets)

    // Perform operations that test scaling
    tree.state.stats.size.set(largeDataSet.length);
    tree.state.stats.lastUpdate.set(new Date());

    // Build indices (simulate common large-scale operations)
    const operations = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.STATE_SIZE_SCALING,
      dataSize / 5
    );
    for (let i = 0; i < operations; i++) {
      const entityId = i % largeDataSet.length;

      // Update entity
      tree.state.entities.update((entities: any[]) => {
        const entity = entities[entityId];
        if (entity) {
          entity.properties[0].value = `updated_${Date.now()}`;
        }
        return entities;
      });

      // Update cache/index occasionally
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.REAL_TIME_UPDATES) === 0) {
        (tree.state.cache as any).update((cache: any) => ({
          ...cache,
          [`cache_${i}`]: { computed: Math.random(), timestamp: Date.now() },
        }));
      }

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree state size scaling');
  }

  // ================================
  // ASYNC OPERATIONS BENCHMARKS
  // ================================

  async runAsyncWorkflowBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    // Use a high-performance batching enhancer to aggressively coalesce updates
    interface AsyncState {
      items: any[];
      loading: boolean;
      error: string | null;
    }

    const base = signalTree<AsyncState>({
      items: [] as any[],
      loading: false,
      error: null as string | null,
    });
    const tree = this.applyConfiguredEnhancers(base, [
      highPerformanceBatching(),
    ]);

    // Simulate async loading function that returns a small chunk per op
    const fetchChunk = async (chunkSize: number) => {
      await new Promise((r) =>
        setTimeout(r, BENCHMARK_CONSTANTS.TIMING.ASYNC_DELAY_MS)
      ); // simulated async delay
      return Array.from({ length: chunkSize }, (_, i) => ({ id: i, value: i }));
    };

    const start = performance.now();

    // Number of operations (limit to configured iterations)
    const ops = Math.min(
      Math.max(1, Math.floor(dataSize / 10)),
      BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW
    );

    // Chunking and concurrency (tuned defaults)
    // Cap concurrency to a small number but not larger than ops
    const concurrencyCap = Math.min(8, Math.max(1, ops));
    // Heuristic chunk size: spread data across a modest number of chunks
    const chunkSize = Math.max(1, Math.floor(dataSize / Math.max(ops, 10)));

    // Preallocate items buffer once to avoid repeated allocations
    const itemsBuffer: any[] = new Array(dataSize);
    // Keep an index pointer for where to apply next chunk (modulo for overwrite)
    let applyIndex = 0;

    // Helper: p-limit like runner implemented by async package utilities is available,
    // but we use a simple chunked Promise.all loop here for clarity.
    async function runInBatches<T>(
      items: T[],
      worker: (it: T) => Promise<void>
    ) {
      let i = 0;
      while (i < items.length) {
        const chunk = items.slice(i, i + concurrencyCap);
        await Promise.all(chunk.map((it) => worker(it)));
        i += concurrencyCap;
      }
    }

    // Single loading toggle
    tree.state.loading.set(true);
    tree.state.error.set(null);

    // Worker fetches a small chunk and writes into the preallocated buffer in-place
    const worker = async () => {
      try {
        const chunk = await fetchChunk(Math.min(chunkSize, dataSize));
        // Prefer using benchmark async preallocator helper when available
        const preallocator = (tree as unknown as Record<string, unknown>)[
          'preallocateArray'
        ] as
          | undefined
          | ((
              path: string,
              size: number
            ) => {
              update: (i: number, v: unknown) => void;
              commit: () => void;
            });

        if (preallocator) {
          const allocator = preallocator('items', itemsBuffer.length);
          for (let i = 0; i < chunk.length; i++) {
            const dest = (applyIndex + i) % itemsBuffer.length;
            allocator.update(dest, chunk[i]);
          }
          allocator.commit();
          applyIndex = (applyIndex + chunk.length) % itemsBuffer.length;
        } else if ((tree as any).batch) {
          // Apply chunk in a single batched update; write into itemsBuffer in-place
          (tree as any).batch(() => {
            for (let i = 0; i < chunk.length; i++) {
              const dest = (applyIndex + i) % itemsBuffer.length;
              itemsBuffer[dest] = chunk[i];
            }
            // Single set of the backing array reference after in-place writes
            (tree.state as any).items.set(itemsBuffer);
            applyIndex = (applyIndex + chunk.length) % itemsBuffer.length;
          });
        } else {
          // Fallback: replace slice region (less optimal)
          const startIdx = applyIndex;
          for (let i = 0; i < chunk.length; i++) {
            const dest = (startIdx + i) % itemsBuffer.length;
            itemsBuffer[dest] = chunk[i];
          }
          (tree.state as any).items.set(itemsBuffer.slice());
          applyIndex = (applyIndex + chunk.length) % itemsBuffer.length;
        }
      } catch (e) {
        tree.state.error.set((e as Error)?.message ?? String(e));
      }
    };

    const placeholders = Array.from({ length: ops }, (_, i) => i);

    await runInBatches(placeholders, worker);

    tree.state.loading.set(false);

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree async workflow');
  }

  async runConcurrentAsyncBenchmark(
    concurrency: number
  ): Promise<number | BenchmarkResult> {
    const tree = signalTree({
      results: [] as any[],
      activeOperations: 0,
    });

    const asyncOperation = async (id: number) => {
      tree.state.activeOperations.update((count) => count + 1);

      await new Promise((r) =>
        setTimeout(
          r,
          Math.random() * BENCHMARK_CONSTANTS.TIMING.RANDOM_DELAY_MAX_MS
        )
      ); // Random delay

      const result = { id, value: Math.random() };
      tree.state.results.update((results) => [...results, result]);
      tree.state.activeOperations.update((count) => count - 1);
    };

    const start = performance.now();

    // Run concurrent async operations
    const promises = Array.from({ length: concurrency }, (_, i) =>
      asyncOperation(i)
    );
    await Promise.all(promises);

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree concurrent async');
  }

  async runAsyncCancellationBenchmark(
    operations: number
  ): Promise<number | BenchmarkResult> {
    const tree = signalTree({
      activeRequest: null as AbortController | null,
      result: null as { id: number; data: string } | null,
      cancelled: 0,
    });

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      // Cancel previous request if exists
      const activeRequest = tree.state.activeRequest();
      if (activeRequest) {
        activeRequest.abort();
        tree.state.cancelled.update((count) => count + 1);
      }

      // Start new request
      const controller = new AbortController();
      tree.state.activeRequest.set(controller);

      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            if (!controller.signal.aborted) {
              tree.state.result.set({ id: i, data: 'completed' });
              resolve(null);
            }
          }, 5);

          controller.signal.addEventListener('abort', () => {
            clearTimeout(timeout);
            reject(new Error('Cancelled'));
          });
        });
      } catch {
        // Request was cancelled
      }

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree async cancellation');
  }

  // ================================
  // TIME TRAVEL BENCHMARKS
  // ================================

  async runUndoRedoBenchmark(
    operations: number
  ): Promise<number | BenchmarkResult> {
    // Use actual SignalTree time-travel enhancer
    const base = signalTree({
      counter: 0,
      data: { value: 'initial' },
    });
    const tree = this.applyConfiguredEnhancers(base, [timeTravel()]);

    const start = performance.now();

    // Make changes
    for (let i = 0; i < operations; i++) {
      tree.state.counter.set(i);
      tree.state.data({ value: `step_${i}` });
    }

    // Undo half
    for (let i = 0; i < operations / 2; i++) {
      (tree as any).undo?.();
    }

    // Redo quarter
    for (let i = 0; i < operations / 4; i++) {
      (tree as any).redo?.();
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree undo/redo');
  }

  async runHistorySizeBenchmark(
    historySize: number
  ): Promise<number | BenchmarkResult> {
    const base = signalTree({
      value: 0,
      data: { content: 'initial' },
    });
    const tree = this.applyConfiguredEnhancers(base, [
      timeTravel({ maxHistorySize: historySize }),
    ]);

    const start = performance.now();

    // Make changes to build history
    for (let i = 0; i < historySize; i++) {
      tree.state.value.set(i);
      tree.state.data({ content: `step_${i}` });

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree history size');
  }

  async runJumpToStateBenchmark(
    operations: number
  ): Promise<number | BenchmarkResult> {
    const base = signalTree({
      currentState: 0,
      data: { value: 'initial' },
    });
    const tree = this.applyConfiguredEnhancers(base, [timeTravel()]);

    const start = performance.now();

    // Build history first
    for (let i = 0; i < operations; i++) {
      tree.state.currentState.set(i);
      tree.state.data({ value: `state_${i}` });
    }

    // Now test jumping to random historical states
    for (let i = 0; i < operations; i++) {
      const randomStep = Math.floor(Math.random() * operations);
      (tree as any).jumpToStep?.(randomStep);

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree jump-to-state');
  }

  // ================================
  // MIDDLEWARE BENCHMARKS
  // ================================

  async runSingleMiddlewareBenchmark(
    operations: number
  ): Promise<number | BenchmarkResult> {
    // Note: This would use SignalTree middleware package when available
    // For now, simulate middleware overhead
    const tree = signalTree({
      value: 0,
      middlewareLog: [] as string[],
    });

    const middleware = (action: string, value: any) => {
      // Lightweight middleware operation
      tree.state.middlewareLog.update((log) => [
        ...log.slice(-100),
        `${action}:${value}`,
      ]);
    };

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      middleware('setValue', i);
      tree.state.value.set(i);

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree single middleware');
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number | BenchmarkResult> {
    const tree = signalTree({
      value: 0,
      logs: Array.from({ length: middlewareCount }, () => [] as string[]),
    });

    const middlewares = Array.from(
      { length: middlewareCount },
      (_, index) => (action: string, value: any) => {
        tree.state.logs()[index].push(`MW${index}:${action}:${value}`);
      }
    );

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      // Run through all middleware
      middlewares.forEach((mw) => mw('setValue', i));
      tree.state.value.set(i);

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(duration, undefined, 'SignalTree multiple middleware');
  }

  async runConditionalMiddlewareBenchmark(
    operations: number
  ): Promise<number | BenchmarkResult> {
    const tree = signalTree({
      value: 0,
      conditionalLog: [] as string[],
      condition: true,
    });

    const conditionalMiddleware = (action: string, value: any) => {
      if (tree.state.condition()) {
        tree.state.conditionalLog.update((log) => [
          ...log.slice(-50),
          `${action}:${value}`,
        ]);
      }
    };

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      // Toggle condition periodically
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DATA_FETCHING) === 0) {
        tree.state.condition.set(!tree.state.condition());
      }

      conditionalMiddleware('setValue', i);
      tree.state.value.set(i);

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(
      duration,
      undefined,
      'SignalTree conditional middleware'
    );
  }

  // ================================
  // FULL STACK BENCHMARKS
  // ================================

  async runAllFeaturesEnabledBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    // Combine all SignalTree features with proper typing
    const base = signalTree({
      data: [] as Array<{ id: number; value: number }>,
      loading: false,
      history: [] as Array<{ action: string; id: number }>,
      middlewareLog: [] as string[],
    });
    const tree = this.applyConfiguredEnhancers(base, [
      memoization(),
      batching(),
      serialization(),
    ]);

    const start = performance.now();

    // Mixed workload: async, sync updates, history, middleware simulation
    const iterations = Math.min(
      dataSize / 100,
      BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW
    ); // Scale with dataSize but cap at 50
    for (let i = 0; i < iterations; i++) {
      // Simulate async load
      (tree.state as any).loading.set(true);
      await new Promise((r) =>
        setTimeout(r, BENCHMARK_CONSTANTS.TIMING.TIMEOUT_DELAY_MS)
      );

      // Update data
      (tree.state as any).data.update((data: any[]) => [
        ...data,
        { id: i, value: Math.random() },
      ]);
      (tree.state as any).loading.set(false);

      // History tracking
      (tree.state as any).history.update((h: any[]) => [
        ...h.slice(-20),
        { action: 'update', id: i },
      ]);

      // Middleware simulation
      (tree.state as any).middlewareLog.update((log: string[]) => [
        ...log.slice(-30),
        `action_${i}`,
      ]);

      // REMOVED: yielding during measurement for accuracy
    }

    const duration = performance.now() - start;
    return this.toResult(
      duration,
      undefined,
      'SignalTree all features enabled'
    );
  }

  // ==========================================
  // ENHANCED BENCHMARK METHODS
  // ==========================================

  /**
   * Enhanced array benchmark with statistical analysis
   */
  async runEnhancedArrayBenchmark(
    dataSize: number
  ): Promise<EnhancedBenchmarkResult> {
    const options: EnhancedBenchmarkOptions = {
      operations: Math.min(
        BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
        dataSize
      ),
      warmup: 10,
      measurementSamples: 30,
      yieldEvery: BENCHMARK_CONSTANTS.YIELD_FREQUENCY.ARRAY_UPDATES,
      trackMemory: true,
      removeOutliers: true,
      forceGC: true,
      label: 'SignalTree Array Updates',
      minDurationMs: 100,
    };

    const base = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    });
    const tree = this.applyConfiguredEnhancers(base, [
      highPerformanceBatching(),
    ]);

    return runEnhancedBenchmark(async (iteration) => {
      const idx = iteration % dataSize;
      tree.state.items.update((items: any[]) => {
        const newItems = [...items];
        newItems[idx] = { ...newItems[idx], value: Math.random() * 1000 };
        return newItems;
      });
    }, options);
  }

  /**
   * Enhanced selector benchmark with memoization analysis
   */
  async runEnhancedSelectorBenchmark(
    dataSize: number
  ): Promise<EnhancedBenchmarkResult> {
    const base = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    });
    const tree = this.applyConfiguredEnhancers(base, [
      lightweightMemoization(),
    ]);

    // Create computed selector matching NgRx pattern
    const selectEven = computed(
      () => tree.state.items().filter((x: any) => x.flag).length
    );

    const options: EnhancedBenchmarkOptions = {
      operations: 1000,
      warmup: 5,
      measurementSamples: 50,
      yieldEvery: 64,
      trackMemory: false,
      removeOutliers: true,
      label: 'SignalTree Selector (Memoized)',
      minDurationMs: 50,
    };

    return runEnhancedBenchmark(async () => {
      // This should hit memoization cache most of the time
      selectEven();
    }, options);
  }

  /**
   * Enhanced deep nested benchmark with proper signal traversal
   */
  async runEnhancedDeepNestedBenchmark(
    dataSize: number,
    depth = 15
  ): Promise<EnhancedBenchmarkResult> {
    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    const base = signalTree(createNested(depth));
    const tree = this.applyConfiguredEnhancers(base, [
      batching(),
      shallowMemoization(),
    ]);

    const options: EnhancedBenchmarkOptions = {
      operations: Math.min(dataSize, 1000),
      warmup: 5,
      measurementSamples: 20,
      yieldEvery: 1024,
      trackMemory: true,
      removeOutliers: true,
      forceGC: true,
      label: 'SignalTree Deep Nested Updates',
      minDurationMs: 100,
    };

    return runEnhancedBenchmark(async (iteration) => {
      // Use proper deep update method - access via bracket notation for signal tree
      (tree as any)['update']((state: any) => {
        const updateDeep = (obj: any, lvl: number): any =>
          lvl === 0
            ? { ...obj, value: iteration }
            : { ...obj, level: updateDeep(obj.level ?? {}, lvl - 1) };
        return updateDeep(state, depth - 1);
      });
    }, options);
  }

  // ==========================================
  // PURE BENCHMARK METHODS (NO YIELDING)
  // ==========================================

  /**
   * Pure array benchmark - NO yielding during measurement for maximum accuracy
   */
  async runPureArrayBenchmark(dataSize: number): Promise<number> {
    // Setup before measurement
    const base = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    });
    const tree = this.applyConfiguredEnhancers(base, [
      highPerformanceBatching(),
    ]);

    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    );

    // Pure measurement - NO yielding
    const start = performance.now();

    for (let i = 0; i < updates; i++) {
      const idx = i % dataSize;
      tree.state.items.update((items: any[]) => {
        const newItems = [...items];
        newItems[idx] = { ...newItems[idx], value: Math.random() * 1000 };
        return newItems;
      });
      // NO YIELDING during measurement
    }

    return performance.now() - start;
  }

  /**
   * Pure selector benchmark - NO yielding during measurement
   */
  async runPureSelectorBenchmark(dataSize: number): Promise<number> {
    // Setup before measurement
    const base = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    });
    const tree = this.applyConfiguredEnhancers(base, [
      lightweightMemoization(),
    ]);

    const selectEven = computed(
      () => tree.state.items().filter((x: any) => x.flag).length
    );

    // Pure measurement - NO yielding
    const start = performance.now();

    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      selectEven(); // Should hit memoization cache
      // NO YIELDING during measurement
    }

    return performance.now() - start;
  }

  /**
   * Pure deep nested benchmark - NO yielding during measurement
   */
  async runPureDeepNestedBenchmark(
    dataSize: number,
    depth = 15
  ): Promise<number> {
    // Setup before measurement
    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    const base = signalTree(createNested(depth));
    const tree = this.applyConfiguredEnhancers(base, [
      batching(),
      shallowMemoization(),
    ]);

    const operations = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED
    );

    // Pure measurement - NO yielding
    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      (tree as any)['update']((state: any) => {
        const updateDeep = (obj: any, lvl: number): any =>
          lvl === 0
            ? { ...obj, value: i }
            : { ...obj, level: updateDeep(obj.level ?? {}, lvl - 1) };
        return updateDeep(state, depth - 1);
      });
      // NO YIELDING during measurement
    }

    return performance.now() - start;
  }

  /**
   * Run benchmark suite with hybrid approach - UI responsiveness between benchmarks only
   */
  async runPureBenchmarkSuite(dataSize: number): Promise<{
    arrayBenchmark: number;
    selectorBenchmark: number;
    deepNestedBenchmark: number;
    totalTime: number;
  }> {
    const suiteStart = performance.now();

    // Update UI before each benchmark
    await this.yieldBetweenBenchmarks();
    const arrayResult = await this.runPureArrayBenchmark(dataSize);

    await this.yieldBetweenBenchmarks();
    const selectorResult = await this.runPureSelectorBenchmark(dataSize);

    await this.yieldBetweenBenchmarks();
    const deepNestedResult = await this.runPureDeepNestedBenchmark(dataSize);

    const totalTime = performance.now() - suiteStart;

    return {
      arrayBenchmark: arrayResult,
      selectorBenchmark: selectorResult,
      deepNestedBenchmark: deepNestedResult,
      totalTime,
    };
  }

  /**
   * Performance environment validation
   */
  async validateBenchmarkEnvironment(): Promise<{
    isReady: boolean;
    issues: string[];
    recommendations: string[];
    performanceMetrics: {
      isThrottled: boolean;
      opsPerMs: number;
    };
  }> {
    const envCheck = await PerformanceEnvironment.validateEnvironment();
    const throttleCheck =
      await PerformanceEnvironment.detectPerformanceThrottling();

    return {
      ...envCheck,
      performanceMetrics: {
        isThrottled: throttleCheck.isThrottled,
        opsPerMs: throttleCheck.opsPerMs,
      },
    };
  }

  /**
   * Compare SignalTree results with another library using statistical analysis
   */
  static compareWithLibrary(
    signalTreeResult: EnhancedBenchmarkResult,
    otherLibraryResult: EnhancedBenchmarkResult,
    otherLibraryName: string
  ) {
    return BenchmarkComparison.compareBenchmarks(
      signalTreeResult,
      'SignalTree',
      otherLibraryResult,
      otherLibraryName,
      0.95 // 95% confidence level
    );
  }

  /**
   * Run comprehensive benchmark suite with enhanced analysis
   */
  async runComprehensiveBenchmarkSuite(dataSize: number): Promise<{
    arrayBenchmark: EnhancedBenchmarkResult;
    selectorBenchmark: EnhancedBenchmarkResult;
    deepNestedBenchmark: EnhancedBenchmarkResult;
    environment: {
      isReady: boolean;
      issues: string[];
      recommendations: string[];
      performanceMetrics: {
        isThrottled: boolean;
        opsPerMs: number;
      };
    };
    summary: {
      overallReliability: 'high' | 'medium' | 'low';
      totalSamples: number;
      totalRuntime: number;
      recommendations: string[];
    };
  }> {
    const start = performance.now();

    // 1) Environment
    const environment = await this.validateBenchmarkEnvironment();

    // 2) Run the enhanced benchmarks sequentially
    const arrayBenchmark = await this.runEnhancedArrayBenchmark(dataSize);
    const selectorBenchmark = await this.runEnhancedSelectorBenchmark(dataSize);
    const deepNestedBenchmark = await this.runEnhancedDeepNestedBenchmark(
      dataSize
    );

    const totalRuntime = performance.now() - start;

    // 3) Summarize
    const sampleCount =
      (arrayBenchmark.sampleCount ?? arrayBenchmark.samples?.length ?? 0) +
      (selectorBenchmark.sampleCount ??
        selectorBenchmark.samples?.length ??
        0) +
      (deepNestedBenchmark.sampleCount ??
        deepNestedBenchmark.samples?.length ??
        0);

    const reliabilities = [
      arrayBenchmark.reliability,
      selectorBenchmark.reliability,
      deepNestedBenchmark.reliability,
    ];

    let overallReliability: 'high' | 'medium' | 'low' = 'medium';
    if (reliabilities.every((r) => r === 'high')) overallReliability = 'high';
    else if (reliabilities.some((r) => r === 'low')) overallReliability = 'low';

    const recommendations: string[] = [];
    if (!environment.isReady)
      recommendations.push(...environment.recommendations);

    return {
      arrayBenchmark,
      selectorBenchmark,
      deepNestedBenchmark,
      environment,
      summary: {
        overallReliability,
        totalSamples: sampleCount,
        totalRuntime,
        recommendations,
      },
    };
  }
  /**
   * Example: How to use enhanced benchmarks for performance analysis
   */
  async demonstrateEnhancedBenchmarking(dataSize = 1000): Promise<void> {
    // 1. Validate environment
    const envCheck = await this.validateBenchmarkEnvironment();

    if (!envCheck.isReady) {
      // Environment not ready - skipping enhanced benchmarking
    }

    const arrayResult = await this.runEnhancedArrayBenchmark(dataSize);
    const selectorResult = await this.runEnhancedSelectorBenchmark(dataSize);
    void SignalTreeBenchmarkService.compareWithLibrary(
      arrayResult,
      selectorResult,
      'Selector Benchmark'
    );
  }

  async runSubscriberScalingBenchmark(
    subscriberCount: number
  ): Promise<number> {
    const start = performance.now();

    // Create a signal tree with a simple counter state
    const base = signalTree({
      counter: 0,
      data: { value: 'initial' },
    });
    const tree = this.applyConfiguredEnhancers(base, [batching()]); // Use batching for efficient updates

    // Create multiple computed subscribers that depend on the counter
    const subscribers: any[] = [];
    for (let i = 0; i < subscriberCount; i++) {
      // Each subscriber computes something based on the counter
      const subscriber = computed(() => {
        const counter = tree.state.counter();
        // Simulate different computation patterns
        return counter * (i + 1) + Math.sin(counter * 0.1);
      });
      subscribers.push(subscriber);
    }

    // Perform updates and measure fanout performance
    const updates = Math.min(
      1000,
      BENCHMARK_CONSTANTS.ITERATIONS.SUBSCRIBER_SCALING || 1000
    );
    for (let i = 0; i < updates; i++) {
      // Update the counter
      tree.state.counter.set(i);

      // Force all subscribers to recompute (simulate reading their values)
      for (const subscriber of subscribers) {
        subscriber();
      }

      // REMOVED: yielding during measurement for accuracy
    }

    return performance.now() - start;
  }

  /**
   * Measure cold-start / initialization time for SignalTree with a common
   * enhancer set and a few selectors wired up. Returns milliseconds.
   */
  async runColdStartBenchmark(): Promise<BenchmarkResult> {
    return {
      durationMs: -1,
      memoryDeltaMB: undefined,
      notes: 'Disabled in demo orchestrator',
    } as BenchmarkResult;
  }
}
