import { Injectable } from '@angular/core';
import { createAction, createReducer, createSelector, on, props } from '@ngrx/store';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { createYieldToUI } from '../shared/benchmark-utils';
import { EnhancedBenchmarkOptions, runEnhancedBenchmark } from './benchmark-runner';

// State interface for complex benchmarks
interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  department: string;
  lastLogin: string;
}

interface Message {
  id: number;
  content: string;
  timestamp: number;
  priority: 'high' | 'normal';
}

interface LargeDataItem {
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
}

interface NgRxState {
  groups: unknown[];
  posts: unknown[];
  users: User[];
  metrics?: {
    activeUsers: number;
    messagesPerSecond: number;
    systemLoad: number;
  };
  messages?: Message[];
  largeDataset?: LargeDataItem[];
  filteredUsers?: User[];
  departmentGroups?: Record<string, User[]>;
  activeItems?: LargeDataItem[];
  sortedItems?: LargeDataItem[];
}

// Actions for new benchmark scenarios
const setUsers = createAction(
  '[Benchmark] Set Users',
  props<{ payload: User[] }>()
);
const setFilteredUsers = createAction(
  '[Benchmark] Set Filtered Users',
  props<{ payload: User[] }>()
);
const setDepartmentGroups = createAction(
  '[Benchmark] Set Department Groups',
  props<{ payload: Record<string, User[]> }>()
);
const updateMetrics = createAction(
  '[Benchmark] Update Metrics',
  props<{
    payload: {
      activeUsers: number;
      messagesPerSecond: number;
      systemLoad: number;
    };
  }>()
);
const addMessage = createAction(
  '[Benchmark] Add Message',
  props<{ payload: Message }>()
);
const setLargeDataset = createAction(
  '[Benchmark] Set Large Dataset',
  props<{ payload: LargeDataItem[] }>()
);
const setActiveItems = createAction(
  '[Benchmark] Set Active Items',
  props<{ payload: LargeDataItem[] }>()
);
const setSortedItems = createAction(
  '[Benchmark] Set Sorted Items',
  props<{ payload: LargeDataItem[] }>()
);
const updateItem = createAction(
  '[Benchmark] Update Item',
  props<{ payload: { index: number; item: LargeDataItem } }>()
);

// Reducer for new benchmark scenarios
const benchmarkReducer = createReducer(
  { groups: [], posts: [], users: [] } as NgRxState,
  on(setUsers, (state, { payload }) => ({ ...state, users: payload })),
  on(setFilteredUsers, (state, { payload }) => ({
    ...state,
    filteredUsers: payload,
  })),
  on(setDepartmentGroups, (state, { payload }) => ({
    ...state,
    departmentGroups: payload,
  })),
  on(updateMetrics, (state, { payload }) => ({ ...state, metrics: payload })),
  on(addMessage, (state, { payload }) => ({
    ...state,
    messages: [...(state.messages || []), payload],
  })),
  on(setLargeDataset, (state, { payload }) => ({
    ...state,
    largeDataset: payload,
  })),
  on(setActiveItems, (state, { payload }) => ({
    ...state,
    activeItems: payload,
  })),
  on(setSortedItems, (state, { payload }) => ({
    ...state,
    sortedItems: payload,
  })),
  on(updateItem, (state, { payload }) => ({
    ...state,
    largeDataset: state.largeDataset?.map((item, index) =>
      index === payload.index ? payload.item : item
    ),
  }))
);

@Injectable({ providedIn: 'root' })
export class NgRxBenchmarkService {
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };

  private yieldToUI = createYieldToUI();

  // --- Middleware Benchmarks (simulated via wrapper functions / meta-reducer pattern) ---
  async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
    const options: EnhancedBenchmarkOptions = {
      operations,
      warmup: 5,
      measurementSamples: 30,
      yieldEvery: BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR,
      trackMemory: false,
      label: 'NgRx Single Middleware',
      minDurationMs: 50,
    };

    const result = await runEnhancedBenchmark(async () => {
      // lightweight middleware function simulated per operation
      let x = 0;
      for (let i = 0; i < 10; i++) x += i;
      // Use the result in a trivial way to avoid unused variable lint
      void x;
    }, options);

    return result.median;
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number> {
    const options: EnhancedBenchmarkOptions = {
      operations,
      warmup: 5,
      measurementSamples: 30,
      yieldEvery: BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR,
      trackMemory: false,
      label: `NgRx Multiple Middleware (count=${middlewareCount})`,
      minDurationMs: 50,
    };

    const result = await runEnhancedBenchmark(async () => {
      // Simulate middleware stack overhead per operation
      let total = 0;
      for (let m = 0; m < middlewareCount; m++) {
        let s = 0;
        for (let i = 0; i < 20; i++) s += i;
        total += s;
      }
      void total;
    }, options);

    return result.median;
  }

  async runConditionalMiddlewareBenchmark(operations: number): Promise<number> {
    const options: EnhancedBenchmarkOptions = {
      operations,
      warmup: 5,
      measurementSamples: 30,
      yieldEvery: BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR,
      trackMemory: false,
      label: 'NgRx Conditional Middleware',
      minDurationMs: 50,
    };

    const result = await runEnhancedBenchmark(async (i: number) => {
      if ((i as number) % 2 === 0) {
        // quick path - trivial
        return;
      }
      // slower path
      let s = 0;
      for (let k = 0; k < 30; k++) s += k;
      void s;
    }, options);

    return result.median;
  }

  // --- Async Workflows (Effects simulation) ---
  async runAsyncWorkflowBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate async operations with microtasks and small delays
    const promises: Promise<void>[] = [];
    const ops = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW
    );
    for (let i = 0; i < ops; i++) {
      promises.push(
        new Promise((res) => setTimeout(res, 0)) // yield to event loop
      );
    }

    await Promise.all(promises);

    return performance.now() - start;
  }

  async runAsyncCancellationBenchmark(operations: number): Promise<number> {
    const start = performance.now();

    // Simulate launching async tasks and cancelling half of them
    const tasks: Array<{
      cancelled: boolean;
      timer: ReturnType<typeof setTimeout> | null;
    }> = [];
    for (let i = 0; i < operations; i++) {
      const t = setTimeout(() => {
        /* noop */
      }, 10);
      tasks.push({ cancelled: false, timer: t });
    }

    // Cancel half
    for (let i = 0; i < Math.floor(operations / 2); i++) {
      const t = tasks[i];
      if (t.timer) {
        clearTimeout(t.timer);
        t.cancelled = true;
        t.timer = null;
      }
    }

    // Wait briefly to let non-cancelled run
    await new Promise((r) => setTimeout(r, 10));

    return performance.now() - start;
  }
  async runDeepNestedBenchmark(
    dataSize: number,
    depth = BENCHMARK_CONSTANTS.DATA_GENERATION.NESTED_DEPTH
  ): Promise<number> {
    console.log(
      `NgRx Deep Nested: Starting with dataSize=${dataSize}, depth=${depth}`
    );

    const start = performance.now();

    try {
      const updateValue = createAction(
        '[Test] Update',
        props<{ value: number }>()
      );

      type Nested = { value?: number; data?: string; level?: Nested };
      const createNested = (level: number): Nested =>
        level === 0
          ? { value: 0, data: 'test' }
          : { level: createNested(level - 1) };

      console.log(
        `NgRx Deep Nested: Creating initial state with depth ${depth}`
      );
      const initialState: Nested = createNested(depth);

      const updateDeep = (
        obj: Nested,
        level: number,
        value: number
      ): Nested => {
        if (level === 0) return { ...obj, value };
        return { ...obj, level: updateDeep(obj.level ?? {}, level - 1, value) };
      };

      const reducer = createReducer(
        initialState,
        on(updateValue, (state, { value }) =>
          updateDeep(state, depth - 1, value)
        )
      );

      let state = initialState;
      const iterations = Math.min(
        dataSize,
        BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED
      );
      console.log(`NgRx Deep Nested: Starting ${iterations} iterations`);

      // Use same iteration count and yielding pattern as SignalTree for fair comparison
      for (let i = 0; i < iterations; i++) {
        // REMOVED: Console logging during measurement for accuracy
        // if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR) === 0) {
        //   console.log(`NgRx Deep Nested: Iteration ${i}/${iterations}`);
        // }
        state = reducer(state, updateValue({ value: i }));
        // REMOVED: Yielding during measurement for accuracy
        // if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DEEP_NESTED) === 0) {
        //   // REMOVED: Yielding during measurement for accuracy
        // }
      }

      const duration = performance.now() - start;
      console.log(`NgRx Deep Nested: Completed in ${duration}ms`);
      return duration;
    } catch (error) {
      console.error('NgRx Deep Nested: Error occurred:', error);
      const duration = performance.now() - start;
      console.log(`NgRx Deep Nested: Failed after ${duration}ms`);
      throw error;
    }

    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const updateItem = createAction(
      '[Test] Update Item',
      props<{ index: number; value: number }>()
    );

    type Item = { id: number; value: number };
    type State = { items: Item[] };

    const initialState: State = {
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    };

    const reducer = createReducer(
      initialState,
      on(updateItem, (state, { index, value }) => ({
        ...state,
        items: state.items.map((item, i) =>
          i === index ? { ...item, value } : item
        ),
      }))
    );

    let state = initialState;
    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    );
    for (let i = 0; i < updates; i++) {
      state = reducer(
        state,
        updateItem({ index: i % dataSize, value: Math.random() * 1000 })
      );
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.ARRAY_UPDATES) === 0) {
        // REMOVED: Yielding during measurement for accuracy
      }
    }

    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const updateValue = createAction(
      '[Test] Update',
      props<{ value: number }>()
    );

    type State = { value: number; factors: number[] };
    const initialState: State = {
      value: 0,
      factors: Array.from(
        { length: BENCHMARK_CONSTANTS.DATA_GENERATION.FACTOR_COUNT },
        (_, i) => i + 1
      ),
    };

    const reducer = createReducer(
      initialState,
      on(updateValue, (state, { value }) => ({ ...state, value }))
    );

    let state = initialState;

    const compute = (s: State) => {
      let acc = 0;
      for (const f of s.factors) acc += Math.sin(s.value * f) * Math.cos(f);
      return acc;
    };

    // Match NgXs cap of 500 iterations for fair comparison
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
      i++
    ) {
      state = reducer(state, updateValue({ value: i }));
      compute(state);
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.COMPUTED) === 0) {
        // REMOVED: Yielding during measurement for accuracy
      }
    }

    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
  ): Promise<number> {
    const start = performance.now();

    // Single reducer call per batch to exercise batching capability
    const applyBatch = createAction(
      '[Test] Apply Batch',
      props<{ items: number[] }>()
    );

    type State = { items: number[] };
    const initialState: State = {
      items: Array.from({ length: batchSize }, (_, i) => i),
    };

    const reducer = createReducer(
      initialState,
      on(applyBatch, (state, { items }) => ({ ...state, items }))
    );

    let state = initialState;

    for (let b = 0; b < batches; b++) {
      // prepare next items in one pass
      const next = state.items.map((v) => (v + 1) | 0);
      state = reducer(state, applyBatch({ items: next }));
      // REMOVED: Yielding during measurement for accuracy
    }

    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    type Item = { id: number; flag: boolean };
    type State = { items: Item[] };

    const state: State = {
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    };

    // Memoized selectors similar to NgRx store usage
    const selectFeature = (s: State) => s;
    const selectItems = createSelector(selectFeature, (s: State) => s.items);
    const selectEvenCount = createSelector(
      selectItems,
      (items) => items.filter((x) => x.flag).length
    );

    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      // With no state changes, selector should return cached result after first call
      selectEvenCount(state);
      // REMOVED: Yielding during measurement for accuracy
    }

    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    // Plain POJO structure similar to SignalTree test
    const users = Array.from(
      { length: Math.max(100, Math.min(1000, dataSize)) },
      (_, i) => ({
        id: i,
        name: `User ${i}`,
        roles: i % 5 === 0 ? ['admin', 'user'] : ['user'],
        active: i % 3 === 0,
        meta: { createdAt: new Date(2020, 0, 1 + (i % 28)) },
      })
    );
    const state = {
      users,
      settings: {
        theme: 'dark',
        flags: Object.fromEntries(
          Array.from({ length: 8 }, (_, j) => [j, j % 2 === 0])
        ) as Record<number, boolean>,
      },
    };

    // Mutate shallowly a bit to simulate similar churn without changing shape
    for (let i = 0; i < 10; i++) {
      const idx = i % state.users.length;
      state.users[idx].active = !state.users[idx].active;
    }

    const t0 = performance.now();
    // NgRx state is already plain; align with ST snapshot + stringify path
    const plain = state;
    const t1 = performance.now();
    JSON.stringify({ data: plain });
    const t2 = performance.now();

    console.debug(
      '[NgRx][serialization] toPlain(ms)=',
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
    type Counter = { value: number };
    type State = { counters: Counter[] };

    const bump = createAction('[Test] Bump', props<{ index: number }>());

    const initialState: State = {
      counters: Array.from({ length: concurrency }, () => ({ value: 0 })),
    };

    const reducer = createReducer(
      initialState,
      on(bump, (state, { index }) => ({
        ...state,
        counters: state.counters.map((c, i) =>
          i === index ? { value: c.value + 1 } : c
        ),
      }))
    );

    let state = initialState;
    const start = performance.now();

    // Interleave updates across logical workers
    for (let u = 0; u < updatesPerWorker; u++) {
      for (let w = 0; w < concurrency; w++) {
        state = reducer(state, bump({ index: w }));
      }
      if ((u & 31) === 0) {
        // REMOVED: Yielding during measurement for accuracy
      }
    }

    // consume to avoid DCE
    if (state.counters[0].value === -1) console.log('noop');
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    type Item = { id: number; score: number; tags: string[] };
    type Group = { id: number; items: Item[] };
    type State = { groups: Group[] };

    const itemsCount = Math.max(1_000, Math.min(50_000, dataSize));
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    const initialState: State = {
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
    };

    const touch = createAction(
      '[Test] Touch',
      props<{ group: number; index: number }>()
    );

    const reducer = createReducer(
      initialState,
      on(touch, (state, { group, index }) => ({
        ...state,
        groups: state.groups.map((g, gi) =>
          gi !== group
            ? g
            : {
                ...g,
                items: g.items.map((it, ii) =>
                  ii !== index
                    ? it
                    : {
                        ...it,
                        score: it.score + 1,
                        tags:
                          (index & 63) === 0
                            ? it.tags.includes('hot')
                              ? ['cold']
                              : ['hot']
                            : it.tags,
                      }
                ),
              }
        ),
      }))
    );

    const beforeMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;

    let state = initialState;
    const start = performance.now();
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const g = t % groups;
      const idx = t % state.groups[g].items.length;
      state = reducer(state, touch({ group: g, index: idx }));
      if ((t & 63) === 0) {
        // REMOVED: Yielding during measurement for accuracy
      }
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug('[NgRx][memory] usedJSHeapSize ΔMB ~', deltaMB.toFixed(2));
    }

    // consume to avoid DCE
    if (state.groups.length === -1) console.log('noop');
    return duration;
  }

  async runDataFetchingBenchmark(): Promise<number> {
    // Simulate data fetching with NgRx Store pattern
    const initialState: NgRxState = { groups: [], posts: [], users: [] };
    let state = initialState;

    const beforeMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    const start = performance.now();

    // Simulate fetching 1000 user records from API
    const users = Array.from({ length: 1000 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      isActive: Math.random() > 0.3,
      department: `Dept ${Math.floor(Math.random() * 10) + 1}`,
      lastLogin: new Date().toISOString(),
    }));

    // Dispatch action to hydrate users
    state = benchmarkReducer(state, setUsers({ payload: users }));
    // REMOVED: Yielding during measurement for accuracy

    // Simulate filtering active users (realistic business logic)
    const activeUsers = users.filter((user) => user.isActive);
    state = benchmarkReducer(state, setFilteredUsers({ payload: activeUsers }));
    // REMOVED: Yielding during measurement for accuracy

    // Simulate additional processing - group by department
    const departmentGroups = activeUsers.reduce((acc, user) => {
      if (!acc[user.department]) {
        acc[user.department] = [];
      }
      acc[user.department].push(user);
      return acc;
    }, {} as Record<string, User[]>);

    // Update state with grouped data
    state = benchmarkReducer(
      state,
      setDepartmentGroups({ payload: departmentGroups })
    );

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRx][DataFetching][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    // consume to avoid DCE
    if (state.users?.length === -1) console.log('noop');
    return duration;
  }

  async runRealTimeUpdatesBenchmark(): Promise<number> {
    // Simulate real-time updates (WebSocket-like) with NgRx Store
    const initialState: NgRxState = {
      groups: [],
      posts: [],
      users: [],
      metrics: { activeUsers: 0, messagesPerSecond: 0, systemLoad: 0.0 },
    };
    let state = initialState;

    const beforeMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    const start = performance.now();

    // Simulate real-time metric updates using consistent iteration count
    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.REAL_TIME_UPDATES; i++) {
      const metrics = {
        activeUsers: Math.floor(Math.random() * 1000) + 100,
        messagesPerSecond: Math.floor(Math.random() * 50) + 10,
        systemLoad: Math.random() * 0.8 + 0.1,
      };

      state = benchmarkReducer(state, updateMetrics({ payload: metrics }));

      // Simulate incoming messages (like chat or notifications)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DATA_FETCHING) === 0) {
        const newMessage: Message = {
          id: i,
          content: `Real-time message ${i}`,
          timestamp: Date.now(),
          priority: Math.random() > 0.7 ? 'high' : 'normal',
        };
        state = benchmarkReducer(state, addMessage({ payload: newMessage }));
      }

      // REMOVED: Yielding during measurement for accuracy
      // if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.REAL_TIME_UPDATES) === 0)
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRx][RealTimeUpdates][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    // consume to avoid DCE
    if (state.metrics && Object.keys(state.metrics).length === -1)
      console.log('noop');
    return duration;
  }

  async runStateSizeScalingBenchmark(): Promise<number> {
    // Test performance with large state size (10,000 items)
    const initialState: NgRxState = { groups: [], posts: [], users: [] };
    let state = initialState;

    const beforeMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    const start = performance.now();

    // Create large dataset (10,000 items)
    const largeDataset: LargeDataItem[] = Array.from(
      { length: 10000 },
      (_, i) => ({
        id: i + 1,
        title: `Item ${i + 1}`,
        description: `Description for item ${
          i + 1
        } with some additional text to make it realistic`,
        category: `Category ${Math.floor(i / 100) + 1}`,
        status: Math.random() > 0.5 ? 'active' : 'inactive',
        metadata: {
          createdAt: new Date().toISOString(),
          tags: [`tag${i % 10}`, `tag${i % 7}`, `tag${i % 5}`],
          score: Math.random() * 100,
        },
      })
    );

    // Hydrate the large dataset
    state = benchmarkReducer(state, setLargeDataset({ payload: largeDataset }));
    // REMOVED: Yielding during measurement for accuracy

    // Perform operations that would be common with large datasets
    // 1. Filter by status
    const activeItems = largeDataset.filter((item) => item.status === 'active');
    state = benchmarkReducer(state, setActiveItems({ payload: activeItems }));
    // REMOVED: Yielding during measurement for accuracy

    // 2. Sort by score (expensive operation)
    const sortedItems = [...activeItems].sort(
      (a, b) => b.metadata.score - a.metadata.score
    );
    state = benchmarkReducer(state, setSortedItems({ payload: sortedItems }));
    // REMOVED: Yielding during measurement for accuracy

    // 3. Update multiple items (batch update simulation)
    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES; i++) {
      const randomIndex = Math.floor(Math.random() * largeDataset.length);
      const updatedItem: LargeDataItem = {
        ...largeDataset[randomIndex],
        metadata: {
          ...largeDataset[randomIndex].metadata,
          score: Math.random() * 100,
          lastModified: new Date().toISOString(),
        },
      };
      state = benchmarkReducer(
        state,
        updateItem({ payload: { index: randomIndex, item: updatedItem } })
      );

      // REMOVED: Yielding during measurement for accuracy
      // if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.REAL_TIME_UPDATES) === 0)
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof NgRxBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[NgRx][StateSizeScaling][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    // consume to avoid DCE
    if (state.largeDataset?.length === -1) console.log('noop');
    return duration;
  }
}
