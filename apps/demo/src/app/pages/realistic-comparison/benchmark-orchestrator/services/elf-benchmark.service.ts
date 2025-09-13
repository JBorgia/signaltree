import { Injectable } from '@angular/core';
import { createStore } from '@ngneat/elf';
import { getAllEntities, setEntities, updateAllEntities, updateEntities, withEntities } from '@ngneat/elf-entities';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class ElfBenchmarkService {
  private yieldToUI() {
    return new Promise<void>((r) =>
      setTimeout(r, BENCHMARK_CONSTANTS.TIMING.YIELD_DELAY_MS)
    );
  }

  async runDeepNestedBenchmark(
    dataSize: number,
    depth = BENCHMARK_CONSTANTS.DATA_GENERATION.NESTED_DEPTH
  ): Promise<number> {
    // Elf targets entity stores; for nested we simulate with plain object and immutable updates
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
    if (state?.level?.value === -1) console.log('noop');
    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    type Item = { id: number; value: number };
    const store = createStore(
      { name: 'elf-bench-items' },
      withEntities<Item>()
    );
    store.update(
      setEntities(
        Array.from({ length: dataSize }, (_, i) => ({
          id: i,
          value: Math.random() * 1000,
        }))
      )
    );

    const start = performance.now();
    const updates = Math.min(
      BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES,
      dataSize
    );
    for (let i = 0; i < updates; i++) {
      const id = i % dataSize;
      store.update(
        updateEntities(id, (e: Item) => ({ ...e, value: Math.random() * 1000 }))
      );
    }
    // consume
    const all = store.query(getAllEntities());
    if (all.length === -1) console.log('noop');
    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
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
    type Item = { id: number; value: number };
    const store = createStore(
      { name: 'elf-bench-batch' },
      withEntities<Item>()
    );
    store.update(
      setEntities(
        Array.from({ length: batchSize }, (_, i) => ({ id: i, value: i }))
      )
    );

    const start = performance.now();
    for (let b = 0; b < batches; b++) {
      // Single bulk update per batch
      store.update(
        updateAllEntities((e: Item) => ({ ...e, value: (e.value + 1) | 0 }))
      );
    }
    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    type Item = { id: number; flag: boolean };
    const store = createStore(
      { name: 'elf-bench-select' },
      withEntities<Item>()
    );
    store.update(
      setEntities(
        Array.from({ length: dataSize }, (_, i) => ({
          id: i,
          flag: i % 2 === 0,
        }))
      )
    );

    const start = performance.now();
    // Simple memoization: cache by reference since state is unchanged in this test
    let cachedCount: number | undefined;
    let lastRef: Item[] | undefined;
    const selectEvenCount = () => {
      const all = store.query(getAllEntities());
      if (all === lastRef && cachedCount !== undefined) return cachedCount;
      let count = 0;
      for (const it of all) if (it.flag) count++;
      lastRef = all;
      cachedCount = count;
      return count;
    };

    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR; i++) {
      const count = selectEvenCount();
      if (count === -1) console.log('noop');
    }
    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    type User = {
      id: number;
      name: string;
      roles: string[];
      active: boolean;
      meta: { createdAt: Date };
    };
    const store = createStore({ name: 'elf-serialize' }, withEntities<User>());
    const users: User[] = Array.from(
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
    );
    store.update(setEntities(users));
    for (let i = 0; i < 10; i++) {
      const id = i % users.length;
      store.update(updateEntities(id, (u) => ({ ...u, active: !u.active })));
    }
    const t0 = performance.now();
    const plain = store.getValue();
    const t1 = performance.now();
    JSON.stringify({ data: plain });
    const t2 = performance.now();
    console.debug(
      '[Elf][serialization] toPlain(ms)=',
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
    type Item = { id: number; value: number };
    const store = createStore({ name: 'elf-bench-conc' }, withEntities<Item>());
    store.update(
      setEntities(
        Array.from({ length: concurrency }, (_, i) => ({ id: i, value: 0 }))
      )
    );

    const start = performance.now();
    for (let u = 0; u < updatesPerWorker; u++) {
      store.update(
        updateAllEntities((e: Item) => ({ ...e, value: (e.value + 1) | 0 }))
      );
    }
    // consume
    const first = store.query(getAllEntities())[0];
    if (first && first.value === -1) console.log('noop');
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    type Item = { id: number; score: number; tags: string[]; group: number };
    const store = createStore({ name: 'elf-bench-mem' }, withEntities<Item>());
    const itemsCount = Math.max(
      BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MIN,
      Math.min(BENCHMARK_CONSTANTS.DATA_SIZE_LIMITS.ENTITY_COUNT.MAX, dataSize)
    );
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));
    store.update(
      setEntities(
        Array.from({ length: itemsCount }, (_, i) => ({
          id: i,
          score: (i * 13) % 997,
          tags: i % 7 === 0 ? ['hot', 'new'] : ['cold'],
          group: i % groups,
        }))
      )
    );

    const start = performance.now();
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const id = t % itemsCount;
      store.update(
        updateEntities(id, (e: Item) => ({
          ...e,
          score: (e.score + 1) | 0,
          tags:
            (t & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.MEMORY_EFFICIENCY) === 0
              ? e.tags.includes('hot')
                ? ['cold']
                : ['hot']
              : e.tags,
        }))
      );
    }
    return performance.now() - start;
  }

  async runDataFetchingBenchmark(): Promise<number> {
    // Simulate data fetching with Elf entity store
    type User = {
      id: number;
      name: string;
      email: string;
      isActive: boolean;
      department: string;
      lastLogin: string;
    };

    const userStore = createStore({ name: 'elf-users' }, withEntities<User>());

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

    // Hydrate users into store
    userStore.update(setEntities(users));

    // Simulate filtering active users (realistic business logic)
    const allUsers = userStore.query(getAllEntities());
    const activeUsers = allUsers.filter((user) => user.isActive);

    // Create filtered store for active users
    const activeUserStore = createStore(
      { name: 'elf-active-users' },
      withEntities<User>()
    );
    activeUserStore.update(setEntities(activeUsers));

    // Simulate additional processing - group by department
    const departmentGroups = activeUsers.reduce((acc, user) => {
      if (!acc[user.department]) {
        acc[user.department] = [];
      }
      acc[user.department].push(user);
      return acc;
    }, {} as Record<string, User[]>);

    // Create stores for each department (Elf pattern)
    const departmentStores: Record<string, any> = {};
    Object.entries(departmentGroups).forEach(([dept, deptUsers]) => {
      departmentStores[dept] = createStore(
        { name: `elf-dept-${dept}` },
        withEntities<User>()
      );
      departmentStores[dept].update(setEntities(deptUsers));
    });

    const duration = performance.now() - start;

    // consume to avoid DCE
    if (userStore.query(getAllEntities()).length === -1) console.log('noop');
    return duration;
  }

  async runRealTimeUpdatesBenchmark(): Promise<number> {
    // Simulate real-time updates with Elf stores
    type Metric = {
      id: number;
      activeUsers: number;
      messagesPerSecond: number;
      systemLoad: number;
      timestamp: number;
    };

    type Message = {
      id: number;
      content: string;
      timestamp: number;
      priority: 'high' | 'normal';
    };

    const metricStore = createStore(
      { name: 'elf-metrics' },
      withEntities<Metric>()
    );

    const messageStore = createStore(
      { name: 'elf-messages' },
      withEntities<Message>()
    );

    const start = performance.now();

    // Simulate 500 real-time metric updates
    for (let i = 0; i < BENCHMARK_CONSTANTS.ITERATIONS.REAL_TIME_UPDATES; i++) {
      const metric: Metric = {
        id: i,
        activeUsers: Math.floor(Math.random() * 1000) + 100,
        messagesPerSecond: Math.floor(Math.random() * 50) + 10,
        systemLoad: Math.random() * 0.8 + 0.1,
        timestamp: Date.now(),
      };

      // Update metrics store
      if (i === 0) {
        metricStore.update(setEntities([metric]));
      } else {
        metricStore.update(updateEntities(0, () => metric));
      }

      // Simulate incoming messages (like chat or notifications)
      if ((i & BENCHMARK_CONSTANTS.YIELD_FREQUENCY.DATA_FETCHING) === 0) {
        const newMessage: Message = {
          id: i,
          content: `Real-time message ${i}`,
          timestamp: Date.now(),
          priority: Math.random() > 0.7 ? 'high' : 'normal',
        };

        // Add message to store
        const currentMessages = messageStore.query(getAllEntities());
        messageStore.update(setEntities([...currentMessages, newMessage]));
      }

      // Yield occasionally to simulate real-time processing
    }

    const duration = performance.now() - start;

    // consume to avoid DCE
    if (metricStore.query(getAllEntities()).length === -1) console.log('noop');
    return duration;
  }

  async runStateSizeScalingBenchmark(): Promise<number> {
    // Test performance with large state size (10,000 items)
    type LargeDataItem = {
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
    };

    const largeDataStore = createStore(
      { name: 'elf-large-data' },
      withEntities<LargeDataItem>()
    );

    const start = performance.now();

    // Create large dataset (10,000 items)
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      id: i + 1,
      title: `Item ${i + 1}`,
      description: `Description for item ${
        i + 1
      } with some additional text to make it realistic`,
      category: `Category ${Math.floor(i / 100) + 1}`,
      status: Math.random() > 0.5 ? ('active' as const) : ('inactive' as const),
      metadata: {
        createdAt: new Date().toISOString(),
        tags: [`tag${i % 10}`, `tag${i % 7}`, `tag${i % 5}`],
        score: Math.random() * 100,
      },
    }));

    // Hydrate the large dataset
    largeDataStore.update(setEntities(largeDataset));

    // Perform operations that would be common with large datasets
    // 1. Filter by status (creating new store for active items)
    const allItems = largeDataStore.query(getAllEntities());
    const activeItems = allItems.filter((item) => item.status === 'active');

    const activeItemStore = createStore(
      { name: 'elf-active-items' },
      withEntities<LargeDataItem>()
    );
    activeItemStore.update(setEntities(activeItems));

    // 2. Sort by score (expensive operation)
    const sortedItems = [...activeItems].sort(
      (a, b) => b.metadata.score - a.metadata.score
    );

    const sortedItemStore = createStore(
      { name: 'elf-sorted-items' },
      withEntities<LargeDataItem>()
    );
    sortedItemStore.update(setEntities(sortedItems));

    // 3. Update multiple items (batch update simulation)
    for (
      let i = 0;
      i < BENCHMARK_CONSTANTS.ITERATIONS.STATE_SIZE_SCALING;
      i++
    ) {
      const randomIndex = Math.floor(Math.random() * largeDataset.length);
      largeDataStore.update(
        updateEntities(randomIndex + 1, (item) => ({
          ...item,
          metadata: {
            ...item.metadata,
            score: Math.random() * 100,
            lastModified: new Date().toISOString(),
          },
        }))
      );

    }

    const duration = performance.now() - start;

    // consume to avoid DCE
    if (largeDataStore.query(getAllEntities()).length === -1)
      console.log('noop');
    return duration;
  }
}
