import { Injectable } from '@angular/core';
import {
  EntityState,
  EntityStore,
  ID,
  Store,
  StoreConfig,
} from '@datorama/akita';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { createYieldToUI } from '../shared/benchmark-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class AkitaBenchmarkService {
  /**
   * Standardized cold start and memory profiling
   */
  async runInitializationBenchmark(): Promise<{
    durationMs: number;
    memoryDeltaMB: number | 'N/A';
  }> {
    const { runTimed } = await import('./benchmark-runner');
    const stateFactory = () => ({
      deepNested: {},
      largeArray: [],
      computedValues: { base: 0, factors: [] },
      batchData: {},
    });
    const result = await runTimed(
      () => {
        // Simulate Akita store initialization
        class InitStore extends Store<any> {
          constructor() {
            super(stateFactory());
          }
        }
        const store = new InitStore();
        void store;
      },
      { operations: 1, trackMemory: true, label: 'akita-init' }
    );
    return {
      durationMs: result.durationMs,
      memoryDeltaMB:
        typeof result.memoryDeltaMB === 'number' ? result.memoryDeltaMB : 'N/A',
    };
  }
  // Akita is entity-centric; we will use plain objects for nested/other cases
  private yieldToUI = createYieldToUI();

  // --- Middleware Benchmarks (Akita akitaPreUpdate Hooks) ---

  async runSingleMiddlewareBenchmark(operations: number): Promise<number> {
    // Create a store with akitaPreUpdate hook (Akita's middleware)
    interface TestState {
      counter: number;
      data: string;
    }

    class SingleMiddlewareStore extends Store<TestState> {
      constructor() {
        super({ counter: 0, data: 'test' });
      }

      override akitaPreUpdate(
        previousState: TestState,
        nextState: TestState
      ): TestState {
        // Middleware work: simple state inspection
        const _check = nextState.counter > -1;
        void _check;
        return nextState;
      }
    }

    const store = new SingleMiddlewareStore();

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      store.update((state) => ({ ...state, counter: state.counter + 1 }));
    }

    return performance.now() - start;
  }

  async runMultipleMiddlewareBenchmark(
    middlewareCount: number,
    operations: number
  ): Promise<number> {
    // Akita only supports one akitaPreUpdate hook per store, so we simulate
    // multiple middleware by doing multiple operations in the hook
    interface TestState {
      counter: number;
      data: string;
    }

    class MultipleMiddlewareStore extends Store<TestState> {
      constructor(private middlewareCount: number) {
        super({ counter: 0, data: 'test' });
      }

      override akitaPreUpdate(
        previousState: TestState,
        nextState: TestState
      ): TestState {
        // Simulate multiple middleware running
        for (let m = 0; m < this.middlewareCount; m++) {
          let sum = 0;
          for (let i = 0; i < 10; i++) sum += i;
          void sum;
        }
        return nextState;
      }
    }

    const store = new MultipleMiddlewareStore(middlewareCount);

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      store.update((state) => ({ ...state, counter: state.counter + 1 }));
    }

    return performance.now() - start;
  }

  async runConditionalMiddlewareBenchmark(operations: number): Promise<number> {
    // Conditional middleware logic in akitaPreUpdate
    interface TestState {
      counter: number;
      data: string;
    }

    class ConditionalMiddlewareStore extends Store<TestState> {
      constructor() {
        super({ counter: 0, data: 'test' });
      }

      override akitaPreUpdate(
        previousState: TestState,
        nextState: TestState
      ): TestState {
        // Conditional middleware: do extra work on even counters
        if (nextState.counter % 2 === 0) {
          let sum = 0;
          for (let i = 0; i < 20; i++) sum += i;
          void sum;
        }
        return nextState;
      }
    }

    const store = new ConditionalMiddlewareStore();

    const start = performance.now();

    for (let i = 0; i < operations; i++) {
      const updateData = i % 2 === 0;
      if (updateData) {
        store.update((state) => ({ ...state, counter: state.counter + 1 }));
      } else {
        store.update((state) => ({ ...state, data: 'modified' }));
      }
    }

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
    for (let i = 0; i < ops; i++)
      promises.push(new Promise((r) => setTimeout(r, 0)));
    await Promise.all(promises);
    return performance.now() - start;
  }

  async runConcurrentAsyncBenchmark(concurrency: number): Promise<number> {
    const start = performance.now();
    const tasks = Array.from(
      { length: concurrency },
      () => new Promise((r) => setTimeout(r, 0))
    );
    await Promise.all(tasks);
    return performance.now() - start;
  }

  async runAsyncCancellationBenchmark(operations: number): Promise<number> {
    const start = performance.now();
    const timers: number[] = [];
    for (let i = 0; i < operations; i++)
      timers.push(setTimeout(() => void 0, 10) as unknown as number);
    for (let i = 0; i < Math.floor(operations / 2); i++)
      clearTimeout(timers[i]);
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

    let state: any = createNested(depth);
    const updateDeep = (obj: any, lvl: number, value: number): any =>
      lvl === 0
        ? { ...obj, value }
        : { ...obj, level: updateDeep(obj.level ?? {}, lvl - 1, value) };

    const start = performance.now();
    // Match NgXs cap of 1000 iterations for fair comparison
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED);
      i++
    ) {
      state = updateDeep(state, depth - 1, i);
    }
    // consume
    if (state?.level?.level === null) console.log('noop');
    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    type Item = { id: ID; value: number };
    type ItemsState = EntityState<Item>;

    @StoreConfig({ name: 'akita-bench-items', idKey: 'id' })
    class ItemsStore extends EntityStore<ItemsState, Item, number> {
      constructor() {
        super({});
      }
    }
    const store = new ItemsStore();
    store.add(
      Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      }))
    );

    const start = performance.now();
    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    );
    for (let i = 0; i < updates; i++) {
      const id = i % dataSize;
      store.update(id, { value: Math.random() * 1000 });
    }
    // consume state so it isn't DCE'd
    const v = store.getValue();
    if ((v.ids?.length ?? 0) === -1) console.log('noop');
    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    // Akita has queries; we simulate derived computation over plain object state
    let state = {
      value: 0,
      factors: Array.from(
        { length: BENCHMARK_CONSTANTS.DATA_GENERATION.FACTOR_COUNT },
        (_, i) => i + 1
      ),
    };
    const compute = () => {
      let acc = 0;
      for (const f of state.factors)
        acc += Math.sin(state.value * f) * Math.cos(f);
      return acc;
    };

    const start = performance.now();
    // Match NgXs cap of 500 iterations for fair comparison
    for (
      let i = 0;
      i < Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
      i++
    ) {
      state = { ...state, value: i };
      compute();
    }
    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_UPDATES,
    batchSize = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_SIZE
  ): Promise<number> {
    type Item = { id: ID; value: number };
    type ItemsState = EntityState<Item>;
    @StoreConfig({ name: 'akita-bench-batch', idKey: 'id' })
    class ItemsStore extends EntityStore<ItemsState, Item, number> {
      constructor() {
        super({});
      }
    }
    const store = new ItemsStore();
    store.add(
      Array.from({ length: batchSize }, (_, i) => ({ id: i, value: i }))
    );

    const start = performance.now();
    for (let b = 0; b < batches; b++) {
      // update all in a pass
      store.update(
        Array.from({ length: batchSize }, (_, i) => i),
        (entity) => ({ value: (entity.value + 1) | 0 })
      );
    }
    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    type Item = {
      id: ID;
      flag: boolean;
      value: number;
      metadata: { category: number; priority: number };
    };
    type ItemsState = EntityState<Item>;
    @StoreConfig({ name: 'akita-bench-select', idKey: 'id' })
    class ItemsStore extends EntityStore<ItemsState, Item, number> {
      constructor() {
        super({});
      }
    }
    const store = new ItemsStore();
    store.add(
      Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
        value: Math.random() * 100,
        metadata: { category: i % 5, priority: i % 3 },
      }))
    );

    const start = performance.now();

    // Three memoized selectors to match SignalTree test
    let cachedEvenCount: number | undefined;
    let cachedHighValueCount: number | undefined;
    let cachedCategoryMap: Record<number, number> | undefined;
    let lastVersion = 0;

    const computeEvenCount = () => {
      const val = store.getValue();
      const ids = (val.ids as ID[]) ?? [];
      const ents =
        (val.entities as Record<ID, Item>) ?? ({} as Record<ID, Item>);
      const currentVersion = ids.length;
      if (cachedEvenCount !== undefined && currentVersion === lastVersion) {
        return cachedEvenCount;
      }
      let c = 0;
      for (const id of ids) if (ents[id]?.flag) c++;
      cachedEvenCount = c;
      lastVersion = currentVersion;
      return c;
    };

    const computeHighValueCount = () => {
      const val = store.getValue();
      const ids = (val.ids as ID[]) ?? [];
      const ents =
        (val.entities as Record<ID, Item>) ?? ({} as Record<ID, Item>);
      const currentVersion = ids.length;
      if (
        cachedHighValueCount !== undefined &&
        currentVersion === lastVersion
      ) {
        return cachedHighValueCount;
      }
      let c = 0;
      for (const id of ids) if (ents[id]?.value && ents[id].value > 50) c++;
      cachedHighValueCount = c;
      return c;
    };

    const computeCategoryMap = () => {
      const val = store.getValue();
      const ids = (val.ids as ID[]) ?? [];
      const ents =
        (val.entities as Record<ID, Item>) ?? ({} as Record<ID, Item>);
      const currentVersion = ids.length;
      if (cachedCategoryMap !== undefined && currentVersion === lastVersion) {
        return cachedCategoryMap;
      }
      const result: Record<number, number> = {};
      for (const id of ids) {
        const item = ents[id];
        if (item?.metadata) {
          const cat = item.metadata.category;
          result[cat] = (result[cat] || 0) + 1;
        }
      }
      cachedCategoryMap = result;
      return result;
    };

    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      computeEvenCount();
      computeHighValueCount();
      computeCategoryMap();

      // Occasionally update to test cache invalidation (same as SignalTree/NgRx)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.SELECTOR) === 0) {
        const idx = i % dataSize;
        const entities = store.getValue().entities as Record<ID, Item>;
        const item = entities?.[idx];
        if (item) {
          store.update(idx, { flag: !item.flag });
          // Invalidate cache on update
          cachedEvenCount = undefined;
          cachedHighValueCount = undefined;
          cachedCategoryMap = undefined;
          lastVersion++;
        }
      }
    }
    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    // Create an entity store and populate it to reflect actual in-store serialization
    type User = {
      id: number;
      name: string;
      roles: string[];
      active: boolean;
      meta: { createdAt: Date };
    };

    @StoreConfig({ name: 'akita-serialize', idKey: 'id' })
    class UsersStore extends EntityStore<EntityState<User>, User, number> {
      constructor() {
        super({});
      }
    }
    const store = new UsersStore();
    const users: User[] = Array.from(
      { length: Math.max(100, Math.min(1000, dataSize)) },
      (_, i) => ({
        id: i,
        name: `User ${i}`,
        roles: i % 5 === 0 ? ['admin', 'user'] : ['user'],
        active: i % 3 === 0,
        meta: { createdAt: new Date(2020, 0, 1 + (i % 28)) },
      })
    );
    store.set(users);

    // minor churn
    for (let i = 0; i < 10; i++) {
      const id = i % users.length;
      store.update(id, (u) => ({ ...u, active: !u.active }));
    }

    const t0 = performance.now();
    const plain = store.getValue();
    const t1 = performance.now();
    JSON.stringify({ data: plain });
    const t2 = performance.now();
    console.debug(
      '[Akita][serialization] toPlain(ms)=',
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
    type Item = { id: ID; value: number };
    type ItemsState = EntityState<Item>;
    @StoreConfig({ name: 'akita-bench-conc', idKey: 'id' })
    class ItemsStore extends EntityStore<ItemsState, Item, number> {
      constructor() {
        super({});
      }
    }
    const store = new ItemsStore();
    store.add(
      Array.from({ length: concurrency }, (_, i) => ({ id: i, value: 0 }))
    );

    const start = performance.now();
    for (let u = 0; u < updatesPerWorker; u++) {
      store.update(
        Array.from({ length: concurrency }, (_, i) => i),
        (entity) => ({ value: (entity.value + 1) | 0 })
      );
    }
    // consume
    const v2 = store.getValue();
    const ents2 = (v2.entities as Record<ID, Item>) ?? ({} as Record<ID, Item>);
    const first = ents2[0 as unknown as ID];
    if ((first?.value ?? 0) === -1) console.log('noop');
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    type Item = { id: ID; score: number; tags: string[]; group: number };
    type ItemsState = EntityState<Item>;
    @StoreConfig({ name: 'akita-bench-mem', idKey: 'id' })
    class ItemsStore extends EntityStore<ItemsState, Item, number> {
      constructor() {
        super({});
      }
    }

    const itemsCount = Math.max(
      BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MIN,
      Math.min(BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MAX, dataSize)
    );
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    const store = new ItemsStore();
    store.add(
      Array.from({ length: itemsCount }, (_, i) => ({
        id: i,
        score: (i * 13) % 997,
        tags: i % 7 === 0 ? ['hot', 'new'] : ['cold'],
        group: i % groups,
      }))
    );

    const start = performance.now();
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const id = t % itemsCount;
      store.update(id, (e) => ({
        score: (e.score + 1) | 0,
        tags:
          (t & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.MEMORY_EFFICIENCY) === 0
            ? e.tags.includes('hot')
              ? ['cold']
              : ['hot']
            : e.tags,
      }));
    }
    return performance.now() - start;
  }

  async runDataFetchingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Simulate API data structure for Akita entities
    type FetchedItem = {
      id: number;
      title: string;
      description: string;
      tags: string[];
      meta: {
        createdAt: Date;
        updatedAt: Date;
        views: number;
        rating: number;
      };
      relations: {
        authorId: number;
        parentId: number | null;
        childIds: number[];
      };
    };

    type FetchedItemsState = EntityState<FetchedItem>;

    @StoreConfig({ name: 'akita-fetched-items', idKey: 'id' })
    class FetchedItemsStore extends EntityStore<
      FetchedItemsState,
      FetchedItem,
      number
    > {
      constructor() {
        super({});
      }
    }

    const itemsStore = new FetchedItemsStore();

    // Mock API data
    const mockApiData: FetchedItem[] = Array.from(
      {
        length: Math.min(
          dataSize,
          BENCHMARK_CONSTANTS.ITERATIONS.DATA_FETCHING
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

    // Simulate data fetching and hydration
    itemsStore.set(mockApiData);

    // Simulate filtering operations (common after data fetch)
    for (
      let i = 0;
      i < Math.min(dataSize / 10, BENCHMARK_CONSTANTS.ITERATIONS.DATA_FETCHING);
      i++
    ) {
      const searchTerm = `search${i}`;
      const categoryFilter = `cat${i % 5}`;

      // Akita doesn't have built-in filtering like SignalTree, so we simulate the overhead
      const filteredIds = mockApiData
        .filter(
          (item) =>
            item.title.includes(searchTerm) ||
            item.tags.includes(categoryFilter)
        )
        .map((item) => item.id);

      // Update store with filtered results (simulate what would happen)
      if (filteredIds.length > 0) {
        itemsStore.setActive(filteredIds[0]);
      }
    }

    return performance.now() - start;
  }

  async runRealTimeUpdatesBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Create stores for different aspects of real-time data
    type LiveMetric = {
      id: string;
      activeUsers: number;
      totalSessions: number;
      pageViews: number;
      serverLoad: number;
      responseTime: number;
    };

    type Event = {
      id: number;
      type: string;
      timestamp: number;
      data: string;
    };

    type Notification = {
      id: number;
      message: string;
      priority: string;
      timestamp: number;
    };

    @StoreConfig({ name: 'akita-metrics', idKey: 'id' })
    class MetricsStore extends EntityStore<
      EntityState<LiveMetric>,
      LiveMetric,
      string
    > {
      constructor() {
        super({});
        this.add({
          id: 'main',
          activeUsers: 0,
          totalSessions: 0,
          pageViews: 0,
          serverLoad: 0.0,
          responseTime: 0,
        });
      }
    }

    @StoreConfig({ name: 'akita-events', idKey: 'id' })
    class EventsStore extends EntityStore<EntityState<Event>, Event, number> {
      constructor() {
        super({});
      }
    }

    @StoreConfig({ name: 'akita-notifications', idKey: 'id' })
    class NotificationsStore extends EntityStore<
      EntityState<Notification>,
      Notification,
      number
    > {
      constructor() {
        super({});
      }
    }

    const metricsStore = new MetricsStore();
    const eventsStore = new EventsStore();
    const notificationsStore = new NotificationsStore();

    // Simulate real-time updates
    const updateFrequency = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.REAL_TIME_UPDATES,
      dataSize
    );
    for (let i = 0; i < updateFrequency; i++) {
      // Update live metrics (requires creating new objects due to immutability)
      const currentMetrics = metricsStore.getValue().entities?.['main'];
      if (currentMetrics) {
        metricsStore.update('main', {
          activeUsers:
            currentMetrics.activeUsers + Math.floor(Math.random() * 10 - 5),
          pageViews: currentMetrics.pageViews + Math.floor(Math.random() * 20),
          serverLoad: Math.random(),
          responseTime: 50 + Math.random() * 200,
        });
      }

      // Add new events (with size limit simulation)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DATA_FETCHING) === 0) {
        eventsStore.add({
          id: i,
          type: 'user_action',
          timestamp: Date.now(),
          data: `event${i}`,
        });

        // Keep only last 100 events (simulate cleanup)
        const entities = eventsStore.getValue().entities;
        if (entities) {
          const allEvents = Object.values(entities);
          if (allEvents.length > 100) {
            const toRemove = allEvents
              .slice(0, allEvents.length - 100)
              .map((e) => e.id);
            eventsStore.remove(toRemove);
          }
        }
      }

      // Add notifications occasionally
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.REAL_TIME_UPDATES) === 0) {
        notificationsStore.add({
          id: i,
          message: `Notification ${i}`,
          priority: 'normal',
          timestamp: Date.now(),
        });

        // Keep only last 10 notifications
        const entities = notificationsStore.getValue().entities;
        if (entities) {
          const allNotifications = Object.values(entities);
          if (allNotifications.length > 10) {
            const toRemove = allNotifications
              .slice(0, allNotifications.length - 10)
              .map((n) => n.id);
            notificationsStore.remove(toRemove);
          }
        }
      }
    }

    return performance.now() - start;
  }

  async runStateSizeScalingBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    // Test how Akita handles large entity collections
    type LargeEntity = {
      id: number;
      name: string;
      properties: Array<{
        key: string;
        value: string;
        metadata: { type: string; indexed: boolean };
      }>;
      relations: Array<{
        targetId: number;
        type: string;
      }>;
    };

    @StoreConfig({ name: 'akita-large-entities', idKey: 'id' })
    class LargeEntitiesStore extends EntityStore<
      EntityState<LargeEntity>,
      LargeEntity,
      number
    > {
      constructor() {
        super({});
      }
    }

    const entitiesStore = new LargeEntitiesStore();

    // Create large dataset
    const largeDataSet: LargeEntity[] = Array.from(
      {
        length: Math.min(
          dataSize * 10,
          BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MAX
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

    // Add all entities to store
    entitiesStore.set(largeDataSet);

    // Perform scaling operations
    const operations = BENCHMARK_CONSTANTS.ITERATIONS.STATE_SIZE_SCALING;
    for (let i = 0; i < operations; i++) {
      const entityId = i % largeDataSet.length;

      // Update entity (requires immutable update)
      entitiesStore.update(entityId, (entity) => ({
        ...entity,
        properties: entity.properties.map((prop, idx) =>
          idx === 0 ? { ...prop, value: `updated_${Date.now()}` } : prop
        ),
      }));

      // Simulate cache/index operations (Akita doesn't have built-in caching like SignalTree)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.REAL_TIME_UPDATES) === 0) {
        // Simulate some indexing work
        const entities = entitiesStore.getValue().entities;
        if (entities) {
          const entity = entities[entityId];
          if (entity) {
            // This simulates the overhead of maintaining indices manually
            entity.properties.filter((p) => p.metadata.indexed);
          }
        }
      }
    }

    return performance.now() - start;
  }

  async runSubscriberScalingBenchmark(
    subscriberCount: number
  ): Promise<number> {
    // Create a simple store for subscriber scaling test
    interface SubscriberState {
      counter: number;
      data: { value: string };
    }

    class SubscriberStore extends Store<SubscriberState> {
      constructor() {
        super({ counter: 0, data: { value: 'initial' } });
      }
    }

    const store = new SubscriberStore();

    // Create multiple subscribers (RxJS subscriptions)
    const subscribers: any[] = [];
    for (let i = 0; i < subscriberCount; i++) {
      // Each subscriber computes something based on the counter
      const subscription = store
        ._select((state) => state.counter)
        .subscribe((counter: any) => {
          // Simulate computation work
          const result = counter * (i + 1) + Math.sin(counter * 0.1);
          // Prevent DCE
          if (result === -1) console.log('noop');
        });
      subscribers.push(subscription);
    }

    const start = performance.now();

    // Perform updates and measure fanout performance
    const updates = Math.min(
      1000,
      BENCHMARK_CONSTANTS.ITERATIONS.SUBSCRIBER_SCALING || 1000
    );
    for (let i = 0; i < updates; i++) {
      // Update the counter (this will trigger all subscribers)
      store.update((state) => ({ ...state, counter: i }));

      // REMOVED: yielding during measurement for accuracy
    }

    // Clean up subscriptions
    subscribers.forEach((sub) => sub.unsubscribe());

    return performance.now() - start;
  }
}
