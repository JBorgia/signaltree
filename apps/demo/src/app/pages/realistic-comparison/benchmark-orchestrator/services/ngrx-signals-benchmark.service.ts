import { computed, Injectable } from '@angular/core';
import { patchState, signalState } from '@ngrx/signals';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class NgRxSignalsBenchmarkService {
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };

  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
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
    for (let i = 0; i < dataSize; i++) {
      // immutably patch deep path
      patchState(state, (s: any) => {
        const updateDeep = (obj: any, lvl: number): any =>
          lvl === 0
            ? { ...obj, value: i }
            : { ...obj, level: updateDeep(obj.level ?? {}, lvl - 1) };
        return updateDeep(s, depth - 1);
      });
      if ((i & 1023) === 0) await this.yieldToUI();
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
    const updates = Math.min(1000, dataSize);
    for (let i = 0; i < updates; i++) {
      const idx = i % dataSize;
      patchState(state, (s) => ({
        ...s,
        items: s.items.map((item, j) =>
          j === idx ? { ...item, value: Math.random() * 1000 } : item
        ),
      }));
      if ((i & 255) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const state = signalState({
      value: 0,
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
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
    for (let i = 0; i < dataSize; i++) {
      patchState(state, (s) => ({ ...s, value: i }));
      compute();
      if ((i & 1023) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
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
      if ((b & 7) === 0) await this.yieldToUI();
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
    for (let i = 0; i < 1000; i++) {
      selectEven();
      if ((i & 63) === 0) await this.yieldToUI();
    }
    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    const state = signalState({
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
    // Align with ST snapshot + stringify by explicitly reading values
    const plain = { users: state().users, settings: state().settings };
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
    concurrency = 50,
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
      if ((u & 31) === 0) await this.yieldToUI();
    }

    // consume
    if (state().counters[0].value === -1) console.log('noop');
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    const itemsCount = Math.max(1_000, Math.min(50_000, dataSize));
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
                          (t & 63) === 0
                            ? it.tags.includes('hot')
                              ? ['cold']
                              : ['hot']
                            : it.tags,
                      }
                ),
              }
        ),
      }));
      if ((t & 63) === 0) await this.yieldToUI();
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
}
