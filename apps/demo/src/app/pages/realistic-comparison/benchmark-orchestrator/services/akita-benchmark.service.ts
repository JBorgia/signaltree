import { Injectable } from '@angular/core';
import { EntityState, EntityStore, ID, StoreConfig } from '@datorama/akita';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class AkitaBenchmarkService {
  // Akita is entity-centric; we will use plain objects for nested/other cases
  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
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
    for (let i = 0; i < dataSize; i++) {
      state = updateDeep(state, depth - 1, i);
      if ((i & 1023) === 0) await this.yieldToUI();
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
    const updates = Math.min(1000, dataSize);
    for (let i = 0; i < updates; i++) {
      const id = i % dataSize;
      store.update(id, { value: Math.random() * 1000 });
      if ((i & 255) === 0) await this.yieldToUI();
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
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
    };
    const compute = () => {
      let acc = 0;
      for (const f of state.factors)
        acc += Math.sin(state.value * f) * Math.cos(f);
      return acc;
    };

    const start = performance.now();
    for (let i = 0; i < dataSize; i++) {
      state = { ...state, value: i };
      compute();
      if ((i & 1023) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
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
      if ((b & 7) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    type Item = { id: ID; flag: boolean };
    type ItemsState = EntityState<Item>;
    @StoreConfig({ name: 'akita-bench-select', idKey: 'id' })
    class ItemsStore extends EntityStore<ItemsState, Item, number> {
      constructor() {
        super({});
      }
    }
    const store = new ItemsStore();
    store.add(
      Array.from({ length: dataSize }, (_, i) => ({ id: i, flag: i % 2 === 0 }))
    );

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      // count even flags
      let c = 0;
      const val = store.getValue();
      const ids = ((val.ids as ID[]) ?? []) as ID[];
      const ents =
        (val.entities as Record<ID, Item>) ?? ({} as Record<ID, Item>);
      for (const id of ids) if (ents[id]?.flag) c++;
      if (c === -1) console.log('noop');
      if ((i & 63) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
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

    // minor churn
    for (let i = 0; i < 10; i++) {
      const idx = i % users.length;
      users[idx].active = !users[idx].active;
    }

    const t0 = performance.now();
    const plain = state; // already plain
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
    concurrency = 50,
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
      if ((u & 31) === 0) await this.yieldToUI();
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

    const itemsCount = Math.max(1_000, Math.min(50_000, dataSize));
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
          (t & 63) === 0
            ? e.tags.includes('hot')
              ? ['cold']
              : ['hot']
            : e.tags,
      }));
      if ((t & 63) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }
}
