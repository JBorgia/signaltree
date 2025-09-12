import { inject, Injectable } from '@angular/core';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';

// Type definitions
type ArrayItem = {
  id: number;
  value: number;
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

  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
    const start = performance.now();

    // Initialize deep nested structure
    for (let i = 0; i < Math.min(dataSize, 1000); i++) {
      const path = Array.from(
        { length: depth },
        (_, d) => `level${d}_${i % 10}`
      );
      this.store.dispatch(new UpdateDeepNested(path, Math.random() * 100));

      if (i % 100 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();
    const maxOperations = Math.min(dataSize * 10, 1000);

    for (let i = 0; i < maxOperations; i++) {
      const index = Math.floor(Math.random() * dataSize);
      const value: ArrayItem = {
        id: i,
        value: Math.random() * 100,
        timestamp: Date.now(),
      };
      this.store.dispatch(new UpdateArray(index, value));

      if (i % 50 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    for (let i = 0; i < Math.min(dataSize, 500); i++) {
      this.store.dispatch(new ComputeValues(i));

      // Force selector computation by selecting the computed result
      this.store.selectOnce(BenchmarkState.getComputedResult).subscribe();

      if (i % 25 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 10
  ): Promise<number> {
    const start = performance.now();

    for (let batch = 0; batch < batches; batch++) {
      const updates: BatchUpdateItem[] = Array.from(
        { length: batchSize },
        (_, i) => ({
          key: `batch${batch}_item${i}`,
          value: Math.random() * 100,
        })
      );

      this.store.dispatch(new BatchUpdate(updates));

      if (batch % 10 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // First populate some data
    for (let i = 0; i < Math.min(dataSize / 10, 100); i++) {
      this.store.dispatch(new ComputeValues(i));
    }

    // Then run selector benchmark
    for (let i = 0; i < 1000; i++) {
      this.store.selectOnce(BenchmarkState.getComputedResult).subscribe();
      this.store.selectOnce(BenchmarkState.getDeepNested).subscribe();
      this.store.selectOnce(BenchmarkState.getLargeArray).subscribe();

      if (i % 100 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Populate state with data
    for (let i = 0; i < Math.min(dataSize / 100, 50); i++) {
      this.store.dispatch(new ComputeValues(i));
      this.store.dispatch(
        new UpdateArray(i, { id: i, value: i, data: `item_${i}` })
      );
    }

    // Perform serialization
    this.store.dispatch(new SerializeState());

    return performance.now() - start;
  }

  async runConcurrentUpdatesBenchmark(
    concurrency = 50,
    updatesPerWorker = 200
  ): Promise<number> {
    const start = performance.now();

    // Simulate concurrent updates by dispatching multiple actions rapidly
    const promises = Array.from(
      { length: concurrency },
      async (_, workerId) => {
        for (let i = 0; i < updatesPerWorker; i++) {
          const path = [`worker${workerId}`, `item${i}`];
          this.store.dispatch(new UpdateDeepNested(path, Math.random() * 100));

          if (i % 20 === 0) await this.yieldToUI();
        }
      }
    );

    await Promise.all(promises);
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Create and update large amounts of data to test memory efficiency
    for (let i = 0; i < Math.min(dataSize, 1000); i++) {
      // Create nested data
      const path = [`memory_test`, `item_${i}`];
      this.store.dispatch(
        new UpdateDeepNested(path, {
          id: i,
          data: new Array(100).fill(0).map(() => Math.random()),
          metadata: { created: Date.now(), index: i },
        })
      );

      if (i % 50 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runDataFetchingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate API data fetching and state hydration
    const mockApiData: ArrayItem[] = Array.from(
      { length: Math.min(dataSize, 1000) },
      (_, i) => ({
        id: i,
        name: `Item ${i}`,
        category: `Category ${i % 10}`,
        price: Math.random() * 100,
        inStock: Math.random() > 0.5,
        value: i,
        metadata: {
          created: new Date(
            Date.now() - Math.random() * 1000000000
          ).toISOString(),
          tags: [`tag${i % 5}`, `category${i % 3}`],
        },
      })
    );

    // Hydrate state with fetched data
    for (let i = 0; i < mockApiData.length; i++) {
      this.store.dispatch(new UpdateArray(i, mockApiData[i]));

      if (i % 100 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runRealTimeUpdatesBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate real-time updates (like WebSocket messages)
    const updateCount = Math.min(dataSize, 500);

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

      if (i % 25 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runStateSizeScalingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Test performance with large state by creating many entities with relationships
    const entityCount = Math.min(dataSize * 10, 2000);

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

      if (i % 100 === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }
}
