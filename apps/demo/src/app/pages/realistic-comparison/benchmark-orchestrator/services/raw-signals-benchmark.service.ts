import { computed, Injectable, signal } from '@angular/core';

import { BENCHMARK_CONSTANTS } from '../shared/benchmark-constants';
import { BenchmarkResult } from './_types';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Raw Angular Signals baseline.
 *
 * This is the "just use native signals" comparison — the central question
 * SignalTree must answer (RFC L1). It deliberately uses ONLY `signal()` and
 * `computed()` with the idioms a developer (or AI agent) writes before reaching
 * for a state library: a single signal holding a state slice, updated
 * immutably (spread/slice/map), with `computed()` for derived values.
 *
 * It is NOT hand-rolled per-leaf signals (that is precisely the boilerplate
 * SignalTree automates) — modelling that would just be re-implementing
 * SignalTree by hand. So this baseline shows the cost of the naive native
 * approach: whole-slice invalidation on every write.
 *
 * Scenarios SignalTree-specific features cover (time-travel, middleware,
 * enterprise diff) are intentionally not implemented and report as N/A.
 */
@Injectable({ providedIn: 'root' })
export class RawSignalsBenchmarkService {
  private sink: unknown;

  private toResult(durationMs: number, notes?: string): BenchmarkResult {
    return { durationMs: Math.round(durationMs * 100) / 100, notes };
  }

  async runDeepNestedBenchmark(
    dataSize: number,
    depth = BENCHMARK_CONSTANTS.DATA_GENERATION.NESTED_DEPTH
  ): Promise<number | BenchmarkResult> {
    type Nested = { value?: number; data?: string; level?: Nested };
    const createNested = (level: number): Nested =>
      level === 0 ? { value: 0, data: 'test' } : { level: createNested(level - 1) };
    const updateDeep = (obj: Nested, level: number, value: number): Nested =>
      level === 0
        ? { ...obj, value }
        : { ...obj, level: updateDeep(obj.level ?? {}, level - 1, value) };

    const start = performance.now();
    // Single signal holding the whole nested object — the naive native shape.
    const state = signal<Nested>(createNested(depth));
    const iterations = Math.min(
      dataSize,
      BENCHMARK_CONSTANTS.ITERATIONS.DEEP_NESTED
    );
    for (let i = 0; i < iterations; i++) {
      state.set(updateDeep(state(), depth - 1, i)); // immutable spine rebuild
    }
    this.sink = state();
    return this.toResult(performance.now() - start, 'Raw signals deep nested');
  }

  async runArrayBenchmark(dataSize: number): Promise<number | BenchmarkResult> {
    const start = performance.now();
    const items = signal(
      Array.from({ length: dataSize }, (_, i) => ({ id: i, value: Math.random() * 1000 }))
    );
    const updates = Math.min(BENCHMARK_CONSTANTS.ITERATIONS.ARRAY_UPDATES, dataSize);
    for (let i = 0; i < updates; i++) {
      const idx = i % dataSize;
      items.update((arr) => {
        const next = arr.slice();
        next[idx] = { ...next[idx], value: Math.random() * 1000 };
        return next;
      });
    }
    this.sink = items().length;
    return this.toResult(performance.now() - start, 'Raw signals array updates');
  }

  async runComputedBenchmark(dataSize: number): Promise<number | BenchmarkResult> {
    const start = performance.now();
    const value = signal(0);
    const factors = signal(Array.from({ length: 50 }, (_, i) => i + 1));
    const compute = computed(() => {
      const v = value();
      let acc = 0;
      for (const f of factors()) acc += Math.sin(v * f) * Math.cos(f);
      return acc;
    });
    const iterations = Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.COMPUTED);
    for (let i = 0; i < iterations; i++) {
      value.set(i);
      this.sink = compute(); // memoized recompute on dependency change
    }
    return this.toResult(performance.now() - start, 'Raw signals computed chains');
  }

  async runBatchUpdatesBenchmark(
    batches = 100,
    batchSize = 1000
  ): Promise<number | BenchmarkResult> {
    const start = performance.now();
    const items = signal(Array.from({ length: batchSize }, (_, i) => i));
    for (let b = 0; b < batches; b++) {
      // New array reference each batch so the signal actually notifies.
      items.update((arr) => arr.map((x) => (x + 1) | 0));
    }
    this.sink = items().length;
    return this.toResult(performance.now() - start, 'Raw signals batch updates');
  }

  async runSelectorBenchmark(dataSize: number): Promise<number | BenchmarkResult> {
    const start = performance.now();
    const items = signal(
      Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        flag: i % 2 === 0,
        value: Math.random() * 100,
        metadata: { category: i % 5, priority: i % 3 },
      }))
    );
    const selectEven = computed(() => items().filter((x) => x.flag).length);
    const selectHighValue = computed(() => items().filter((x) => x.value > 50).length);
    const iterations = Math.min(dataSize, BENCHMARK_CONSTANTS.ITERATIONS.SELECTOR);
    for (let i = 0; i < iterations; i++) {
      // Touch the collection so selectors re-evaluate (memoized).
      items.update((arr) => {
        const next = arr.slice();
        const idx = i % arr.length;
        next[idx] = { ...next[idx], value: Math.random() * 100 };
        return next;
      });
      this.sink = selectEven() + selectHighValue();
    }
    return this.toResult(performance.now() - start, 'Raw signals selectors');
  }

  async runServerPayloadSyncBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const size = Math.max(500, Math.min(20000, dataSize));
    const churn = Math.max(1, Math.floor(size * 0.1));
    const initial: Record<string, number> = {};
    const payload: Record<string, number> = {};
    for (let i = 0; i < size; i++) {
      initial[`k${i}`] = i;
      payload[`k${i}`] = i < churn ? i + 1_000_000 : i;
    }
    const state = signal<Record<string, number>>(initial);
    let toggle = false;

    const start = performance.now();
    // Naive native merge: spread every key regardless of churn (no diff/
    // ref-skip). This is the cost SignalTree's ref-equality short-circuit and
    // enterprise diff engine avoid.
    const next = toggle ? initial : payload;
    toggle = !toggle;
    state.set({ ...state(), ...next });
    this.sink = state();
    return this.toResult(performance.now() - start, 'Raw signals server-payload sync');
  }

  async runSerializationBenchmark(
    dataSize: number
  ): Promise<number | BenchmarkResult> {
    const state = signal({
      items: Array.from({ length: dataSize }, (_, i) => ({
        id: i,
        value: Math.random() * 1000,
        meta: { category: i % 5 },
      })),
    });
    const start = performance.now();
    this.sink = JSON.stringify(state()); // raw signal value is already plain
    return this.toResult(performance.now() - start, 'Raw signals serialization');
  }

  async runSubscriberScalingBenchmark(subscriberCount: number): Promise<number> {
    const start = performance.now();
    const counter = signal(0);
    const subscribers: Array<() => number> = [];
    for (let i = 0; i < subscriberCount; i++) {
      subscribers.push(computed(() => counter() * (i + 1) + Math.sin(counter() * 0.1)));
    }
    const updates = Math.min(1000, BENCHMARK_CONSTANTS.ITERATIONS.SUBSCRIBER_SCALING);
    for (let i = 0; i < updates; i++) {
      counter.set(i);
      for (const s of subscribers) s();
    }
    return performance.now() - start;
  }
}
