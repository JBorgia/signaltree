import { BENCHMARK_CONSTANTS } from './benchmark-constants';

// Re-export constants for convenience
export { BENCHMARK_CONSTANTS };

/**
 * Shared utility functions for benchmark services
 * These ensure consistent behavior across all benchmark implementations
 */

/**
 * Standard UI yielding function used by all benchmark services
 * Uses consistent setTimeout parameters for fair comparison
 */
export function createYieldToUI() {
  // Lightweight scheduler: if a positive YIELD_DELAY_MS is configured, use setTimeout
  // Otherwise prefer requestIdleCallback, then microtask MessageChannel, then setTimeout(0)
  function scheduleNextTick(fn: () => void) {
    if (
      typeof BENCHMARK_CONSTANTS.TIMING.YIELD_DELAY_MS === 'number' &&
      BENCHMARK_CONSTANTS.TIMING.YIELD_DELAY_MS > 0
    ) {
      setTimeout(fn, BENCHMARK_CONSTANTS.TIMING.YIELD_DELAY_MS);
      return;
    }

    const ric = (
      window as unknown as {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout?: number }
        ) => void;
      }
    ).requestIdleCallback;

    if (typeof ric === 'function') {
      ric(() => fn(), { timeout: 50 });
      return;
    }

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
      return;
    }

    if (typeof MessageChannel !== 'undefined') {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => fn();
      ch.port2.postMessage(0);
      return;
    }

    setTimeout(fn, 0);
  }

  return function yieldToUI(): Promise<void> {
    return new Promise<void>((resolve) => scheduleNextTick(resolve));
  };
}

/**
 * Determines if the current iteration should yield to UI
 * @param iteration Current iteration number
 * @param frequency Yield frequency constant from BENCHMARK_CONSTANTS.YIELD_FREQUENCY
 */
export function shouldYield(iteration: number, frequency: number): boolean {
  return (iteration & frequency) === 0;
}

/**
 * Safe iteration count calculator that respects benchmark limits
 * @param dataSize Input data size
 * @param maxIterations Maximum allowed iterations for this benchmark type
 */
export function getIterationCount(
  dataSize: number,
  maxIterations: number
): number {
  return Math.min(dataSize, maxIterations);
}

/**
 * Safe data size calculator with scaling and limits
 * @param dataSize Input data size
 * @param multiplier Scaling multiplier
 * @param max Maximum allowed size
 * @param min Minimum allowed size (optional)
 */
export function getScaledDataSize(
  dataSize: number,
  multiplier: number,
  max: number,
  min = 0
): number {
  return Math.max(min, Math.min(dataSize * multiplier, max));
}

/**
 * Generates consistent mock data for array-based benchmarks
 * @param size Array size
 * @param itemGenerator Optional custom item generator
 */
export function generateMockArray<T>(
  size: number,
  itemGenerator?: (index: number) => T
): T[] {
  const defaultGenerator = (i: number) =>
    ({
      id: i,
      value: Math.random() * 1000,
      name: `Item ${i}`,
      category: `Category ${
        i % BENCHMARK_CONSTANTS.DATA_GENERATION.CATEGORY_COUNT
      }`,
      timestamp: Date.now(),
    } as T);

  return Array.from({ length: size }, (_, i) =>
    itemGenerator ? itemGenerator(i) : defaultGenerator(i)
  );
}

/**
 * Generates consistent nested object structure for deep nested benchmarks
 * @param depth Nesting depth
 * @param leafValue Value to place at the deepest level
 */
export function createNestedStructure(
  depth: number,
  leafValue: unknown = 0
): unknown {
  if (depth === 0) {
    return { value: leafValue, data: 'test' };
  }
  return { level: createNestedStructure(depth - 1, leafValue) };
}

/**
 * Standard factors array for computed benchmarks
 */
export function createFactorsArray(): number[] {
  return Array.from(
    { length: BENCHMARK_CONSTANTS.DATA_GENERATION.FACTOR_COUNT },
    (_, i) => i + 1
  );
}

/**
 * Standard compute function for benchmarks that need mathematical operations
 * @param value Input value
 * @param factors Array of factors for computation
 */
export function standardCompute(value: number, factors: number[]): number {
  let acc = 0;
  for (const f of factors) {
    acc += Math.sin(value * f) * Math.cos(f);
  }
  return acc;
}

/**
 * Creates a promise that resolves after a standard async delay
 * Used for simulating async operations consistently
 */
export function simulateAsyncDelay(): Promise<void> {
  return new Promise((resolve) =>
    setTimeout(resolve, BENCHMARK_CONSTANTS.TIMING.ASYNC_DELAY_MS)
  );
}

/**
 * Creates a promise that resolves after a random delay
 * Used for simulating variable async operations
 */
export function simulateRandomAsyncDelay(): Promise<void> {
  const delay = Math.random() * BENCHMARK_CONSTANTS.TIMING.RANDOM_DELAY_MAX_MS;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Batch processing utility that processes items in chunks with yielding
 * @param items Items to process
 * @param processor Function to process each item
 * @param batchSize Size of each batch
 * @param yieldFrequency How often to yield (bitwise frequency)
 */
export async function processBatches<T, R>(
  items: T[],
  processor: (item: T, index: number) => R,
  batchSize = BENCHMARK_CONSTANTS.ITERATIONS.BATCH_SIZE,
  yieldFrequency: number = BENCHMARK_CONSTANTS.YIELD_FREQUENCY.BATCH_UPDATES
): Promise<R[]> {
  const results: R[] = [];
  const yieldToUI = createYieldToUI();

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = batch.map((item, batchIndex) =>
      processor(item, i + batchIndex)
    );
    results.push(...batchResults);

    if (shouldYield(i / batchSize, yieldFrequency)) {
      await yieldToUI();
    }
  }

  return results;
}

/**
 * Standard performance measurement wrapper
 * @param name Benchmark name for logging
 * @param operation Async operation to measure
 */
export async function measurePerformance<T>(
  name: string,
  operation: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();

  const result = await operation();
  const duration = performance.now() - start;

  return { result, duration };
}
