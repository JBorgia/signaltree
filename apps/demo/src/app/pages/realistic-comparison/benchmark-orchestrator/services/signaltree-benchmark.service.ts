import { computed, Injectable } from '@angular/core';
import { withBatching, withHighPerformanceBatching } from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withLightweightMemoization, withMemoization, withShallowMemoization } from '@signaltree/memoization';
import { withSerialization } from '@signaltree/serialization';
import { withTimeTravel } from '@signaltree/time-travel';

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
 * - Trade-offs: Higher memory overhead, slower serialization
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
// import { createPresetConfig } from '@signaltree/presets';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class SignalTreeBenchmarkService {
  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
    const start = performance.now();

    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    // ARCHITECTURAL ADVANTAGE: Surgical updates without parent rebuilding
    // Use case: Complex forms, nested configuration objects, tree-like data
    const tree = signalTree(createNested(depth)).with(
      withBatching(),
      withShallowMemoization() // Optimal for nested object structures
    );

    // Match NgXs cap of 1000 iterations for fair comparison
    for (let i = 0; i < Math.min(dataSize, 1000); i++) {
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
      if ((i & 1023) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // ARCHITECTURAL SHOWCASE: Direct mutation vs immutable rebuilding
    // SignalTree: O(1) targeted updates | NgRx: O(n) array reconstruction
    // Use case: Real-time dashboards, live data grids, gaming score boards
    const tree = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    }).with(withHighPerformanceBatching()); // Only batching, no memoization needed

    const updates = Math.min(1000, dataSize);
    for (let i = 0; i < updates; i++) {
      const idx = i % dataSize;
      // Use update method to properly modify the items array signal
      tree.state.items.update((items) => {
        items[idx].value = Math.random() * 1000;
        return items;
      });
      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Use shallow memoization for simple object structure
    const tree = signalTree({
      value: 0,
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
    }).with(withBatching(), withShallowMemoization());

    // FIX: Use Angular's computed() for proper memoization like NgRx SignalStore
    const compute = computed(() => {
      const v = tree.state.value();
      let acc = 0;
      for (const f of tree.state.factors())
        acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });

    for (let i = 0; i < Math.min(dataSize, 500); i++) {
      tree.state.value.set(i);
      compute(); // Now this is properly memoized!
      if ((i & 1023) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
  ): Promise<number> {
    const start = performance.now();

    const tree = signalTree({
      items: Array.from({ length: batchSize }, (_, i) => i),
    }).with(withHighPerformanceBatching());

    for (let b = 0; b < batches; b++) {
      (tree.state as any)['items'].update((arr: any[]) => {
        for (let i = 0; i < batchSize; i++) {
          arr[i] = (arr[i] + 1) | 0;
        }
        return arr;
      });
      if ((b & 7) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Test with lightweight memoization for performance-critical selectors
    const tree = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
        value: Math.random() * 100,
        metadata: { category: i % 5, priority: i % 3 },
      })),
    }).with(withLightweightMemoization()); // Use new lightweight memoization

    // FIX: Use Angular's computed() for proper memoization like NgRx SignalStore
    const selectEven = computed(
      () => tree.state.items().filter((x) => x.flag).length
    );

    // Test multiple selectors to stress memoization
    const selectHighValue = computed(
      () => tree.state.items().filter((x) => x.value > 50).length
    );

    const selectByCategory = computed(() => {
      const items = tree.state.items();
      return items.reduce((acc, item) => {
        const cat = item.metadata.category;
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
    });

    for (let i = 0; i < 1000; i++) {
      selectEven(); // Now this is properly memoized!
      selectHighValue(); // Test cache hit rate
      selectByCategory(); // More complex computation

      // Occasionally update to test cache invalidation
      if (i % 100 === 0) {
        tree.state.items.update((items) => {
          const idx = i % items.length;
          items[idx].flag = !items[idx].flag;
          return items;
        });
      }

      if ((i & 63) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    // ARCHITECTURAL TRADE-OFF: SignalTree's signal unwrapping creates serialization overhead
    // This is the cost of fine-grained reactivity vs immutable snapshots
    // Consider: How often does your app serialize state vs perform updates?
    const tree = signalTree({
      users: Array.from(
        { length: Math.max(100, Math.min(1000, dataSize)) },
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
    }).with(
      withMemoization(),
      withHighPerformanceBatching(),
      withSerialization({ preserveTypes: false, includeMetadata: false })
    );

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

    // Measure snapshot (unwrap) separately from stringify for fairness
    const t0 = performance.now();
    const snapshot = tree.snapshot();
    JSON.stringify({ data: snapshot.data });
    const t2 = performance.now();

    return t2 - t0;
  }

  async runConcurrentUpdatesBenchmark(
    concurrency = 50,
    updatesPerWorker = 200
  ): Promise<number> {
    // Remove memoization overhead for rapid unique updates - just use basic batching
    const tree = signalTree({
      counters: Array.from({ length: concurrency }, () => ({ value: 0 })),
    }).with(withBatching()); // Remove withMemoization() - it hurts performance here

    const start = performance.now();

    // Match other libraries' pattern: interleaved updates across workers in sequence
    for (let u = 0; u < updatesPerWorker; u++) {
      for (let w = 0; w < concurrency; w++) {
        const target = w;
        tree.state.counters.update((counters) => {
          // Use immutable update to avoid potential issues with object mutation
          return counters.map((counter, index) =>
            index === target
              ? { ...counter, value: (counter.value + 1) | 0 }
              : counter
          );
        });
      }
      if ((u & 31) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    // NOTE: Memory measurements are unreliable across browsers and affected by GC timing.
    // This benchmark focuses on operational performance rather than heap measurements.
    const itemsCount = Math.max(1_000, Math.min(50_000, dataSize));
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    // SignalTree's memory trade-off: more wrappers, but efficient targeted updates
    const tree = signalTree({
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
    }).with(withLightweightMemoization(), withBatching()); // Minimal overhead for memory tests

    const start = performance.now();

    // Demonstrate SignalTree's efficiency: targeted updates without full rebuilds
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const g = t % groups;
      // Update the entire groups array to modify nested items
      tree.state.groups.update((groupsArray) => {
        // Clone the array to maintain immutability
        const newGroups = [...groupsArray];
        const group = newGroups[g];
        if (group && group.items) {
          // Clone the group and its items array
          newGroups[g] = {
            ...group,
            items: group.items.map((item, index) => {
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
      if ((t & 63) === 0) await this.yieldToUI();
    }

    // Return operational time (memory measurement would be unreliable across environments)
    return performance.now() - start;
  }

  async runDataFetchingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate fetching data and hydrating state
    const mockApiData = Array.from(
      { length: Math.min(dataSize, 1000) },
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

    const tree = signalTree({
      items: [] as any[],
      metadata: { total: 0, loaded: false, lastFetch: null as Date | null },
      filters: { search: '', category: '', tags: [] as string[] },
      pagination: { page: 1, size: 50, total: 0 },
    }).with(withBatching(), withShallowMemoization()); // Good for stable fetched data

    // Simulate API response parsing and state hydration
    tree.state.metadata.loaded.set(false);
    tree.state.items.set(mockApiData);
    tree.state.metadata.total.set(mockApiData.length);
    tree.state.metadata.lastFetch.set(new Date());
    tree.state.metadata.loaded.set(true);

    // Simulate filtering operations (common after data fetch)
    for (let i = 0; i < Math.min(100, dataSize / 10); i++) {
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

      if ((i & 15) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runRealTimeUpdatesBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate real-time dashboard or live data scenario
    // Use lightweight memoization for constantly changing real-time data
    const tree = signalTree({
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
    }).with(withHighPerformanceBatching(), withLightweightMemoization());

    // Simulate real-time updates (like WebSocket messages)
    const updateFrequency = Math.min(500, dataSize);
    for (let i = 0; i < updateFrequency; i++) {
      // Live metrics updates
      tree.state.liveMetrics.activeUsers.update(
        (x) => x + Math.floor(Math.random() * 10 - 5)
      );
      tree.state.liveMetrics.pageViews.update(
        (x) => x + Math.floor(Math.random() * 20)
      );
      tree.state.liveMetrics.serverLoad.set(Math.random());
      tree.state.liveMetrics.responseTime.set(50 + Math.random() * 200);

      // Add new events (with size limit)
      if (i % 10 === 0) {
        tree.state.recentEvents.update((events) => [
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
      if (i % 25 === 0) {
        tree.state.notifications.update((notifs) => [
          ...notifs.slice(-9), // Keep last 10 notifications
          {
            id: i,
            message: `Notification ${i}`,
            priority: 'normal',
            timestamp: Date.now(),
          },
        ]);
      }

      if ((i & 31) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runStateSizeScalingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Test how well each library handles increasing state size
    const largeDataSet = Array.from(
      { length: Math.min(dataSize * 10, 10000) },
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

    const tree = signalTree({
      entities: largeDataSet,
      indices: {} as Record<string, number[]>,
      cache: {} as Record<string, any>,
      stats: { size: 0, lastUpdate: null as Date | null },
    }).with(withLightweightMemoization(), withBatching()); // Lightweight for scaling tests

    // Perform operations that test scaling
    tree.state.stats.size.set(largeDataSet.length);
    tree.state.stats.lastUpdate.set(new Date());

    // Build indices (simulate common large-scale operations)
    const operations = Math.min(200, dataSize / 5);
    for (let i = 0; i < operations; i++) {
      const entityId = i % largeDataSet.length;

      // Update entity
      tree.state.entities.update((entities) => {
        const entity = entities[entityId];
        if (entity) {
          entity.properties[0].value = `updated_${Date.now()}`;
        }
        return entities;
      });

      // Update cache/index occasionally
      if (i % 20 === 0) {
        (tree.state.cache as any).update((cache: any) => ({
          ...cache,
          [`cache_${i}`]: { computed: Math.random(), timestamp: Date.now() },
        }));
      }

      if ((i & 31) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  // ================================
  // ASYNC OPERATIONS BENCHMARKS
  // ================================

  async runAsyncWorkflowBenchmark(dataSize: number): Promise<number> {
    const tree = signalTree({
      items: [] as any[],
      loading: false,
      error: null as string | null,
    });

    // Simulate async loading function
    const fetchItems = async () => {
      await new Promise((r) => setTimeout(r, 10)); // 10ms async delay
      return Array.from({ length: dataSize }, (_, i) => ({ id: i, value: i }));
    };

    const start = performance.now();

    // Run multiple async operations with loading state management
    for (let i = 0; i < 100; i++) {
      tree.state.loading.set(true);
      tree.state.error.set(null);

      try {
        const items = await fetchItems();
        tree.state.items.set(items);
      } catch (error) {
        tree.state.error.set(error as string);
      } finally {
        tree.state.loading.set(false);
      }

      if ((i & 15) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runConcurrentAsyncBenchmark(concurrency: number): Promise<number> {
    const tree = signalTree({
      results: [] as any[],
      activeOperations: 0,
    });

    const asyncOperation = async (id: number) => {
      tree.state.activeOperations.update((count) => count + 1);

      await new Promise((r) => setTimeout(r, Math.random() * 20)); // Random delay

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

    return performance.now() - start;
  }

  async runAsyncCancellationBenchmark(operations: number): Promise<number> {
    const tree = signalTree({
      activeRequest: null as AbortController | null,
      result: null as any,
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

      if ((i & 15) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  // ================================
  // TIME TRAVEL BENCHMARKS
  // ================================

  async runUndoRedoBenchmark(operations: number): Promise<number> {
    // Use actual SignalTree time-travel enhancer
    const tree = signalTree({
      counter: 0,
      data: { value: 'initial' },
    }).with(withTimeTravel());

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

    return performance.now() - start;
  }

  async runHistorySizeBenchmark(historySize: number): Promise<number> {
    const tree = signalTree({
      value: 0,
      data: { content: 'initial' },
    }).with(withTimeTravel({ maxHistorySize: historySize }));

    const start = performance.now();

    // Make changes to build history
    for (let i = 0; i < historySize; i++) {
      tree.state.value.set(i);
      tree.state.data({ content: `step_${i}` });

      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runJumpToStateBenchmark(operations: number): Promise<number> {
    const tree = signalTree({
      currentState: 0,
      data: { value: 'initial' },
    }).with(withTimeTravel());

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

      if ((i & 31) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  // ================================
  // MIDDLEWARE BENCHMARKS
  // ================================

  async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
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

      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number> {
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

      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runConditionalMiddlewareBenchmark(operations: number): Promise<number> {
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
      if (i % 10 === 0) {
        tree.state.condition.set(!tree.state.condition());
      }

      conditionalMiddleware('setValue', i);
      tree.state.value.set(i);

      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  // ================================
  // FULL STACK BENCHMARKS
  // ================================

  async runAllFeaturesEnabledBenchmark(dataSize: number): Promise<number> {
    // Combine all SignalTree features with proper typing
    const tree = signalTree({
      data: [] as Array<{ id: number; value: number }>,
      loading: false,
      history: [] as Array<{ action: string; id: number }>,
      middlewareLog: [] as string[],
    }).with(withMemoization(), withBatching(), withSerialization());

    const start = performance.now();

    // Mixed workload: async, sync updates, history, middleware simulation
    const iterations = Math.min(dataSize / 100, 50); // Scale with dataSize but cap at 50
    for (let i = 0; i < iterations; i++) {
      // Simulate async load
      (tree.state as any).loading.set(true);
      await new Promise((r) => setTimeout(r, 5));

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

      if ((i & 7) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runProductionSetupBenchmark(dataSize: number): Promise<number> {
    // Realistic production configuration with proper typing
    const tree = signalTree({
      entities: {} as Record<
        string,
        { id: number; data: string; timestamp: number }
      >,
      ui: {
        loading: false,
        errors: [] as string[],
        notifications: [] as Array<{
          id: number;
          message: string;
          type: string;
        }>,
      },
      cache: {} as Record<string, { result: number; computed: number }>,
      metadata: {
        lastUpdated: Date.now(),
        version: 1,
      },
    }).with(
      withShallowMemoization(), // Balanced performance
      withHighPerformanceBatching(), // Production batching
      withSerialization()
    );

    const start = performance.now();

    // Realistic workload
    for (let i = 0; i < dataSize / 10; i++) {
      // Entity updates
      (tree.state as any).entities.update((entities: any) => ({
        ...entities,
        [`entity_${i}`]: { id: i, data: `data_${i}`, timestamp: Date.now() },
      }));

      // UI state updates
      if (i % 20 === 0) {
        (tree.state as any).ui.notifications.update((n: any[]) => [
          ...n.slice(-5),
          { id: i, message: `Update ${i}`, type: 'info' },
        ]);
      }

      // Cache updates
      if (i % 10 === 0) {
        (tree.state as any).cache.update((cache: any) => ({
          ...cache,
          [`cache_${i}`]: { result: Math.random(), computed: Date.now() },
        }));
      }

      // Metadata
      (tree.state as any).metadata.lastUpdated.set(Date.now());
      (tree.state as any).metadata.version.update((v: number) => v + 1);

      if ((i & 31) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }
}
