import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { signalTree } from './signal-tree';
import { batching } from '../enhancers/batching/batching';
import { memoization } from '../enhancers/memoization/memoization';
import { devTools } from '../enhancers/devtools/devtools';

/**
 * Phase 7: Honest benchmarks
 *
 * These tests quantify signalTree overhead vs raw signals and enhancer costs.
 * They are not micro-benchmarks that produce misleading numbers — they measure
 * real overhead in realistic units and assert bounded slowdown.
 */

const ITERATIONS = 10_000;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchmark(fn: () => void, warmup = 100, runs = 50): number {
  // Warmup
  for (let i = 0; i < warmup; i++) fn();

  // Measure
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

describe('Benchmark: signalTree vs raw signal()', () => {
  it('creation overhead is bounded (< 50x for 20 keys)', () => {
    const rawTime = benchmark(() => {
      for (let i = 0; i < 100; i++) {
        const signals: any = {};
        for (let j = 0; j < 20; j++) {
          signals[`key_${j}`] = signal(j);
        }
      }
    });

    const treeTime = benchmark(() => {
      for (let i = 0; i < 100; i++) {
        const state: Record<string, number> = {};
        for (let j = 0; j < 20; j++) {
          state[`key_${j}`] = j;
        }
        const tree = signalTree(state);
        tree.destroy();
      }
    });

    const ratio = treeTime / rawTime;
    console.log(`Creation: raw=${rawTime.toFixed(2)}ms, tree=${treeTime.toFixed(2)}ms, ratio=${ratio.toFixed(1)}x`);

    // signalTree does more work (recursion, NodeAccessor creation, config init)
    // so some overhead is expected. 50x is a generous bound.
    expect(ratio).toBeLessThan(50);
  });

  it('read overhead is bounded (< 5x per access)', () => {
    const state: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      state[`key_${i}`] = i;
    }

    const signals: Record<string, any> = {};
    for (let i = 0; i < 20; i++) {
      signals[`key_${i}`] = signal(i);
    }
    const tree = signalTree(state);

    const rawTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        signals[`key_${i % 20}`]();
      }
    });

    const treeTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        (tree.$ as any)[`key_${i % 20}`]();
      }
    });

    const ratio = treeTime / rawTime;
    console.log(`Read: raw=${rawTime.toFixed(2)}ms, tree=${treeTime.toFixed(2)}ms, ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeLessThan(5);

    tree.destroy();
  });

  it('write overhead is bounded (< 5x per set)', () => {
    const rawSig = signal(0);
    const tree = signalTree({ value: 0 });

    const rawTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        rawSig.set(i);
      }
    });

    const treeTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        tree.$.value.set(i);
      }
    });

    const ratio = treeTime / rawTime;
    console.log(`Write: raw=${rawTime.toFixed(2)}ms, tree=${treeTime.toFixed(2)}ms, ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeLessThan(5);

    tree.destroy();
  });
});

describe('Benchmark: enhancer overhead', () => {
  it('batching overhead is bounded (< 2x per write)', () => {
    const plain = signalTree({ count: 0 });
    const batched = signalTree({ count: 0 }).with(batching());

    const plainTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        plain.$.count.set(i);
      }
    });

    const batchedTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        batched.$.count.set(i);
      }
    });

    const ratio = batchedTime / plainTime;
    console.log(`Batching: plain=${plainTime.toFixed(2)}ms, batched=${batchedTime.toFixed(2)}ms, ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeLessThan(2);

    plain.destroy();
    batched.destroy();
  });

  it('memoization overhead is bounded (< 3x per read)', () => {
    const plain = signalTree({ count: 0 });
    const memo = signalTree({ count: 0 }).with(memoization());

    const plainTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        plain.$.count();
      }
    });

    const memoTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        memo.$.count();
      }
    });

    const ratio = memoTime / plainTime;
    console.log(`Memoization: plain=${plainTime.toFixed(2)}ms, memo=${memoTime.toFixed(2)}ms, ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeLessThan(3);

    plain.destroy();
    memo.destroy();
  });

  it('devTools (disabled) overhead is near-zero (< 1.5x)', () => {
    const plain = signalTree({ count: 0 });
    const withDt = signalTree({ count: 0 }).with(devTools({ enabled: false }));

    const plainTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        plain.$.count.set(i);
        plain.$.count();
      }
    });

    const dtTime = benchmark(() => {
      for (let i = 0; i < ITERATIONS; i++) {
        withDt.$.count.set(i);
        withDt.$.count();
      }
    });

    const ratio = dtTime / plainTime;
    console.log(`DevTools(disabled): plain=${plainTime.toFixed(2)}ms, devtools=${dtTime.toFixed(2)}ms, ratio=${ratio.toFixed(1)}x`);

    expect(ratio).toBeLessThan(1.5);

    plain.destroy();
    withDt.destroy();
  });
});
