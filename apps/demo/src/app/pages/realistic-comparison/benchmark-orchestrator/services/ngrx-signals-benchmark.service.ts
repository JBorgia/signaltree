import { computed, Injectable } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { createYieldToUI } from '../shared/benchmark-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class NgRxSignalsBenchmarkService {
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };

  private yieldToUI = createYieldToUI();

  // --- Middleware Benchmarks (NgRx Signals - withHooks simulation) ---
  async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
    const start = performance.now();
    const hook = (ctx: string, payload?: unknown) => {
      void ctx;
      void payload;
      let acc = 0;
      for (let i = 0; i < 10; i++) acc += i;
      return acc > -1;
    };

    for (let i = 0; i < operations; i++) hook('noop', i);
    return performance.now() - start;
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number> {
    const start = performance.now();
    const hooks = Array.from(
      { length: middlewareCount },
      () => (ctx: string, payload?: unknown) => {
        void ctx;
        void payload;
        let s = 0;
        for (let i = 0; i < 20; i++) s += i;
        return s > -1;
      }
    );

    for (let i = 0; i < operations; i++) hooks.forEach((h) => h('noop', i));
    return performance.now() - start;
  }

  async runConditionalMiddlewareBenchmark(operations: number): Promise<number> {
    const start = performance.now();
    const conditional = (ctx: string, payload?: unknown) => {
      void ctx;
      if ((payload as number) % 2 === 0) return true;
      let s = 0;
      for (let i = 0; i < 30; i++) s += i;
      return s > -1;
    };

    for (let i = 0; i < operations; i++) conditional('noop', i);
    return performance.now() - start;
  }

  // --- Async Workflows (lightweight simulations) ---
  async runAsyncWorkflowBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();
    const ops = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW
    );
    const promises: Promise<void>[] = [];
    for (let i = 0; i < ops; i++) {
      promises.push(new Promise((r) => setTimeout(r, 0)));
    }
    await Promise.all(promises);
    return performance.now() - start;
  }

  async runConcurrentAsyncBenchmark(concurrency: number): Promise<number> {
    const start = performance.now();
    const groups = Array.from(
      { length: concurrency },
      () => new Promise((r) => setTimeout(r, 0))
    );
    await Promise.all(groups);
    return performance.now() - start;
  }

  async runAsyncCancellationBenchmark(operations: number): Promise<number> {
    const start = performance.now();
    const timers: number[] = [];
    for (let i = 0; i < operations; i++) {
      timers.push(setTimeout(() => void 0, 10) as unknown as number);
    }
    // cancel half
    for (let i = 0; i < Math.floor(operations / 2); i++) {
      clearTimeout(timers[i]);
    }
    await new Promise((r) => setTimeout(r, 10));
    return performance.now() - start;
  }

  async runDeepNestedBenchmark(
    dataSize: number,
    depth = BENCHMARK_CONSTANTS.DATA_GENERATION.NESTED_DEPTH
  ): Promise<number> {
    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    const state = signalState(createNested(depth));

    // Access deep to ensure signals are wired
    const deepAccess = computed(() => {
      let cur: any = state();
      for (let i = 0; i < depth; i++) cur = cur.level;
      return cur?.value;
    });
    // warm read
    deepAccess();

    const start = performance.now();
    // Match NgXs cap of 1000 iterations for fair comparison
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED);
      i++
    ) {
      // immutably patch deep path
      patchState(state, (s: any) => {
        const updateDeep = (obj: any, lvl: number): any =>
          lvl === 0
            ? { ...obj, value: i }
            : { ...obj, level: updateDeep(obj.level ?? {}, lvl - 1) };
        return updateDeep(s, depth - 1);
      });
    }
    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    const state = signalState({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    });

    const start = performance.now();
    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    );
    for (let i = 0; i < updates; i++) {
      const idx = i % dataSize;
      patchState(state, (s) => ({
        ...s,
        items: s.items.map((item, j) =>
          j === idx ? { ...item, value: Math.random() * 1000 } : item
        ),
      }));
    }
    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const state = signalState({
      value: 0,
      factors: Array.from(
        { length: BENCHMARK_CONSTANTS.DATA_GENERATION.FACTOR_COUNT },
        (_, i) => i + 1
      ),
    });

    const compute = computed(() => {
      const v = state().value;
      let acc = 0;
      for (const f of state().factors) acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });
    // warm
    compute();

    const start = performance.now();
    // Match NgXs cap of 500 iterations for fair comparison
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
      i++
    ) {
      patchState(state, (s) => ({ ...s, value: i }));
      compute();
    }
    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES,
    batchSize = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_SIZE
  ): Promise<number> {
    const state = signalState({
      items: Array.from({ length: batchSize }, (_, i) => i),
    });
    const start = performance.now();
    for (let b = 0; b < batches; b++) {
      patchState(state, (s) => ({
        ...s,
        items: s.items.map((v) => (v + 1) | 0),
      }));
    }
    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    const state = signalState({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    });
    const selectEven = computed(
      () => state().items.filter((x) => x.flag).length
    );

    const start = performance.now();
    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      selectEven();
    }
    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    const state = signalState({
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
        flags: Object.fromEntries(
          Array.from({ length: 8 }, (_, j) => [j, j % 2 === 0])
        ) as Record<number, boolean>,
      },
    });

    // small churn to stabilize shape
    for (let i = 0; i < 10; i++) {
      const idx = i % state().users.length;
      patchState(state, (s) => ({
        ...s,
        users: s.users.map((u, j) =>
          j === idx ? { ...u, active: !u.active } : u
        ),
      }));
    }

    const t0 = performance.now();
    // Read current store state and stringify (matches other POJO stores)
    const plain = state();
    const t1 = performance.now();
    JSON.stringify({ data: plain });
    const t2 = performance.now();
    console.debug(
      '[NgRxSignals][serialization] toPlain(ms)=',
      (t1 - t0).toFixed(2),
      ' stringify(ms)=',
      (t2 - t1).toFixed(2)
    );
    return t2 - t0;
  }

  async runConcurrentUpdatesBenchmark(
    concurrency = BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW,
    updatesPerWorker = 200
  ): Promise<number> {
    const state = signalState({
      counters: Array.from({ length: concurrency }, () => ({ value: 0 })),
    });
    const start = performance.now();

    for (let u = 0; u < updatesPerWorker; u++) {
      for (let w = 0; w < concurrency; w++) {
        const target = w;
        patchState(state, (s) => ({
          ...s,
          counters: s.counters.map((c, i) =>
            i === target ? { value: (c.value + 1) | 0 } : c
          ),
        }));
      }
    }

    // consume
    if (state().counters[0].value === -1) console.log('noop');
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    const itemsCount = Math.max(
      BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MIN,
      Math.min(BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MAX, dataSize)
    );
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    const beforeMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;

    const state = signalState({
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

    const start = performance.now();
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const g = t % groups;
      const idx = t % state().groups[g].items.length;
      patchState(state, (s) => ({
        ...s,
        groups: s.groups.map((grp, gi) =>
          gi !== g
            ? grp
            : {
                ...grp,
                items: grp.items.map((it, ii) =>
                  ii !== idx
                    ? it
                    : {
                        ...it,
                        score: (it.score + 1) | 0,
                        tags:
                          (t &
                            BENCHMARK_CONSTANTS.YIELD_FREQUENCY
                              .MEMORY_EFFICIENCY) ===
                          0
                            ? it.tags.includes('hot')
                              ? ['cold']
                              : ['hot']
                            : it.tags,
                      }
                ),
              }
        ),
      }));
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRxSignals][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }
    return duration;
  }

  async runDataFetchingBenchmark(): Promise<number> {
    // Simulate data fetching with NgRx SignalStore
    const state = signalState({
      users: [] as Array<{
        id: number;
        name: string;
        email: string;
        isActive: boolean;
        department: string;
        lastLogin: string;
      }>,
      filteredUsers: [] as Array<{
        id: number;
        name: string;
        email: string;
        isActive: boolean;
        department: string;
        lastLogin: string;
      }>,
      departmentGroups: {} as Record<
        string,
        Array<{
          id: number;
          name: string;
          email: string;
          isActive: boolean;
          department: string;
          lastLogin: string;
        }>
      >,
    });

    const beforeMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    const start = performance.now();

    // Simulate fetching 1000 user records from API
    const users = Array.from(
      { length: BENCHMARK_CONSTANTS.ITERATIONS.DATA_FETCHING },
      (_, i) => ({
        id: i + 1,
        name: `User ${i + 1}`,
        email: `user${i + 1}@example.com`,
        isActive: Math.random() > 0.3,
        department: `Dept ${Math.floor(Math.random() * 10) + 1}`,
        lastLogin: new Date().toISOString(),
      })
    );

    // Update state with users
    patchState(state, { users });

    // Simulate filtering active users (realistic business logic)
    const activeUsers = users.filter((user) => user.isActive);
    patchState(state, { filteredUsers: activeUsers });

    // Simulate additional processing - group by department
    const departmentGroups = activeUsers.reduce((acc, user) => {
      if (!acc[user.department]) {
        acc[user.department] = [];
      }
      acc[user.department].push(user);
      return acc;
    }, {} as Record<string, typeof users>);

    // Update state with grouped data
    patchState(state, { departmentGroups });

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRxSignals][DataFetching][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    // consume to avoid DCE
    if (state.users().length === -1) console.log('noop');
    return duration;
  }

  async runRealTimeUpdatesBenchmark(): Promise<number> {
    // Simulate real-time updates with NgRx SignalStore
    const state = signalState({
      metrics: {
        activeUsers: 0,
        messagesPerSecond: 0,
        systemLoad: 0.0,
      },
      messages: [] as Array<{
        id: number;
        content: string;
        timestamp: number;
        priority: 'high' | 'normal';
      }>,
    });

    const beforeMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    const start = performance.now();

    // Simulate 500 real-time metric updates
    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.REAL_TIME_UPDATES; i++) {
      const metrics = {
        activeUsers: Math.floor(Math.random() * 1000) + 100,
        messagesPerSecond: Math.floor(Math.random() * 50) + 10,
        systemLoad: Math.random() * 0.8 + 0.1,
      };

      patchState(state, { metrics });

      // Simulate incoming messages (like chat or notifications)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DATA_FETCHING) === 0) {
        const newMessage = {
          id: i,
          content: `Real-time message ${i}`,
          timestamp: Date.now(),
          priority:
            Math.random() > 0.7 ? ('high' as const) : ('normal' as const),
        };
        patchState(state, (currentState) => ({
          messages: [...currentState.messages, newMessage],
        }));
      }

      // Yield occasionally to simulate real-time processing
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRxSignals][RealTimeUpdates][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    // consume to avoid DCE
    if (state.metrics().activeUsers === -1) console.log('noop');
    return duration;
  }

  async runStateSizeScalingBenchmark(): Promise<number> {
    // Test performance with large state size (10,000 items)
    const state = signalState({
      largeDataset: [] as Array<{
        id: number;
        title: string;
        description: string;
        category: string;
        status: 'active' | 'inactive';
        metadata: {
          createdAt: string;
          tags: string[];
          score: number;
          lastModified?: string;
        };
      }>,
      activeItems: [] as Array<{
        id: number;
        title: string;
        description: string;
        category: string;
        status: 'active' | 'inactive';
        metadata: {
          createdAt: string;
          tags: string[];
          score: number;
          lastModified?: string;
        };
      }>,
      sortedItems: [] as Array<{
        id: number;
        title: string;
        description: string;
        category: string;
        status: 'active' | 'inactive';
        metadata: {
          createdAt: string;
          tags: string[];
          score: number;
          lastModified?: string;
        };
      }>,
    });

    const beforeMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    const start = performance.now();

    // Create large dataset (10,000 items)
    const largeDataset = Array.from(
      { length: BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.LARGE_DATASET.MAX },
      (_, i) => ({
        id: i + 1,
        title: `Item ${i + 1}`,
        description: `Description for item ${
          i + 1
        } with some additional text to make it realistic`,
        category: `Category ${Math.floor(i / 100) + 1}`,
        status:
          Math.random() > 0.5 ? ('active' as const) : ('inactive' as const),
        metadata: {
          createdAt: new Date().toISOString(),
          tags: [`tag${i % 10}`, `tag${i % 7}`, `tag${i % 5}`],
          score: Math.random() * 100,
        },
      })
    );

    // Hydrate the large dataset
    patchState(state, { largeDataset });

    // Perform operations that would be common with large datasets
    // 1. Filter by status
    const activeItems = largeDataset.filter((item) => item.status === 'active');
    patchState(state, { activeItems });

    // 2. Sort by score (expensive operation)
    const sortedItems = [...activeItems].sort(
      (a, b) => b.metadata.score - a.metadata.score
    );
    patchState(state, { sortedItems });

    // 3. Update multiple items (batch update simulation)
    for (
      let i = 0;
      i < BENCHMARK_CONSTANTS.ITERATIONS.STATE_SIZE_SCALING;
      i++
    ) {
      const randomIndex = Math.floor(Math.random() * largeDataset.length);
      patchState(state, (currentState) => ({
        largeDataset: currentState.largeDataset.map((item, index) =>
          index === randomIndex
            ? {
                ...item,
                metadata: {
                  ...item.metadata,
                  score: Math.random() * 100,
                  lastModified: new Date().toISOString(),
                },
              }
            : item
        ),
      }));
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxSignalsBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRxSignals][StateSizeScaling][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    // consume to avoid DCE
    if (state.largeDataset().length === -1) console.log('noop');
    return duration;
  }
}
