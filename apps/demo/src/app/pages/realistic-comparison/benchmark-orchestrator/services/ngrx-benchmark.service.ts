import { Injectable } from '@angular/core';
import { createAction, createReducer, on, props } from '@ngrx/store';

@Injectable({ providedIn: 'root' })
export class NgRxBenchmarkService {
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };
  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
    const start = performance.now();

    const updateValue = createAction(
      '[Test] Update',
      props<{ value: number }>()
    );

    type Nested = { value?: number; data?: string; level?: Nested };
    const createNested = (level: number): Nested =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    const initialState: Nested = createNested(depth);

    const updateDeep = (obj: Nested, level: number, value: number): Nested => {
      if (level === 0) return { ...obj, value };
      return { ...obj, level: updateDeep(obj.level ?? {}, level - 1, value) };
    };

    const reducer = createReducer(
      initialState,
      on(updateValue, (state, { value }) => updateDeep(state, depth - 1, value))
    );

    let state = initialState;
    for (let i = 0; i < dataSize; i++) {
      state = reducer(state, updateValue({ value: i }));
      if ((i & 1023) === 0) await this.yieldToUI();
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
    const updates = Math.min(1000, dataSize);
    for (let i = 0; i < updates; i++) {
      state = reducer(
        state,
        updateItem({ index: i % dataSize, value: Math.random() * 1000 })
      );
      if ((i & 255) === 0) await this.yieldToUI();
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
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
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

    for (let i = 0; i < dataSize; i++) {
      state = reducer(state, updateValue({ value: i }));
      compute(state);
      if ((i & 1023) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
  ): Promise<number> {
    const start = performance.now();

    const bump = createAction('[Test] Bump', props<{ index: number }>());

    type State = { items: number[] };
    const initialState: State = {
      items: Array.from({ length: batchSize }, (_, i) => i),
    };

    const reducer = createReducer(
      initialState,
      on(bump, (state, { index }) => ({
        ...state,
        items: state.items.map((v, i) => (i === index ? v + 1 : v)),
      }))
    );

    let state = initialState;

    for (let b = 0; b < batches; b++) {
      for (let i = 0; i < batchSize; i++) {
        state = reducer(state, bump({ index: i }));
      }
      if ((b & 7) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    type Item = { id: number; flag: boolean };
    type State = { items: Item[] };

    const initialState: State = {
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    };

    const selectEven = (s: State) => s.items.filter((x) => x.flag).length;

    for (let i = 0; i < 1000; i++) {
      selectEven(initialState);
      if ((i & 63) === 0) await this.yieldToUI();
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
      if ((u & 31) === 0) await this.yieldToUI();
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
      if ((t & 63) === 0) await this.yieldToUI();
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
}
