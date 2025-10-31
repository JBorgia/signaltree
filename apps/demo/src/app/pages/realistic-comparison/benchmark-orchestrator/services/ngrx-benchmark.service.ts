import { Injectable } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import {
  Action,
  ActionReducer,
  createAction,
  createReducer,
  createSelector,
  on,
  props,
} from '@ngrx/store';
import { race, Subject, timer } from 'rxjs';
import { map, mergeMap, switchMap, take, tap } from 'rxjs/operators';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { createYieldToUI } from '../shared/benchmark-utils';

// ...existing code...
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
  /**
   * Standardized cold start and memory profiling
   */
  async runInitializationBenchmark(): Promise<{
    durationMs: number;
    memoryDeltaMB: number | 'N/A';
  }> {
    const { runTimed } = await import('./benchmark-runner');
    const stateFactory = () => ({
      groups: [],
      posts: [],
      users: [],
    });
    const result = await runTimed(
      () => {
        // Simulate NgRx store initialization
        createReducer(stateFactory());
      },
      { operations: 1, trackMemory: true, label: 'ngrx-init' }
    );
    return {
      durationMs: result.durationMs,
      memoryDeltaMB:
        typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
    };
  }
  /**
   * Standardized cold start and memory profiling
   */
  async runInitializationBenchmark(): Promise<{
    durationMs: number;
    memoryDeltaMB: number | 'N/A';
  }> {
    const { runTimed } = await import('./benchmark-runner');
    const stateFactory = () => ({
      groups: [],
      posts: [],
      users: [],
    });
    const result = await runTimed(
      () => {
        // Simulate NgRx store initialization
        createReducer(stateFactory());
      },
      { operations: 1, trackMemory: true, label: 'ngrx-init' }
    );
    return {
      durationMs: result.durationMs,
      memoryDeltaMB:
        typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
    };
  }
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };

  private yieldToUI = createYieldToUI();

  // --- Middleware Benchmarks (NgRx Meta-Reducers) ---

  async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
    // Create a simple state and action
    interface TestState {
      counter: number;
      data: string;
    }
    const incrementAction = createAction('[Test] Increment');

    const testReducer = createReducer<TestState>(
      { counter: 0, data: 'test' },
      on(incrementAction, (state) => ({ ...state, counter: state.counter + 1 }))
    );

    // Create a meta-reducer (NgRx's middleware)
    const singleMetaReducer = (
      reducer: ActionReducer<TestState>
    ): ActionReducer<TestState> => {
      return (state: TestState | undefined, action: Action) => {
        // Middleware work: simple state inspection
        if (state) {
          const _check = state.counter > -1; // Minimal overhead check
          void _check;
        }
        return reducer(state, action);
      };
    };

    // Apply meta-reducer
    const reducerWithMiddleware = singleMetaReducer(testReducer);

    const start = performance.now();
    let currentState: TestState = { counter: 0, data: 'test' };

    for (let i = 0; i < operations; i++) {
      currentState = reducerWithMiddleware(currentState, incrementAction());
    }

    return performance.now() - start;
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number> {
    interface TestState {
      counter: number;
      data: string;
    }
    const incrementAction = createAction('[Test] Increment');

    const testReducer = createReducer<TestState>(
      { counter: 0, data: 'test' },
      on(incrementAction, (state) => ({ ...state, counter: state.counter + 1 }))
    );

    // Create multiple meta-reducers to compose
    const createMetaReducer = () => {
      return (reducer: ActionReducer<TestState>): ActionReducer<TestState> => {
        return (state: TestState | undefined, action: Action) => {
          if (state) {
            // Each middleware does minimal work
            let sum = 0;
            for (let i = 0; i < 10; i++) sum += i;
            void sum;
          }
          return reducer(state, action);
        };
      };
    };

    // Compose multiple meta-reducers (NgRx applies them in sequence)
    let composedReducer = testReducer;
    for (let i = 0; i < middlewareCount; i++) {
      composedReducer = createMetaReducer()(composedReducer);
    }

    const start = performance.now();
    let currentState: TestState = { counter: 0, data: 'test' };

    for (let i = 0; i < operations; i++) {
      currentState = composedReducer(currentState, incrementAction());
    }

    return performance.now() - start;
  }

  async runConditionalMiddlewareBenchmark(operations: number): Promise<number> {
    interface TestState {
      counter: number;
      data: string;
    }
    const incrementAction = createAction('[Test] Increment');
    const otherAction = createAction('[Test] Other');

    const testReducer = createReducer<TestState>(
      { counter: 0, data: 'test' },
      on(incrementAction, (state) => ({
        ...state,
        counter: state.counter + 1,
      })),
      on(otherAction, (state) => ({ ...state, data: 'modified' }))
    );

    // Conditional meta-reducer
    const conditionalMetaReducer = (
      reducer: ActionReducer<TestState>
    ): ActionReducer<TestState> => {
      return (state: TestState | undefined, action: Action) => {
        // Conditional middleware logic
        if (
          action.type === incrementAction.type &&
          state &&
          state.counter % 2 === 0
        ) {
          // Do extra work on even counters
          let sum = 0;
          for (let i = 0; i < 20; i++) sum += i;
          void sum;
        }
        return reducer(state, action);
      };
    };

    const reducerWithMiddleware = conditionalMetaReducer(testReducer);

    const start = performance.now();
    let currentState: TestState = { counter: 0, data: 'test' };

    for (let i = 0; i < operations; i++) {
      const action = i % 2 === 0 ? incrementAction() : otherAction();
      currentState = reducerWithMiddleware(currentState, action);
    }

    return performance.now() - start;
  }

  // --- Async Workflows (NgRx Effects) ---
  async runAsyncWorkflowBenchmark(dataSize: number): Promise<number> {
    // Create actions for async workflow
    const triggerAsync = createAction(
      '[Async] Trigger',
      props<{ id: number }>()
    );
    const asyncComplete = createAction(
      '[Async] Complete',
      props<{ id: number }>()
    );

    // Create an Actions instance manually for benchmark
    const actionsSubject = new Subject<Action>();
    const actions$ = actionsSubject as Actions;

    // Create effect using actual @ngrx/effects API
    const asyncEffect$ = actions$.pipe(
      ofType(triggerAsync),
      mergeMap((action) =>
        // Simulate async operation with timer
        timer(0).pipe(
          map(() => asyncComplete({ id: action.id })),
          take(1)
        )
      )
    );

    const ops = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW
    );

    // Track completions
    let completedCount = 0;
    const completionPromise = new Promise<void>((resolve) => {
      asyncEffect$.subscribe((completionAction: Action) => {
        if (completionAction.type === asyncComplete.type) {
          completedCount++;
          if (completedCount >= ops) {
            resolve();
          }
        }
      });
    });

    const start = performance.now();

    // Dispatch async actions
    for (let i = 0; i < ops; i++) {
      actionsSubject.next(triggerAsync({ id: i }));
    }

    await completionPromise;

    return performance.now() - start;
  }

  async runAsyncCancellationBenchmark(operations: number): Promise<number> {
    // Create actions for cancellation workflow
    const startTask = createAction('[Task] Start', props<{ id: number }>());
    const cancelTask = createAction('[Task] Cancel', props<{ id: number }>());
    const taskComplete = createAction(
      '[Task] Complete',
      props<{ id: number }>()
    );

    // Create Actions instance manually
    const actionsSubject = new Subject<Action>();
    const actions$ = actionsSubject as Actions;

    // Track which tasks are cancelled
    const cancelledIds = new Set<number>();

    // Effect that handles task cancellation using takeUntil
    const taskEffect$ = actions$.pipe(
      ofType(startTask),
      mergeMap((action) => {
        const cancelSignal$ = actions$.pipe(
          ofType(cancelTask),
          tap((cancel) => {
            if (cancel.id === action.id) {
              cancelledIds.add(action.id);
            }
          })
        );

        return race(
          timer(10).pipe(map(() => taskComplete({ id: action.id }))),
          cancelSignal$.pipe(
            take(1),
            switchMap(() => []) // Cancel by emitting nothing
          )
        );
      })
    );

    let completedCount = 0;
    const allDonePromise = new Promise<void>((resolve) => {
      taskEffect$.subscribe((action: Action) => {
        if (action.type === taskComplete.type) {
          completedCount++;
          // We expect only half to complete (the non-cancelled ones)
          if (completedCount + cancelledIds.size >= operations) {
            resolve();
          }
        }
      });
    });

    const start = performance.now();

    // Start all tasks
    for (let i = 0; i < operations; i++) {
      actionsSubject.next(startTask({ id: i }));
    }

    // Cancel half of them immediately
    for (let i = 0; i < Math.floor(operations / 2); i++) {
      actionsSubject.next(cancelTask({ id: i }));
    }

    await allDonePromise;

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

    type Item = {
      id: number;
      flag: boolean;
      value: number;
      metadata: { category: number; priority: number };
    };
    type State = { items: Item[] };

    let state: State = {
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
        value: Math.random() * 100,
        metadata: { category: i % 5, priority: i % 3 },
      })),
    };

    // Memoized selectors similar to NgRx store usage
    const selectFeature = (s: State) => s;
    const selectItems = createSelector(selectFeature, (s: State) => s.items);
    const selectEvenCount = createSelector(
      selectItems,
      (items) => items.filter((x) => x.flag).length
    );
    const selectHighValue = createSelector(
      selectItems,
      (items) => items.filter((x) => x.value > 50).length
    );
    const selectByCategory = createSelector(selectItems, (items) =>
      items.reduce((acc: Record<number, number>, item) => {
        const cat = item.metadata.category;
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<number, number>)
    );

    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      // Test multiple selectors to stress memoization
      selectEvenCount(state);
      selectHighValue(state);
      selectByCategory(state);

      // Occasionally update to test cache invalidation (same as SignalTree)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR) === 0) {
        const idx = i % state.items.length;
        state = {
          ...state,
          items: state.items.map((item, index) =>
            index === idx ? { ...item, flag: !item.flag } : item
          ),
        };
      }
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
