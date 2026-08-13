import { computed } from '@angular/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';

import { signalTree } from '../../signal-tree';

import { createAtomicSignalTreePrototype } from './atomic-signal-tree-prototype';

const RUN_TIMING = process.env['ST_PERF'] === '1';
const timingDescribe = describe.runIf(RUN_TIMING);
const OUTPUT_FILE = process.env['ST_PERF_OUTPUT_FILE'];

const SIZES = [1, 10, 100, 1_000] as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchmark(fn: () => void, warmup = 25, runs = 25): number {
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

function buildFlatState(size: number): Record<string, number> {
  const state: Record<string, number> = {};
  for (let index = 0; index < size; index++) {
    state[`leaf_${index}`] = index;
  }
  return state;
}

function leafKey(size: number): string {
  return `leaf_${Math.floor(size / 2)}`;
}

function foreignKey(size: number): string {
  return 'leaf_0';
}

type NativeHarness = ReturnType<typeof createNativeHarness>;
type AtomicHarness = ReturnType<typeof createAtomicHarness>;

function createNativeHarness(size: number) {
  const tree = signalTree(buildFlatState(size));
  const target = tree.$[leafKey(size)]!;
  const foreign = tree.$[foreignKey(size)]!;
  return {
    read(): number {
      return target();
    },
    set(next: number): void {
      target.set(next);
    },
    update(): void {
      target.update((value) => value + 1);
    },
    unrelatedConsumerRuns(): number | null {
      if (size === 1) {
        return null;
      }
      let runs = 0;
      const consumer = computed(() => {
        runs++;
        return target();
      });
      consumer();
      foreign.set(foreign() + 1);
      consumer();
      return runs;
    },
    destroy(): void {
      tree.destroy();
    },
  };
}

function createAtomicHarness(size: number) {
  const prototype = createAtomicSignalTreePrototype(buildFlatState(size));
  const tree = prototype.tree;
  const target = tree.$[leafKey(size)]!;
  const foreign = tree.$[foreignKey(size)]!;
  return {
    read(): number {
      return target();
    },
    set(next: number): void {
      target.set(next);
    },
    update(): void {
      target.update((value) => value + 1);
    },
    unrelatedConsumerRuns(): number | null {
      if (size === 1) {
        return null;
      }
      let runs = 0;
      const consumer = computed(() => {
        runs++;
        return target();
      });
      consumer();
      foreign.set(foreign() + 1);
      consumer();
      return runs;
    },
  };
}

function timeConstruction(size: number): { nativeMs: number; atomicMs: number } {
  const nativeMs = benchmark(() => {
    const harness = createNativeHarness(size);
    harness.destroy();
  });
  const atomicMs = benchmark(() => {
    createAtomicHarness(size);
  });
  return { nativeMs, atomicMs };
}

function timeLeafRead(size: number): { nativeMs: number; atomicMs: number } {
  const native = createNativeHarness(size);
  const atomic = createAtomicHarness(size);

  const nativeMs = benchmark(() => {
    for (let index = 0; index < 10_000; index++) {
      native.read();
    }
  });
  const atomicMs = benchmark(() => {
    for (let index = 0; index < 10_000; index++) {
      atomic.read();
    }
  });

  native.destroy();
  return { nativeMs, atomicMs };
}

function timeLeafSet(size: number): { nativeMs: number; atomicMs: number } {
  const native = createNativeHarness(size);
  const atomic = createAtomicHarness(size);
  let nativeValue = 0;
  let atomicValue = 0;

  const nativeMs = benchmark(() => {
    nativeValue ^= 1;
    native.set(nativeValue);
  });
  const atomicMs = benchmark(() => {
    atomicValue ^= 1;
    atomic.set(atomicValue);
  });

  native.destroy();
  return { nativeMs, atomicMs };
}

function timeLeafUpdate(size: number): { nativeMs: number; atomicMs: number } {
  const native = createNativeHarness(size);
  const atomic = createAtomicHarness(size);

  const nativeMs = benchmark(() => {
    native.update();
  });
  const atomicMs = benchmark(() => {
    atomic.update();
  });

  native.destroy();
  return { nativeMs, atomicMs };
}

timingDescribe('Benchmark: atomic signal tree prototype', () => {
  it('reports native vs atomic-backed timings and unrelated-consumer invalidation', () => {
    const rows = SIZES.map((size) => {
      const construction = timeConstruction(size);
      const read = timeLeafRead(size);
      const set = timeLeafSet(size);
      const update = timeLeafUpdate(size);
      const nativeInvalidation = createNativeHarness(size);
      const atomicInvalidation = createAtomicHarness(size);
      const nativeRuns = nativeInvalidation.unrelatedConsumerRuns();
      const atomicRuns = atomicInvalidation.unrelatedConsumerRuns();

      nativeInvalidation.destroy();

      return {
        size,
        nativeConstructMs: construction.nativeMs.toFixed(4),
        atomicConstructMs: construction.atomicMs.toFixed(4),
        nativeReadMs: read.nativeMs.toFixed(4),
        atomicReadMs: read.atomicMs.toFixed(4),
        nativeSetMs: set.nativeMs.toFixed(4),
        atomicSetMs: atomicMsToString(set.atomicMs),
        nativeUpdateMs: update.nativeMs.toFixed(4),
        atomicUpdateMs: atomicMsToString(update.atomicMs),
        nativeUnrelatedConsumerRuns: nativeRuns,
        atomicUnrelatedConsumerRuns: atomicRuns,
      };
    });

    if (OUTPUT_FILE) {
      const parts = OUTPUT_FILE.split('/');
      parts.pop();
      mkdirSync(parts.join('/'), { recursive: true });
      writeFileSync(OUTPUT_FILE, JSON.stringify(rows, null, 2));
    }

    console.table(rows);
  });
});

function atomicMsToString(value: number): string {
  return value.toFixed(4);
}
