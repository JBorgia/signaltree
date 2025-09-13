/* Shared benchmark runner to standardize warmups, measurement, and memory deltas */

export interface RunOptions {
  // Number of operations to perform within a single benchmark run
  operations: number;
  // Warmup operations before timing begins
  warmup?: number;
  // Yield frequency to keep UI responsive (0 to disable)
  yieldEvery?: number;
  // Whether to attempt heap delta measurement
  trackMemory?: boolean;
  // A label for logging caps/warnings
  label?: string;
  // Optional cap applied to operations; logs a one-time warning if hit
  operationsCap?: number;
  // Ensure total timed window is long enough to avoid quantization; internally repeats work and normalizes
  minDurationMs?: number;
}

// Narrow typing for performance.memory when available
const PerfWithMemory = performance as Performance & {
  memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number };
};

const warnedCaps = new Set<string>();

function applyCap(value: number, cap: number | undefined, label?: string) {
  if (cap == null) return value;
  const capped = Math.min(value, cap);
  if (capped < value && label && !warnedCaps.has(label)) {
    console.warn(
      `[BenchRunner] Cap applied to ${label}: requested=${value}, cap=${cap}. You can raise this in configuration for scaling tests.`
    );
    warnedCaps.add(label);
  }
  return capped;
}

function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export async function runTimed(
  runOnce: (i: number) => void | Promise<void>,
  options: RunOptions
): Promise<{ durationMs: number; memoryDeltaMB?: number }> {
  const warmup = Math.max(0, options.warmup ?? 0);
  const yieldEvery = Math.max(0, options.yieldEvery ?? 0);
  const operations = applyCap(
    options.operations,
    options.operationsCap,
    options.label
  );

  // Warmup phase (not timed)
  for (let i = 0; i < warmup; i++) {
    await runOnce(i);
    if (yieldEvery && (i + 1) % yieldEvery === 0) {
      await yieldToUI();
    }
  }

  const memBefore =
    options.trackMemory && PerfWithMemory.memory
      ? PerfWithMemory.memory.usedJSHeapSize
      : undefined;

  // Small idle to reduce GC overlap with timing
  if (options.trackMemory) {
    await yieldToUI();
    if ('requestIdleCallback' in window) {
      await new Promise<void>((resolve) =>
        (
          window as unknown as {
            requestIdleCallback: (
              cb: () => void,
              opts?: { timeout?: number }
            ) => void;
          }
        ).requestIdleCallback(() => resolve(), { timeout: 50 })
      );
    }
  }

  // Optionally repeat the operation block to reach a minimum timing window
  let repeats = 1;
  let durationAccum = 0;
  const minDurationMs = Math.max(0, options.minDurationMs ?? 0);
  let continueLoop = true;
  do {
    const t0 = performance.now();
    for (let i = 0; i < operations; i++) {
      await runOnce(i);
      if (yieldEvery && (i + 1) % yieldEvery === 0) {
        await yieldToUI();
      }
    }
    const t1 = performance.now();
    durationAccum += t1 - t0;
    if (durationAccum < minDurationMs) {
      repeats++;
      // Guard to avoid runaway loops
      if (repeats > 64) continueLoop = false;
    } else {
      continueLoop = false;
    }
  } while (continueLoop);

  const memAfter =
    options.trackMemory && PerfWithMemory.memory
      ? PerfWithMemory.memory.usedJSHeapSize
      : undefined;

  const memoryDeltaMB =
    memBefore !== undefined && memAfter !== undefined
      ? (memAfter - memBefore) / (1024 * 1024)
      : undefined;

  // Normalize duration to a single block of `operations` by dividing repeats
  return { durationMs: durationAccum / repeats, memoryDeltaMB };
}
