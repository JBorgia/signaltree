import { inject, Injectable } from '@angular/core';
import {
  Action,
  Actions,
  NgxsNextPluginFn,
  NgxsPlugin,
  ofActionDispatched,
  Selector,
  State,
  StateContext,
  Store,
} from '@ngxs/store';
import { Observable, race, timer } from 'rxjs';
import { map, mergeMap, take, tap } from 'rxjs/operators';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { createYieldToUI } from '../shared/benchmark-utils';
import { BenchmarkResult } from './_types';

// Type definitions
type ArrayItem = {
  id: number;
  value: number;
  flag?: boolean;
  timestamp?: number;
  data?: string;
  name?: string;
  category?: string;
  price?: number;
  inStock?: boolean;
  metadata?: Record<string, unknown>;
  userId?: string;
  status?: string;
  lastSeen?: number;
};

type BatchUpdateItem = {
  key: string;
  value: number | string | boolean | Record<string, unknown>;
};
type DeepNestedValue = number | string | Record<string, unknown> | ArrayItem;

// Actions for NgXs
export class UpdateDeepNested {
  static readonly type = '[Benchmark] Update Deep Nested';
  constructor(public path: string[], public value: DeepNestedValue) {}
}

export class UpdateArray {
  static readonly type = '[Benchmark] Update Array';
  constructor(public index: number, public value: ArrayItem) {}
}

export class ComputeValues {
  static readonly type = '[Benchmark] Compute Values';
  constructor(public input: number) {}
}

export class BatchUpdate {
  static readonly type = '[Benchmark] Batch Update';
  constructor(public updates: BatchUpdateItem[]) {}
}

export class SerializeState {
  static readonly type = '[Benchmark] Serialize State';
}

// State interfaces
interface BenchmarkStateModel {
  deepNested: Record<string, DeepNestedValue>;
  largeArray: ArrayItem[];
  computedValues: {
    base: number;
    factors: number[];
    result?: number;
  };
  batchData: Record<string, BatchUpdateItem['value']>;
  serializedData?: string;
}

// Async workflow actions
export class TriggerAsyncAction {
  static readonly type = '[Async] Trigger';
  constructor(public id: number) {}
}

export class AsyncCompleteAction {
  static readonly type = '[Async] Complete';
  constructor(public id: number) {}
}

export class StartTaskAction {
  static readonly type = '[Task] Start';
  constructor(public id: number) {}
}

export class CancelTaskAction {
  static readonly type = '[Task] Cancel';
  constructor(public id: number) {}
}

export class TaskCompleteAction {
  static readonly type = '[Task] Complete';
  constructor(public id: number) {}
}

// NgXs State
@State<BenchmarkStateModel>({
  name: 'benchmark',
  defaults: {
    deepNested: {},
    largeArray: [],
    computedValues: {
      base: 0,
      factors: [],
    },
    batchData: {},
  },
})
@Injectable()
export class BenchmarkState {
  @Selector()
  static getDeepNested(state: BenchmarkStateModel) {
    return state.deepNested;
  }

  // --- Middleware Benchmarks (NgXs Plugins) ---

  async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
    // Create a single plugin that intercepts actions
    class SinglePlugin implements NgxsPlugin {
      handle(state: unknown, action: unknown, next: NgxsNextPluginFn) {
        // Minimal middleware work
        const _check = typeof action === 'object';
        void _check;
        return next(state, action);
      }
    }

    const plugin = new SinglePlugin();
    const mockNext: NgxsNextPluginFn = (state: unknown) => state;

    const start = performance.now();
    let currentState: unknown = { counter: 0 };

    for (let i = 0; i < operations; i++) {
      currentState = plugin.handle(
        currentState,
        { type: '[Test] Increment' },
        mockNext
      );
    }

    return performance.now() - start;
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number> {
    // Create multiple plugins to compose
    class BenchmarkPlugin implements NgxsPlugin {
      handle(state: unknown, action: unknown, next: NgxsNextPluginFn) {
        // Each plugin does minimal work
        let sum = 0;
        for (let i = 0; i < 10; i++) sum += i;
        void sum;
        return next(state, action);
      }
    }

    // Create plugin chain
    const plugins: NgxsPlugin[] = [];
    for (let i = 0; i < middlewareCount; i++) {
      plugins.push(new BenchmarkPlugin());
    }

    // Compose plugins into a chain
    const composePlugins = (state: unknown, action: unknown): unknown => {
      let currentState = state;
      for (const plugin of plugins) {
        const mockNext: NgxsNextPluginFn = (s: unknown) => s;
        currentState = plugin.handle(currentState, action, mockNext);
      }
      return currentState;
    };

    const start = performance.now();
    let currentState: unknown = { counter: 0 };

    for (let i = 0; i < operations; i++) {
      currentState = composePlugins(currentState, {
        type: '[Test] Increment',
        payload: i,
      });
    }

    return performance.now() - start;
  }

  async runConditionalMiddlewareBenchmark(operations: number): Promise<number> {
    // Conditional plugin that does extra work on specific actions
    class ConditionalPlugin implements NgxsPlugin {
      handle(state: unknown, action: unknown, next: NgxsNextPluginFn) {
        const actionObj = action as { type: string; payload?: number };

        // Conditional middleware logic
        if (
          actionObj.type === '[Test] Increment' &&
          actionObj.payload !== undefined &&
          actionObj.payload % 2 === 0
        ) {
          // Do extra work on even payloads
          let sum = 0;
          for (let i = 0; i < 20; i++) sum += i;
          void sum;
        }

        return next(state, action);
      }
    }

    const plugin = new ConditionalPlugin();
    const mockNext: NgxsNextPluginFn = (state: unknown) => state;

    const start = performance.now();
    let currentState: unknown = { counter: 0 };

    for (let i = 0; i < operations; i++) {
      const actionType = i % 2 === 0 ? '[Test] Increment' : '[Test] Other';
      currentState = plugin.handle(
        currentState,
        { type: actionType, payload: i },
        mockNext
      );
    }

    return performance.now() - start;
  }

  @Selector()
  static getLargeArray(state: BenchmarkStateModel) {
    return state.largeArray;
  }

  @Selector()
  static getComputedResult(state: BenchmarkStateModel) {
    const { base, factors } = state.computedValues;
    if (factors.length === 0) return base;
    return factors.reduce((acc, factor) => acc * factor + base, base);
  }

  @Action(UpdateDeepNested)
  updateDeepNested(
    ctx: StateContext<BenchmarkStateModel>,
    action: UpdateDeepNested
  ) {
    const state = ctx.getState();
    const newDeepNested = { ...state.deepNested };

    // Navigate to the nested path and update
    let current: Record<string, unknown> = newDeepNested;
    for (let i = 0; i < action.path.length - 1; i++) {
      const key = action.path[i];
      if (!current[key]) current[key] = {};
      current[key] = { ...(current[key] as Record<string, unknown>) };
      current = current[key] as Record<string, unknown>;
    }
    current[action.path[action.path.length - 1]] = action.value;

    ctx.patchState({ deepNested: newDeepNested });
  }

  @Action(UpdateArray)
  updateArray(ctx: StateContext<BenchmarkStateModel>, action: UpdateArray) {
    const state = ctx.getState();
    const newArray = [...state.largeArray];
    if (action.index >= newArray.length) {
      // Extend array if needed
      while (newArray.length <= action.index) {
        newArray.push({ id: 0, value: 0 });
      }
    }
    newArray[action.index] = action.value;
    ctx.patchState({ largeArray: newArray });
  }

  @Action(ComputeValues)
  computeValues(ctx: StateContext<BenchmarkStateModel>, action: ComputeValues) {
    const factors = Array.from(
      { length: 50 },
      (_, i) => Math.sin(action.input + i) * Math.cos(action.input * i)
    );

    ctx.patchState({
      computedValues: {
        base: action.input,
        factors,
        result: factors.reduce(
          (acc, factor) => acc * factor + action.input,
          action.input
        ),
      },
    });
  }

  @Action(BatchUpdate)
  batchUpdate(ctx: StateContext<BenchmarkStateModel>, action: BatchUpdate) {
    const updates = action.updates.reduce((acc, update) => {
      acc[update.key] = update.value;
      return acc;
    }, {} as Record<string, BatchUpdateItem['value']>);

    ctx.patchState({ batchData: { ...ctx.getState().batchData, ...updates } });
  }

  @Action(SerializeState)
  serializeState(ctx: StateContext<BenchmarkStateModel>) {
    const state = ctx.getState();
    const serialized = JSON.stringify(state);
    ctx.patchState({ serializedData: serialized });
  }
}

@Injectable({ providedIn: 'root' })
export class NgxsBenchmarkService {
  private readonly store = inject(Store);

  private yieldToUI = createYieldToUI();

  // Adapter for orchestrator naming compatibility. Many services expose
  // runInitializationBenchmark; the orchestrator expects runColdStartBenchmark.
  // This implementation returns a standardized BenchmarkResult so the
  // orchestrator can consume duration and memory delta consistently.
  async runColdStartBenchmark(): Promise<BenchmarkResult> {
    return {
      durationMs: -1,
      memoryDeltaMB: undefined,
      notes: 'Disabled in demo orchestrator',
    } as BenchmarkResult;
  }

  async runDeepNestedBenchmark(
    dataSize: number,
    depth = BENCHMARK_CONSTANTS.DATA_GENERATION.NESTED_DEPTH
  ): Promise<number> {
    const start = performance.now();

    // Initialize deep nested structure
    const promises: Promise<void>[] = [];
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED);
      i++
    ) {
      const path = Array.from(
        { length: depth },
        (_, d) => `level${d}_${i % 10}`
      );
      // Wait for action to complete by converting to promise
      const promise = this.store
        .dispatch(new UpdateDeepNested(path, Math.random() * 100))
        .toPromise();
      promises.push(promise);

      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DEEP_NESTED) === 0) {
        await Promise.all(promises.splice(0)); // Wait for batch to complete
      }
    }

    // Wait for any remaining actions
    await Promise.all(promises);
    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();
    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    ); // Match other libraries' cap

    const promises: Promise<void>[] = [];
    for (let i = 0; i < updates; i++) {
      const index = i % dataSize; // Match other libraries' pattern
      const value: ArrayItem = {
        id: i,
        value: Math.random() * 1000, // Match range
        timestamp: Date.now(),
      };
      const promise = this.store
        .dispatch(new UpdateArray(index, value))
        .toPromise();
      promises.push(promise);

      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.ARRAY_UPDATES) === 0) {
        await Promise.all(promises.splice(0)); // Wait for batch to complete
      }
    }

    // Wait for any remaining actions
    await Promise.all(promises);
    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const promises: Promise<void>[] = [];
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
      i++
    ) {
      promises.push(this.store.dispatch(new ComputeValues(i)).toPromise());

      // Force selector computation by selecting the computed result
      this.store.selectOnce(BenchmarkState.getComputedResult).subscribe();

      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.COMPUTED) === 0) {
        await Promise.all(promises.splice(0)); // Wait for batch to complete
      }
    }

    // Wait for any remaining actions
    await Promise.all(promises);
    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES,
    batchSize = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_SIZE
  ): Promise<number> {
    const start = performance.now();

    const promises: Promise<void>[] = [];
    for (let batch = 0; batch < batches; batch++) {
      const updates: BatchUpdateItem[] = Array.from(
        { length: batchSize },
        (_, i) => ({
          key: `batch${batch}_item${i}`,
          value: Math.random() * 100,
        })
      );

      promises.push(this.store.dispatch(new BatchUpdate(updates)).toPromise());

      if ((batch & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.BATCH_UPDATES) === 0) {
        await Promise.all(promises.splice(0)); // Wait for batch to complete
      }
    }

    // Wait for any remaining actions
    await Promise.all(promises);
    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    // First populate array with data matching SignalTree test
    const items: ArrayItem[] = Array.from({ length: dataSize }, (_, i) => ({
      id: i,
      value: Math.random() * 100,
      flag: i % 2 === 0,
      metadata: { category: i % 5, priority: i % 3 },
    }));

    for (const item of items) {
      await this.store.dispatch(new UpdateArray(item.id, item)).toPromise();
    }

    const start = performance.now();

    // Run selector benchmark with three selectors
    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      // Three selector accesses per iteration to match SignalTree
      this.store.selectOnce(BenchmarkState.getLargeArray).subscribe();
      this.store.selectOnce(BenchmarkState.getComputedResult).subscribe();
      this.store.selectOnce(BenchmarkState.getDeepNested).subscribe();

      // Occasionally update to test cache invalidation (same as SignalTree/NgRx)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR) === 0) {
        const idx = i % dataSize;
        const currentItem = items[idx];
        if (currentItem) {
          const updatedItem = {
            ...currentItem,
            flag: !currentItem.flag,
          } as ArrayItem;
          await this.store
            .dispatch(new UpdateArray(idx, updatedItem))
            .toPromise();
          items[idx] = updatedItem;
        }
      }
    }

    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Populate state with data
    const promises: Promise<void>[] = [];
    for (
      let i = 0;
      i <
      Math.min(dataSize / 100, BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES);
      i++
    ) {
      promises.push(this.store.dispatch(new ComputeValues(i)).toPromise());
      promises.push(
        this.store
          .dispatch(new UpdateArray(i, { id: i, value: i, data: `item_${i}` }))
          .toPromise()
      );
    }

    // Wait for all data population to complete
    await Promise.all(promises);

    // Perform serialization and wait for it to complete
    await this.store.dispatch(new SerializeState()).toPromise();

    return performance.now() - start;
  }

  async runConcurrentUpdatesBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();
    const iterations = 200; // Match other libraries

    for (let i = 0; i < iterations; i++) {
      const promises: Promise<void>[] = [];
      for (let j = 0; j < 10; j++) {
        // 10 concurrent updates per iteration
        const id = (i * 10 + j) % dataSize;
        const path = [`item${id}`];
        const value = Math.random() * 1000; // Match other libraries' range
        const promise = this.store
          .dispatch(new UpdateDeepNested(path, value))
          .toPromise();
        promises.push(promise);
      }

      await Promise.all(promises); // Wait for this batch
    }

    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Create and update large amounts of data to test memory efficiency
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.MEMORY_EFFICIENCY);
      i++
    ) {
      // Create nested data
      const path = [`memory_test`, `item_${i}`];
      this.store.dispatch(
        new UpdateDeepNested(path, {
          id: i,
          data: new Array(BENCHMARK_CONSTANTS.DATA_GENERATION.ARRAY_SIZE_100)
            .fill(0)
            .map(() => Math.random()),
          metadata: { created: Date.now(), index: i },
        })
      );
    }

    return performance.now() - start;
  }

  async runDataFetchingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate API data fetching and state hydration
    const mockApiData: ArrayItem[] = Array.from(
      {
        length: Math.min(
          dataSize,
          BENCHMARK_CONSTANTS.ITERATIONS.DATA_FETCHING
        ),
      },
      (_, i) => ({
        id: i,
        name: `Item ${i}`,
        category: `Category ${
          i % BENCHMARK_CONSTANTS.DATA_GENERATION.CATEGORY_COUNT
        }`,
        price: Math.random() * 100,
        inStock: Math.random() > 0.5,
        value: i,
        metadata: {
          created: new Date(
            Date.now() - Math.random() * 1000000000
          ).toISOString(),
          tags: [
            `tag${i % BENCHMARK_CONSTANTS.DATA_GENERATION.TAG_COUNT}`,
            `category${i % 3}`,
          ],
        },
      })
    );

    // Hydrate state with fetched data
    for (let i = 0; i < mockApiData.length; i++) {
      this.store.dispatch(new UpdateArray(i, mockApiData[i]));
    }

    return performance.now() - start;
  }

  async runRealTimeUpdatesBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate real-time updates (like WebSocket messages)
    const updateCount = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.REAL_TIME_UPDATES
    );

    for (let i = 0; i < updateCount; i++) {
      // Simulate different types of real-time updates
      const updateType = i % 4;

      switch (updateType) {
        case 0: // Live metrics update
          this.store.dispatch(
            new UpdateDeepNested(['live_metrics', 'current'], {
              timestamp: Date.now(),
              value: Math.random() * 100,
            })
          );
          break;
        case 1: // User status update
          this.store.dispatch(
            new UpdateArray(i % 50, {
              id: i,
              value: i,
              userId: `user_${i}`,
              status: Math.random() > 0.5 ? 'online' : 'offline',
              lastSeen: Date.now(),
            })
          );
          break;
        case 2: // Chat message
          this.store.dispatch(
            new UpdateDeepNested(['chat', 'messages', i.toString()], {
              id: i,
              message: `Message ${i}`,
              timestamp: Date.now(),
            })
          );
          break;
        case 3: // System notification
          this.store.dispatch(
            new BatchUpdate([
              {
                key: `notification_${i}`,
                value: { type: 'info', message: `Update ${i}`, read: false },
              },
            ])
          );
          break;
      }
    }

    return performance.now() - start;
  }

  async runStateSizeScalingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Test performance with large state by creating many entities with relationships
    const entityCount = Math.min(
      dataSize * BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.LARGE_DATASET.MULTIPLIER,
      BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.MEMORY_TEST.MAX
    );

    for (let i = 0; i < entityCount; i++) {
      const entity = {
        id: i,
        type: `EntityType${i % 10}`,
        properties: {
          name: `Entity ${i}`,
          category: `Cat_${i % 20}`,
          value: Math.random() * 1000,
          active: Math.random() > 0.3,
        },
        relationships: Array.from({ length: Math.min(5, i % 10) }, (_, j) => ({
          targetId: Math.floor(Math.random() * Math.max(1, i)),
          type: `relation_${j}`,
          strength: Math.random(),
        })),
        metadata: {
          created: Date.now(),
          version: 1,
          tags: Array.from(
            { length: (i % 5) + 1 },
            (_, t) => `tag_${t}_${i % 3}`
          ),
        },
      };

      this.store.dispatch(
        new UpdateDeepNested(['entities', i.toString()], entity)
      );
    }

    return performance.now() - start;
  }

  // --- Async Workflows (NgXs Actions) ---
  async runAsyncWorkflowBenchmark(dataSize: number): Promise<number> {
    const actions$ = inject(Actions);

    const ops = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.ASYNC_WORKFLOW || 1000
    );

    // Create an effect stream using NgXs Actions
    const asyncEffect$ = actions$.pipe(
      ofActionDispatched(TriggerAsyncAction),
      mergeMap((action) =>
        // Simulate async operation with timer
        timer(0).pipe(
          map(() => new AsyncCompleteAction(action.id)),
          take(1)
        )
      )
    );

    // Track completions
    let completedCount = 0;
    const completionPromise = new Promise<void>((resolve) => {
      asyncEffect$.subscribe((completionAction) => {
        if (completionAction instanceof AsyncCompleteAction) {
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
      this.store.dispatch(new TriggerAsyncAction(i));
    }

    await completionPromise;
    return performance.now() - start;
  }

  async runAsyncCancellationBenchmark(operations: number): Promise<number> {
    const actions$ = inject(Actions);

    // Track which tasks are cancelled
    const cancelledIds = new Set<number>();

    // Effect that handles task cancellation using takeUntil
    const taskEffect$ = actions$.pipe(
      ofActionDispatched(StartTaskAction),
      mergeMap((action) => {
        const cancelSignal$ = actions$.pipe(
          ofActionDispatched(CancelTaskAction),
          tap((cancel) => {
            if (cancel.id === action.id) {
              cancelledIds.add(action.id);
            }
          })
        );

        return race(
          timer(10).pipe(map(() => new TaskCompleteAction(action.id))),
          cancelSignal$.pipe(
            take(1),
            mergeMap(() => []) // Cancel by emitting nothing
          )
        );
      })
    );

    let completedCount = 0;
    const allDonePromise = new Promise<void>((resolve) => {
      taskEffect$.subscribe((action) => {
        if (action instanceof TaskCompleteAction) {
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
      this.store.dispatch(new StartTaskAction(i));
    }

    // Cancel half of them immediately
    for (let i = 0; i < Math.floor(operations / 2); i++) {
      this.store.dispatch(new CancelTaskAction(i));
    }

    await allDonePromise;
    return performance.now() - start;
  }

  async runSubscriberScalingBenchmark(
    subscriberCount: number
  ): Promise<number> {
    // Use existing BenchmarkState and computedValues.base as counter
    // Create multiple selectors that depend on the counter
    const subscribers: Observable<number>[] = [];
    for (let i = 0; i < subscriberCount; i++) {
      // Each subscriber computes something based on the counter (computedValues.base)
      const subscriber = this.store
        .select(BenchmarkState.getComputedResult)
        .pipe(map((result) => result * (i + 1) + Math.sin(result * 0.1)));
      subscribers.push(subscriber);
    }

    const start = performance.now();

    // Perform updates and measure fanout performance
    const updates = Math.min(1000, 1000); // Use default since constant doesn't exist
    for (let i = 0; i < updates; i++) {
      // Update the counter (use ComputeValues action to update computedValues.base)
      this.store.dispatch(new ComputeValues(i));

      // Force all subscribers to recompute (simulate reading their values)
      // In NgXs, selectors are automatically updated when state changes
      // We just need to ensure the computation happens
      for (const subscriber of subscribers) {
        // Subscribe once to trigger computation
        let value: number | undefined;
        subscriber
          .subscribe((val) => {
            value = val;
            void (value === -1);
          })
          .unsubscribe(); // Unsubscribe immediately
      }

      // REMOVED: yielding during measurement for accuracy
    }

    return performance.now() - start;
  }
}
