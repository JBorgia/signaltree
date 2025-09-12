import { computed, Injectable } from '@angular/core';
import {
  withBatching,
  withHighPerformanceBatching,
} from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';
import { withSerialization } from '@signaltree/serialization';

// Consider importing performance preset for consistency
// import { createPresetConfig } from '@signaltree/presets';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class SignalTreeBenchmarkService {
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };
  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
    const start = performance.now();

    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    const tree = signalTree(createNested(depth)).with(
      withBatching(),
      withMemoization()
    );

    for (let i = 0; i < dataSize; i++) {
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

    const tree = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    }).with(withHighPerformanceBatching());

    const updates = Math.min(1000, dataSize);
    for (let i = 0; i < updates; i++) {
      (tree.state as any)['items'].update((items: any[]) => {
        items[i % items.length].value = Math.random() * 1000;
        return items;
      });
      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const tree = signalTree({
      value: 0,
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
    }).with(withBatching(), withMemoization());

    // FIX: Use Angular's computed() for proper memoization like NgRx SignalStore
    const compute = computed(() => {
      const v = tree.state.value();
      let acc = 0;
      for (const f of tree.state.factors())
        acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });

    for (let i = 0; i < dataSize; i++) {
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

    const tree = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    }).with(withMemoization());

    // FIX: Use Angular's computed() for proper memoization like NgRx SignalStore
    const selectEven = computed(
      () => tree.state.items().filter((x) => x.flag).length
    );

    for (let i = 0; i < 1000; i++) {
      selectEven(); // Now this is properly memoized!
      if ((i & 63) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    // Build a moderately nested, mixed structure to serialize
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
    const t1 = performance.now();
    JSON.stringify({ data: snapshot.data });
    const t2 = performance.now();

    // Log split timings for investigation
    console.debug(
      '[SignalTree][serialization] snapshot(ms)=',
      (t1 - t0).toFixed(2),
      ' stringify(ms)=',
      (t2 - t1).toFixed(2)
    );

    return t2 - t0;
  }

  async runConcurrentUpdatesBenchmark(
    concurrency = 50,
    updatesPerWorker = 200
  ): Promise<number> {
    // Simulate concurrent writers updating disjoint segments
    const tree = signalTree({
      counters: Array.from({ length: concurrency }, () => ({ value: 0 })),
    }).with(withHighPerformanceBatching(), withMemoization());

    const start = performance.now();

    const workers = Array.from({ length: concurrency }, (_, idx) =>
      (async () => {
        // Stagger start to interleave across microtasks
        await new Promise((r) => setTimeout(r, idx % 4));
        for (let u = 0; u < updatesPerWorker; u++) {
          const target = idx;
          (tree.state as any)['counters'].update((arr: any[]) => {
            // mutate in place for performance
            arr[target].value = (arr[target].value + 1) | 0;
            return arr;
          });
          if ((u & 31) === 0) await this.yieldToUI();
        }
      })()
    );

    await Promise.all(workers);
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    // Build a sizable hierarchical tree; perform limited churn and log memory deltas
    const itemsCount = Math.max(1_000, Math.min(50_000, dataSize));
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    const beforeMem =
      (performance as typeof SignalTreeBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;

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
    }).with(withMemoization(), withBatching());

    const start = performance.now();

    // Touch ~1% of items across groups
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const g = t % groups;
      (tree.state as any)['groups'][g]['items'].update((arr: any[]) => {
        const idx = t % arr.length;
        const it = arr[idx];
        it.score = (it.score + 1) | 0;
        if ((t & 63) === 0)
          it.tags = it.tags.includes('hot') ? ['cold'] : ['hot'];
        return arr;
      });
      if ((t & 63) === 0) await this.yieldToUI();
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof SignalTreeBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[SignalTree][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    return duration;
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
    }).with(withBatching(), withMemoization());

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
    }).with(withHighPerformanceBatching(), withMemoization());

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
    }).with(withMemoization(), withBatching());

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
}
