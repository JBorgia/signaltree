import { mkdirSync, writeFileSync } from 'node:fs';

import { computed, signal, type WritableSignal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { timeTravel } from '../enhancers/time-travel/time-travel';

import { getTreeScalarSlotRuntime } from './internals/tree-scalar-slot-angular-runtime';
import { signalTree } from './signal-tree';
import type { ISignalTree } from './types';

const RUN_TIMING = process.env['ST_PERF'] === '1';
const timingDescribe = describe.runIf(RUN_TIMING);
const OUTPUT_FILE = process.env['ST_PERF_OUTPUT_FILE'];
const FLAT_SIZES = [10, 100, 1_000, 10_000] as const;
const READ_ITERATIONS = 1_000_000;
const WRITE_ITERATIONS = 100_000;
const CONSTRUCTION_BATCHES = 20;
const WARMUP_RUNS = 8;
const MEASURE_RUNS = 12;

type ScalarLeaf = WritableSignal<number>;

type BenchmarkRow = {
  variant: 'native' | 'signalTree' | 'signalTree+timeTravel';
  positions: number;
  slotBacked: boolean;
  constructionMs: number;
  leafReadUs: number;
  leafSetUs: number;
  leafUpdateUs: number;
  unrelatedInvalidationUs: number;
};

type BenchmarkHarness = {
  variant: BenchmarkRow['variant'];
  slotBacked: boolean;
  targetLeaf: ScalarLeaf;
  unrelatedLeaf: ScalarLeaf;
  readTarget(): number;
  setTarget(value: number): void;
  updateTarget(updater: (value: number) => number): void;
  setUnrelated(value: number): void;
  destroy(): void;
};

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchmark(fn: () => void, warmup = WARMUP_RUNS, runs = MEASURE_RUNS): number {
  for (let index = 0; index < warmup; index++) {
    fn();
  }

  const samples: number[] = [];
  for (let index = 0; index < runs; index++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }

  return median(samples);
}

function perOperationUs(totalMs: number, iterations: number): number {
  return Number(((totalMs * 1000) / iterations).toFixed(4));
}

function buildFlatState(size: number): Record<string, number> {
  const state: Record<string, number> = {};
  for (let index = 0; index < size; index++) {
    state[`leaf_${index}`] = index;
  }
  return state;
}

function createNativeHarness(size: number): BenchmarkHarness {
  const leaves: Record<string, ScalarLeaf> = {};
  for (let index = 0; index < size; index++) {
    leaves[`leaf_${index}`] = signal(index);
  }

  const targetKey = `leaf_${Math.floor(size / 2)}`;
  const unrelatedKey = 'leaf_0';
  const targetLeaf = leaves[targetKey];
  const unrelatedLeaf = leaves[unrelatedKey === targetKey ? 'leaf_1' : unrelatedKey];

  return {
    variant: 'native',
    slotBacked: false,
    targetLeaf,
    unrelatedLeaf,
    readTarget: () => targetLeaf(),
    setTarget: (value) => targetLeaf.set(value),
    updateTarget: (updater) => targetLeaf.update(updater),
    setUnrelated: (value) => unrelatedLeaf.set(value),
    destroy: () => undefined,
  };
}

function createTreeHarness(
  size: number,
  historyEnabled: boolean
): BenchmarkHarness {
  const tree = (historyEnabled
    ? signalTree(buildFlatState(size)).with(timeTravel())
    : signalTree(buildFlatState(size))) as ISignalTree<Record<string, ScalarLeaf>>;

  const targetKey = `leaf_${Math.floor(size / 2)}` as keyof typeof tree.$;
  const unrelatedKey = ((targetKey as string) === 'leaf_0' ? 'leaf_1' : 'leaf_0') as keyof typeof tree.$;
  const targetLeaf = tree.$[targetKey] as ScalarLeaf;
  const unrelatedLeaf = tree.$[unrelatedKey] as ScalarLeaf;

  return {
    variant: historyEnabled ? 'signalTree+timeTravel' : 'signalTree',
    slotBacked: getTreeScalarSlotRuntime(tree.$) !== undefined,
    targetLeaf,
    unrelatedLeaf,
    readTarget: () => targetLeaf(),
    setTarget: (value) => targetLeaf.set(value),
    updateTarget: (updater) => targetLeaf.update(updater),
    setUnrelated: (value) => unrelatedLeaf.set(value),
    destroy: () => tree.destroy(),
  };
}

function measureConstruction(
  size: number,
  createHarness: () => BenchmarkHarness
): number {
  const totalMs = benchmark(() => {
    const harnesses: BenchmarkHarness[] = [];
    for (let batch = 0; batch < CONSTRUCTION_BATCHES; batch++) {
      harnesses.push(createHarness());
    }

    for (const harness of harnesses) {
      harness.destroy();
    }
  }, 3, 8);

  return Number((totalMs / CONSTRUCTION_BATCHES).toFixed(4));
}

function measureUnrelatedInvalidationUs(harness: BenchmarkHarness): number {
  let recomputeCount = 0;
  const watched = computed(() => {
    recomputeCount += 1;
    return harness.readTarget();
  });

  expect(watched()).toBe(harness.readTarget());
  recomputeCount = 0;

  const totalMs = benchmark(() => {
    for (let iteration = 0; iteration < WRITE_ITERATIONS; iteration++) {
      harness.setUnrelated(iteration);
      watched();
    }
  });

  expect(recomputeCount).toBe(0);
  return perOperationUs(totalMs, WRITE_ITERATIONS);
}

function measureRow(
  size: number,
  createHarness: () => BenchmarkHarness
): BenchmarkRow {
  const constructionMs = measureConstruction(size, createHarness);
  const harness = createHarness();

  try {
    const leafReadUs = perOperationUs(
      benchmark(() => {
        for (let iteration = 0; iteration < READ_ITERATIONS; iteration++) {
          harness.readTarget();
        }
      }),
      READ_ITERATIONS
    );

    let setToggle = false;
    const leafSetUs = perOperationUs(
      benchmark(() => {
        for (let iteration = 0; iteration < WRITE_ITERATIONS; iteration++) {
          setToggle = !setToggle;
          harness.setTarget(setToggle ? size + iteration : iteration);
        }
      }),
      WRITE_ITERATIONS
    );

    const leafUpdateUs = perOperationUs(
      benchmark(() => {
        for (let iteration = 0; iteration < WRITE_ITERATIONS; iteration++) {
          harness.updateTarget((value) => value + 1);
        }
      }),
      WRITE_ITERATIONS
    );

    const unrelatedInvalidationUs = measureUnrelatedInvalidationUs(harness);

    return {
      variant: harness.variant,
      positions: size,
      slotBacked: harness.slotBacked,
      constructionMs,
      leafReadUs,
      leafSetUs,
      leafUpdateUs,
      unrelatedInvalidationUs,
    };
  } finally {
    harness.destroy();
  }
}

function writeRows(rows: readonly BenchmarkRow[]): void {
  if (!OUTPUT_FILE) {
    return;
  }

  const parts = OUTPUT_FILE.split('/');
  parts.pop();
  mkdirSync(parts.join('/'), { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(rows, null, 2));
}

timingDescribe('Benchmark: production scalar substrate', () => {
  it('compares native Angular signals, plain signalTree(), and timeTravel-enabled signalTree()', () => {
    const rows: BenchmarkRow[] = [];

    for (const size of FLAT_SIZES) {
      rows.push(measureRow(size, () => createNativeHarness(size)));
      rows.push(measureRow(size, () => createTreeHarness(size, false)));
      rows.push(measureRow(size, () => createTreeHarness(size, true)));
    }

    writeRows(rows);
    console.table(rows);
  }, 120_000);
});
