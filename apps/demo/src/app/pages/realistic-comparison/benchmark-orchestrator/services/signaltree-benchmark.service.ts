import { Injectable } from '@angular/core';
import {
  withBatching,
  withHighPerformanceBatching,
} from '@signaltree/batching';
import { signalTree } from '@signaltree/core';
import { withMemoization } from '@signaltree/memoization';
import { withSerialization } from '@signaltree/serialization';

/* eslint-disable @typescript-eslint/no-explicit-any */
@Injectable({ providedIn: 'root' })
export class SignalTreeBenchmarkService {
  // Narrow typing for performance.memory when available
  private static PerfWithMemory = {} as Performance & {
    memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
  };
  private yieldToUI() {
    return new Promise<void>((r) => setTimeout(r));
  }

  async runDeepNestedBenchmark(dataSize: number, depth = 15): Promise<number> {
    const start = performance.now();

    const createNested = (level: number): any =>
      level === 0
        ? { value: 0, data: 'test' }
        : { level: createNested(level - 1) };

    const tree = signalTree(createNested(depth)).with(
      withBatching(),
      withMemoization()
    );

    for (let i = 0; i < dataSize; i++) {
      let current: any = tree.state;
      for (let j = 0; j < depth; j++) {
        if (!current?.level) break;
        current = current.level;
      }
      // At leaf, value is a signal accessor function; call setter via .set
      if (current?.value && typeof current.value.set === 'function') {
        current.value.set(i);
      } else if (typeof current?.value === 'function') {
        // Fallback in case of different signal shape
        current.value(i);
      }
      if ((i & 1023) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runArrayBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const tree = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
      })),
    }).with(withHighPerformanceBatching());

    const updates = Math.min(1000, dataSize);
    for (let i = 0; i < updates; i++) {
      (tree.state as any)['items'].update((items: any[]) => {
        items[i % items.length].value = Math.random() * 1000;
        return items;
      });
      if ((i & 255) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runComputedBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const tree = signalTree({
      value: 0,
      factors: Array.from({ length: 50 }, (_, i) => i + 1),
    }).with(withBatching(), withMemoization());

    // simple computed-style workload
    const compute = () => {
      const v = tree.state.value();
      let acc = 0;
      for (const f of tree.state.factors())
        acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    };

    for (let i = 0; i < dataSize; i++) {
      tree.state.value.set(i);
      compute();
      if ((i & 1023) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
  ): Promise<number> {
    const start = performance.now();

    const tree = signalTree({
      items: Array.from({ length: batchSize }, (_, i) => i),
    }).with(withHighPerformanceBatching());

    for (let b = 0; b < batches; b++) {
      (tree.state as any)['items'].update((arr: any[]) => {
        for (let i = 0; i < batchSize; i++) {
          arr[i] = (arr[i] + 1) | 0;
        }
        return arr;
      });
      if ((b & 7) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSelectorBenchmark(dataSize: number): Promise<number> {
    const start = performance.now();

    const tree = signalTree({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
      })),
    }).with(withMemoization());

    const selectEven = () => tree.state.items().filter((x) => x.flag).length;

    for (let i = 0; i < 1000; i++) {
      selectEven();
      if ((i & 63) === 0) await this.yieldToUI();
    }

    return performance.now() - start;
  }

  async runSerializationBenchmark(dataSize: number): Promise<number> {
    // Build a moderately nested, mixed structure to serialize
    const tree = signalTree({
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
        flags: {
          a: true,
          b: false,
          c: iota(8).reduce(
            (o, j) => ({ ...o, [j]: j % 2 === 0 }),
            {} as Record<number, boolean>
          ),
        },
      },
    }).with(
      withMemoization(),
      withHighPerformanceBatching(),
      withSerialization({ preserveTypes: false, includeMetadata: false })
    );

    // Helper to avoid ts errors
    function iota(n: number) {
      return Array.from({ length: n }, (_, i) => i);
    }

    // Mutate a little so shape stabilizes
    for (let i = 0; i < 10; i++) {
      (tree.state as any)['users'].update((arr: any[]) => {
        const idx = i % arr.length;
        (arr[idx] as any).active = !(arr[idx] as any).active;
        return arr;
      });
    }

    // Measure snapshot (unwrap) separately from stringify for fairness
    const t0 = performance.now();
    const snapshot = tree.snapshot();
    const t1 = performance.now();
    JSON.stringify({ data: snapshot.data });
    const t2 = performance.now();

    // Log split timings for investigation
    console.debug(
      '[SignalTree][serialization] snapshot(ms)=',
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
    // Simulate concurrent writers updating disjoint segments
    const tree = signalTree({
      counters: Array.from({ length: concurrency }, () => ({ value: 0 })),
    }).with(withHighPerformanceBatching(), withMemoization());

    const start = performance.now();

    const workers = Array.from({ length: concurrency }, (_, idx) =>
      (async () => {
        // Stagger start to interleave across microtasks
        await new Promise((r) => setTimeout(r, idx % 4));
        for (let u = 0; u < updatesPerWorker; u++) {
          const target = idx;
          (tree.state as any)['counters'].update((arr: any[]) => {
            // mutate in place for performance
            arr[target].value = (arr[target].value + 1) | 0;
            return arr;
          });
          if ((u & 31) === 0) await this.yieldToUI();
        }
      })()
    );

    await Promise.all(workers);
    return performance.now() - start;
  }

  async runMemoryEfficiencyBenchmark(dataSize: number): Promise<number> {
    // Build a sizable hierarchical tree; perform limited churn and log memory deltas
    const itemsCount = Math.max(1_000, Math.min(50_000, dataSize));
    const groups = Math.max(10, Math.min(200, Math.floor(itemsCount / 250)));

    const beforeMem =
      (performance as typeof SignalTreeBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;

    const tree = signalTree({
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
    }).with(withMemoization(), withBatching());

    const start = performance.now();

    // Touch ~1% of items across groups
    const touches = Math.max(100, Math.floor(itemsCount * 0.01));
    for (let t = 0; t < touches; t++) {
      const g = t % groups;
      (tree.state as any)['groups'][g]['items'].update((arr: any[]) => {
        const idx = t % arr.length;
        const it = arr[idx];
        it.score = (it.score + 1) | 0;
        if ((t & 63) === 0)
          it.tags = it.tags.includes('hot') ? ['cold'] : ['hot'];
        return arr;
      });
      if ((t & 63) === 0) await this.yieldToUI();
    }

    const duration = performance.now() - start;
    const afterMem =
      (performance as typeof SignalTreeBenchmarkService.PerfWithMemory).memory
        ?.usedJSHeapSize ?? null;
    if (beforeMem != null && afterMem != null) {
      const deltaMB = (afterMem - beforeMem) / (1024 * 1024);
      console.debug(
        '[SignalTree][memory] usedJSHeapSize ΔMB ~',
        deltaMB.toFixed(2)
      );
    }

    return duration;
  }
}
