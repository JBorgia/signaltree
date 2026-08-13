import { computed } from '@angular/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';

import { signalTree } from '../../signal-tree';

import { createAtomicSignalTreePrototype } from './atomic-signal-tree-prototype';

const RUN_TIMING = process.env['ST_PERF'] === '1';
const timingDescribe = describe.runIf(RUN_TIMING);
const OUTPUT_FILE = process.env['ST_PERF_OUTPUT_FILE'];

type TreeState = Record<string, unknown>;
type Path = readonly string[];
type FrameWrite = { path: Path; value: unknown };
type Scenario = {
  name: string;
  stateFactory: () => TreeState;
  targetPath: Path;
  foreignPath: Path;
  frameWrites: readonly FrameWrite[];
};

const FLAT_SIZES = [1, 10, 100, 1_000] as const;

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

function readPath(root: unknown, path: Path): any {
  let current = root as Record<string, unknown>;
  for (const segment of path) {
    current = current[segment] as Record<string, unknown>;
  }
  return current;
}

function incrementValue(value: unknown): unknown {
  if (typeof value === 'number') {
    return value + 1;
  }
  if (typeof value === 'boolean') {
    return !value;
  }
  if (typeof value === 'string') {
    return `${value}!`;
  }
  throw new Error('Unsupported benchmark leaf type.');
}

function buildScenarios(): readonly Scenario[] {
  const flatScenarios = FLAT_SIZES.map((size) => ({
    name: `flat-${size}`,
    stateFactory: () => buildFlatState(size),
    targetPath: [`leaf_${Math.floor(size / 2)}`],
    foreignPath: ['leaf_0'],
    frameWrites: [
      { path: [`leaf_${Math.floor(size / 2)}`], value: size + 1 },
      {
        path: [`leaf_${Math.min(Math.floor(size / 2) + 1, size - 1)}`],
        value: size + 2,
      },
    ],
  }));

  const nestedScenario: Scenario = {
    name: 'nested-profile',
    stateFactory: () => ({
      profile: {
        identity: {
          score: 1,
          alias: 'alice',
          enabled: true,
          rank: 3,
        },
        preferences: {
          theme: 'light',
          compact: false,
        },
      },
      dashboard: {
        counters: {
          visits: 4,
          alerts: 2,
        },
        flags: {
          loading: false,
        },
      },
      session: {
        active: true,
        tenant: 'demo',
      },
    }),
    targetPath: ['profile', 'identity', 'score'],
    foreignPath: ['dashboard', 'flags', 'loading'],
    frameWrites: [
      { path: ['profile', 'identity', 'score'], value: 2 },
      { path: ['profile', 'identity', 'enabled'], value: false },
    ],
  };

  const appScenario: Scenario = {
    name: 'app-shaped-small',
    stateFactory: () => ({
      session: {
        userId: 42,
        tenant: 'north',
        authenticated: true,
      },
      filters: {
        region: 'west',
        search: '',
        includeClosed: false,
      },
      dashboard: {
        zoom: 1,
        chartMode: 'day',
        selection: 'all',
      },
      inspector: {
        open: false,
        tab: 'summary',
        itemId: 9,
      },
      featureFlags: {
        planner: true,
        realtime: true,
        audit: false,
      },
    }),
    targetPath: ['dashboard', 'zoom'],
    foreignPath: ['inspector', 'open'],
    frameWrites: [
      { path: ['dashboard', 'zoom'], value: 2 },
      { path: ['dashboard', 'chartMode'], value: 'week' },
    ],
  };

  return [...flatScenarios, nestedScenario, appScenario];
}

function createNativeHarness(scenario: Scenario) {
  const tree = signalTree(scenario.stateFactory());
  const target = readPath(tree.$, scenario.targetPath);
  const foreign = readPath(tree.$, scenario.foreignPath);
  return {
    read(): unknown {
      return target();
    },
    set(next: unknown): void {
      target.set(next);
    },
    update(): void {
      target.update((value: unknown) => incrementValue(value));
    },
    unrelatedConsumerRuns(): number | null {
      if (scenario.targetPath.join('.') === scenario.foreignPath.join('.')) {
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

function createAtomicHarness(scenario: Scenario) {
  const prototype = createAtomicSignalTreePrototype(scenario.stateFactory());
  const tree = prototype.tree;
  const target = readPath(tree.$, scenario.targetPath);
  const foreign = readPath(tree.$, scenario.foreignPath);
  return {
    read(): unknown {
      return target();
    },
    set(next: unknown): void {
      target.set(next);
    },
    update(): void {
      target.update((value: unknown) => incrementValue(value));
    },
    unrelatedConsumerRuns(): number | null {
      if (scenario.targetPath.join('.') === scenario.foreignPath.join('.')) {
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
    frameCommit(): void {
      const frame = prototype.beginFrame();
      for (const write of scenario.frameWrites) {
        frame.set(readPath(tree.$, write.path), write.value as never);
      }
      frame.commit();
    },
    rootRevision(): number {
      return prototype.revision();
    },
  };
}

function timeConstruction(scenario: Scenario): { nativeMs: number; atomicMs: number } {
  const nativeMs = benchmark(() => {
    const harness = createNativeHarness(scenario);
    harness.destroy();
  });
  const atomicMs = benchmark(() => {
    createAtomicHarness(scenario);
  });
  return { nativeMs, atomicMs };
}

function timeLeafRead(scenario: Scenario): { nativeMs: number; atomicMs: number } {
  const native = createNativeHarness(scenario);
  const atomic = createAtomicHarness(scenario);

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

function timeLeafSet(scenario: Scenario): { nativeMs: number; atomicMs: number } {
  const native = createNativeHarness(scenario);
  const atomic = createAtomicHarness(scenario);
  let nativeValue = native.read();
  let atomicValue = atomic.read();

  const nativeMs = benchmark(() => {
    nativeValue = incrementValue(nativeValue);
    native.set(nativeValue);
  });
  const atomicMs = benchmark(() => {
    atomicValue = incrementValue(atomicValue);
    atomic.set(atomicValue);
  });

  native.destroy();
  return { nativeMs, atomicMs };
}

function timeLeafUpdate(scenario: Scenario): { nativeMs: number; atomicMs: number } {
  const native = createNativeHarness(scenario);
  const atomic = createAtomicHarness(scenario);

  const nativeMs = benchmark(() => {
    native.update();
  });
  const atomicMs = benchmark(() => {
    atomic.update();
  });

  native.destroy();
  return { nativeMs, atomicMs };
}

function timeAtomicFrameCommit(scenario: Scenario): number {
  return benchmark(() => {
    const atomic = createAtomicHarness(scenario);
    atomic.frameCommit();
  });
}

timingDescribe('Benchmark: atomic signal tree prototype', () => {
  it('reports native vs atomic-backed timings and unrelated-consumer invalidation', () => {
    const rows = buildScenarios().map((scenario) => {
      const construction = timeConstruction(scenario);
      const read = timeLeafRead(scenario);
      const set = timeLeafSet(scenario);
      const update = timeLeafUpdate(scenario);
      const atomicFrameCommitMs = timeAtomicFrameCommit(scenario);
      const nativeInvalidation = createNativeHarness(scenario);
      const atomicInvalidation = createAtomicHarness(scenario);
      const nativeRuns = nativeInvalidation.unrelatedConsumerRuns();
      const atomicRuns = atomicInvalidation.unrelatedConsumerRuns();

      nativeInvalidation.destroy();

      return {
        scenario: scenario.name,
        nativeConstructMs: construction.nativeMs.toFixed(4),
        atomicConstructMs: construction.atomicMs.toFixed(4),
        nativeReadMs: read.nativeMs.toFixed(4),
        atomicReadMs: read.atomicMs.toFixed(4),
        nativeSetMs: set.nativeMs.toFixed(4),
        atomicSetMs: atomicMsToString(set.atomicMs),
        nativeUpdateMs: update.nativeMs.toFixed(4),
        atomicUpdateMs: atomicMsToString(update.atomicMs),
        atomicFrameCommitMs: atomicMsToString(atomicFrameCommitMs),
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
