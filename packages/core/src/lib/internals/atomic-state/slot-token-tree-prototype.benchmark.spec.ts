import { mkdirSync, writeFileSync } from 'node:fs';

import { signal } from '@angular/core';
import { describe, it } from 'vitest';

import { createSlotTokenTreePrototype } from './slot-token-tree-prototype';

const RUN_TIMING = process.env['ST_PERF'] === '1';
const timingDescribe = describe.runIf(RUN_TIMING);
const OUTPUT_FILE = process.env['ST_PERF_OUTPUT_FILE'];
const FLAT_SIZES = [10, 100, 1_000, 10_000] as const;
const FRAME_WRITE_COUNTS = [1, 10, 100] as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchmark(fn: () => void, warmup = 50, runs = 50): number {
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

function timeFrameCommit(size: number, writeCount: number): number {
  const prototype = createSlotTokenTreePrototype(buildFlatState(size));
  const leaves = Array.from({ length: writeCount }, (_, index) => {
    const key = `leaf_${index}` as keyof typeof prototype.tree.$;
    return prototype.tree.$[key] as unknown as {
      (): number;
      set(value: number): void;
    };
  });
  let toggle = false;

  return benchmark(() => {
    toggle = !toggle;
    const frame = prototype.beginFrame();
    for (let index = 0; index < leaves.length; index++) {
      frame.set(leaves[index], toggle ? size + index : index);
    }
    frame.commit();
  });
}

timingDescribe('Benchmark: slot-token tree prototype', () => {
  it('compares read, write, and frame costs across flat slot counts', () => {
    const rows = FLAT_SIZES.map((size) => {
      const native = signal(0);
      const prototype = createSlotTokenTreePrototype(buildFlatState(size));
      const key = `leaf_${Math.floor(size / 2)}` as keyof typeof prototype.tree.$;
      const leaf = prototype.tree.$[key] as unknown as {
        (): number;
        set(value: number): void;
      };

      const slotTokenReadMs = benchmark(() => {
        for (let index = 0; index < 10_000; index++) {
          leaf();
        }
      });
      const nativeReadMs = benchmark(() => {
        for (let index = 0; index < 10_000; index++) {
          native();
        }
      });

      let nativeToggle = false;
      let tokenToggle = false;
      const nativeWriteMs = benchmark(() => {
        nativeToggle = !nativeToggle;
        native.set(nativeToggle ? size : size + 1);
      });
      const slotTokenWriteMs = benchmark(() => {
        tokenToggle = !tokenToggle;
        leaf.set(tokenToggle ? size : size + 1);
      });

      const row: Record<string, string | number | null> = {
        slots: size,
        nativeReadMs: Number(nativeReadMs.toFixed(4)),
        slotTokenReadMs: Number(slotTokenReadMs.toFixed(4)),
        nativeWriteMs: Number(nativeWriteMs.toFixed(4)),
        slotTokenWriteMs: Number(slotTokenWriteMs.toFixed(4)),
      };

      for (const writeCount of FRAME_WRITE_COUNTS) {
        row[`frame${writeCount}Ms`] =
          writeCount <= size ? Number(timeFrameCommit(size, writeCount).toFixed(4)) : null;
      }

      return row;
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
