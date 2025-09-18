/* Enhanced benchmark runner with statistical analysis and reliability assessment */

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

// Enhanced benchmark options for statistical analysis
export interface EnhancedBenchmarkOptions extends RunOptions {
  // Number of measurement samples to collect
  measurementSamples?: number;
  // Maximum total runtime to prevent runaway tests
  maxRuntimeMs?: number;
  // Remove statistical outliers from results
  removeOutliers?: boolean;
  // Minimum samples required for reliable results
  minSamples?: number;
  // Force garbage collection attempts
  forceGC?: boolean;
  // Statistical confidence level for comparisons
  confidenceLevel?: number;
  // Optional non-blocking progress callback invoked with { samplesCollected, elapsedMs }
  onProgress?: (progress: {
    samplesCollected: number;
    elapsedMs: number;
  }) => void;
}

// Enhanced result with statistical metrics
export interface EnhancedBenchmarkResult {
  // Basic timing metrics
  median: number;
  mean: number;
  min: number;
  max: number;
  p95: number;
  p99: number;
  stdDev: number;
  // Sample data
  samples: number[];
  sampleCount: number;
  totalIterations: number;
  totalRuntimeMs: number;
  // Memory tracking
  memoryDeltaMB?: number;
  // Reliability assessment
  reliability: 'high' | 'medium' | 'low';
  coefficientOfVariation: number;
  // Anomaly detection
  outlierCount: number;
  anomalyRate: number;
  recommendation: string;
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

// Lightweight scheduler util: prefers queueMicrotask, falls back to MessageChannel, then setTimeout
function scheduleNextTick(fn: () => void) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
    return;
  }

  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      fn();
    };
    ch.port2.postMessage(0);
    return;
  }

  setTimeout(fn, 0);
}

export function yieldToUI(): Promise<void> {
  // Prefer requestIdleCallback when the caller wants background idle time
  const ric = (
    window as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number }
      ) => void;
    }
  ).requestIdleCallback;

  if (typeof ric === 'function') {
    return new Promise<void>((resolve) => {
      ric(() => resolve(), { timeout: 50 });
    });
  }

  return new Promise((resolve) => scheduleNextTick(resolve));
}

// Coalesced UI update queue: schedule non-blocking progress callbacks using RAF
function createUIUpdateQueue() {
  let pending = false;
  let payload: unknown = undefined;

  function schedule(p: unknown, cb?: (p: unknown) => void) {
    payload = p;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      try {
        cb?.(payload);
      } finally {
        payload = undefined;
      }
    });
  }

  return { schedule };
}

const uiUpdateQueue = createUIUpdateQueue();

// Enhanced statistical utilities
export class BenchmarkStatistics {
  static percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  static standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
    const variance =
      squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  static removeStatisticalOutliers(
    samples: number[],
    maxRemovalRate = 0.2
  ): number[] {
    if (samples.length < 4) return samples;

    const sorted = [...samples].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const filtered = samples.filter((x) => x >= lowerBound && x <= upperBound);

    // Don't remove more than maxRemovalRate of samples
    if (filtered.length < samples.length * (1 - maxRemovalRate)) {
      return samples;
    }

    return filtered;
  }

  static assessReliability(
    samples: number[],
    totalRuntimeMs: number
  ): {
    reliability: 'high' | 'medium' | 'low';
    coefficientOfVariation: number;
    recommendation: string;
  } {
    if (samples.length < 10) {
      return {
        reliability: 'low',
        coefficientOfVariation: 0,
        recommendation: 'Sample size too small for reliable measurement',
      };
    }

    if (totalRuntimeMs < 50) {
      return {
        reliability: 'low',
        coefficientOfVariation: 0,
        recommendation:
          'Total runtime too short for reliable timing measurement',
      };
    }

    const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
    const cv = mean > 0 ? this.standardDeviation(samples) / mean : 0;

    let reliability: 'high' | 'medium' | 'low';
    let recommendation: string;

    if (cv < 0.05) {
      reliability = 'high';
      recommendation =
        'Excellent measurement stability - high confidence in results';
    } else if (cv < 0.15) {
      reliability = 'medium';
      recommendation =
        'Good measurement stability - results are likely reliable';
    } else {
      reliability = 'low';
      recommendation =
        'High variability detected - consider checking for system interference or increasing sample size';
    }

    return { reliability, coefficientOfVariation: cv, recommendation };
  }

  static detectAnomalies(samples: number[]): {
    outliers: number[];
    anomalyCount: number;
    anomalyRate: number;
    recommendation: string;
  } {
    if (samples.length < 10) {
      return {
        outliers: [],
        anomalyCount: 0,
        anomalyRate: 0,
        recommendation: 'Sample size too small for reliable anomaly detection',
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const q1 = this.percentile(sorted, 25);
    const q3 = this.percentile(sorted, 75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const outliers = samples.filter((x) => x < lowerBound || x > upperBound);
    const anomalyRate = outliers.length / samples.length;

    let recommendation: string;
    if (anomalyRate > 0.2) {
      recommendation =
        'High anomaly rate detected - check for system interference, GC pressure, or thermal throttling';
    } else if (anomalyRate > 0.1) {
      recommendation =
        'Moderate anomaly rate - consider increasing sample size or checking environment';
    } else if (anomalyRate > 0.05) {
      recommendation = 'Low anomaly rate - results are likely reliable';
    } else {
      recommendation = 'Very low anomaly rate - high confidence in results';
    }

    return {
      outliers,
      anomalyCount: outliers.length,
      anomalyRate,
      recommendation,
    };
  }
}

// Enhanced GC utilities
export async function attemptGarbageCollection(): Promise<void> {
  // Try to trigger GC in Chrome DevTools
  if (
    'gc' in window &&
    typeof (window as { gc?: () => void }).gc === 'function'
  ) {
    (window as { gc?: () => void }).gc?.();
  }

  // Alternative: create memory pressure and wait
  const pressure = new Array(1000000).fill(0);
  await yieldToUI();
  pressure.length = 0;
  await new Promise((resolve) => setTimeout(resolve, 100));
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

  // Track active timeouts for cleanup
  const activeTimeouts = new Set<ReturnType<typeof setTimeout>>();

  try {
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
        await new Promise<void>((resolve) => {
          const callback = () => resolve();
          const timeout = setTimeout(callback, 50);
          activeTimeouts.add(timeout);
          (
            window as unknown as {
              requestIdleCallback: (
                cb: () => void,
                opts?: { timeout?: number }
              ) => void;
            }
          ).requestIdleCallback(
            () => {
              activeTimeouts.delete(timeout);
              clearTimeout(timeout);
              callback();
            },
            { timeout: 50 }
          );
        });
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
  } finally {
    // Clean up any remaining timeouts
    activeTimeouts.forEach((timeout) => clearTimeout(timeout));
    activeTimeouts.clear();
  }
}

// Enhanced benchmark runner with statistical analysis
export async function runEnhancedBenchmark(
  runOnce: (i: number) => void | Promise<void>,
  options: EnhancedBenchmarkOptions
): Promise<EnhancedBenchmarkResult> {
  const {
    warmup = 5,
    operations,
    yieldEvery = 0,
    trackMemory = false,
    label = 'benchmark',
    measurementSamples = 30,
    maxRuntimeMs = 30000,
    removeOutliers = true,
    minSamples = 10,
    forceGC = false,
    operationsCap,
    minDurationMs = 100,
    onProgress,
  } = options;

  const effectiveOperations = applyCap(operations, operationsCap, label);

  // Force garbage collection if requested
  if (forceGC) {
    await attemptGarbageCollection();
  }

  // Warmup phase
  console.debug(`[${label}] Starting warmup (${warmup} iterations)`);
  for (let i = 0; i < warmup; i++) {
    await runOnce(i);
    if (yieldEvery && (i + 1) % yieldEvery === 0) {
      await yieldToUI();
    }
  }

  if (forceGC) {
    await attemptGarbageCollection();
  }

  // Measurement phase
  const samples: number[] = [];
  const memBefore =
    trackMemory && PerfWithMemory.memory
      ? PerfWithMemory.memory.usedJSHeapSize
      : undefined;

  let totalRuntime = 0;
  let totalIterations = 0;

  console.debug(`[${label}] Starting measurement phase`);

  while (
    (samples.length < measurementSamples && totalRuntime < maxRuntimeMs) ||
    (totalRuntime < minDurationMs && samples.length < measurementSamples * 3)
  ) {
    // Run single benchmark iteration - NO YIELDING during timing
    const start = performance.now();

    for (let i = 0; i < effectiveOperations; i++) {
      await runOnce(i);
      // REMOVED: No yielding during measurement for accuracy
      // if (yieldEvery && (i + 1) % yieldEvery === 0) {
      //   await yieldToUI();
      // }
    }

    const duration = performance.now() - start;
    samples.push(duration);
    totalRuntime += duration;
    totalIterations += effectiveOperations;

    // Schedule a non-blocking progress update via RAF (coalesced)
    if (typeof onProgress === 'function') {
      uiUpdateQueue.schedule(
        { samplesCollected: samples.length, elapsedMs: totalRuntime },
        (p) => onProgress(p as { samplesCollected: number; elapsedMs: number })
      );
    }

    // Yield between samples (not during measurement) for UI responsiveness
    if (samples.length % 10 === 0) {
      await yieldToUI();
    }
  }

  const memAfter =
    trackMemory && PerfWithMemory.memory
      ? PerfWithMemory.memory.usedJSHeapSize
      : undefined;

  // Process results with statistical analysis
  let processedSamples = removeOutliers
    ? BenchmarkStatistics.removeStatisticalOutliers(samples)
    : samples;

  // Ensure minimum sample size
  if (processedSamples.length < minSamples) {
    console.warn(
      `[${label}] Insufficient samples after outlier removal, using raw samples`
    );
    processedSamples = samples;
  }

  const sorted = [...processedSamples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;

  // Statistical analysis
  const reliabilityAssessment = BenchmarkStatistics.assessReliability(
    processedSamples,
    totalRuntime
  );
  const anomalyAnalysis = BenchmarkStatistics.detectAnomalies(samples);

  const result: EnhancedBenchmarkResult = {
    // Basic metrics
    median: BenchmarkStatistics.percentile(sorted, 50),
    mean,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p95: BenchmarkStatistics.percentile(sorted, 95),
    p99: BenchmarkStatistics.percentile(sorted, 99),
    stdDev: BenchmarkStatistics.standardDeviation(sorted),

    // Sample data
    samples: processedSamples,
    sampleCount: processedSamples.length,
    totalIterations,
    totalRuntimeMs: totalRuntime,

    // Memory tracking
    ...(trackMemory &&
      memBefore !== undefined &&
      memAfter !== undefined && {
        memoryDeltaMB: (memAfter - memBefore) / (1024 * 1024),
      }),

    // Reliability metrics
    reliability: reliabilityAssessment.reliability,
    coefficientOfVariation: reliabilityAssessment.coefficientOfVariation,

    // Anomaly detection
    outlierCount: anomalyAnalysis.anomalyCount,
    anomalyRate: anomalyAnalysis.anomalyRate,
    recommendation: reliabilityAssessment.recommendation,
  };

  // Detect quantization / measurement-floor issues and attempt one adaptive rerun
  function detectQuantization(samplesToCheck: number[], medianVal: number) {
    if (!samplesToCheck || samplesToCheck.length === 0) return false;
    const n = samplesToCheck.length;
    const zeroCount = samplesToCheck.filter((s) => s === 0).length;
    if (zeroCount / n >= 0.25) return true; // lots of exact zeros

    // Check for a dominant identical low-value cluster (quantization)
    const freq = new Map<number, number>();
    for (const s of samplesToCheck) {
      // Round to 0.1ms to bucket near-identical values
      const key = Math.round(s * 10) / 10;
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }
    let maxFreq = 0;
    for (const v of freq.values()) if (v > maxFreq) maxFreq = v;
    if (maxFreq / n >= 0.35 && medianVal < 0.5) return true;

    return false;
  }

  try {
    // Local typed wrapper to track adaptive attempts without leaking to public API
    type AdaptiveOptions = EnhancedBenchmarkOptions & {
      __adaptiveAttempted?: boolean;
    };
    const castOpts = options as AdaptiveOptions;
    const alreadyAdaptive = !!castOpts.__adaptiveAttempted;
    if (!alreadyAdaptive && detectQuantization(samples, result.median)) {
      // Conservative increase: larger timing window and more samples
      const increasedMin = Math.max(minDurationMs * 4, 500);
      const increasedSamples = Math.max(
        measurementSamples * 2,
        measurementSamples + 10
      );
      console.warn(
        `[${label}] Quantization detected in samples — rerunning with minDurationMs=${increasedMin} and measurementSamples=${increasedSamples}`
      );

      const newOptions: AdaptiveOptions = {
        ...(options as AdaptiveOptions),
        minDurationMs: increasedMin,
        measurementSamples: increasedSamples,
        __adaptiveAttempted: true,
      };

      // Single adaptive re-run: return the improved measurement
      return await runEnhancedBenchmark(runOnce, newOptions);
    }
  } catch (e) {
    // If adaptive rerun fails for any reason, continue with the original result
    console.warn(
      `[${label}] Adaptive re-measure failed: ${(e as Error).message}`
    );
  }

  console.debug(
    `[${label}] Completed: ${totalIterations} total iterations, ` +
      `${samples.length} samples, ${totalRuntime.toFixed(1)}ms total, ` +
      `reliability: ${result.reliability}, CV: ${(
        result.coefficientOfVariation * 100
      ).toFixed(1)}%`
  );

  return result;
}

// Statistical comparison utilities
export interface ComparisonResult {
  library1: string;
  library2: string;
  medianDifference: number;
  percentageImprovement: number;
  isStatisticallySignificant: boolean;
  confidenceInterval: [number, number];
  effectSize: number;
  effectSizeInterpretation: string;
  conclusion: string;
}

export class BenchmarkComparison {
  /**
   * Compare two benchmark results using non-parametric statistics
   */
  static compareBenchmarks(
    result1: EnhancedBenchmarkResult,
    library1Name: string,
    result2: EnhancedBenchmarkResult,
    library2Name: string,
    confidenceLevel = 0.95
  ): ComparisonResult {
    const medianDiff = result1.median - result2.median;
    const percentageImprovement =
      result2.median > 0
        ? ((result2.median - result1.median) / result2.median) * 100
        : 0;

    // Bootstrap confidence interval for median difference
    const bootstrapCI = this.bootstrapMedianDifference(
      result1.samples,
      result2.samples,
      1000,
      confidenceLevel
    );

    // Mann-Whitney U test for statistical significance
    const mannWhitneyResult = this.mannWhitneyUTest(
      result1.samples,
      result2.samples
    );

    // Effect size calculation (Cohen's d)
    const effectSizeResult = this.cohensD(result1.samples, result2.samples);

    // Determine conclusion
    let conclusion: string;
    if (!mannWhitneyResult.isSignificant) {
      conclusion = 'No statistically significant difference detected';
    } else if (medianDiff < 0) {
      conclusion = `${library1Name} is significantly faster than ${library2Name}`;
    } else {
      conclusion = `${library2Name} is significantly faster than ${library1Name}`;
    }

    return {
      library1: library1Name,
      library2: library2Name,
      medianDifference: medianDiff,
      percentageImprovement,
      isStatisticallySignificant: mannWhitneyResult.isSignificant,
      confidenceInterval: [bootstrapCI.lowerBound, bootstrapCI.upperBound],
      effectSize: effectSizeResult.effectSize,
      effectSizeInterpretation: effectSizeResult.interpretation,
      conclusion,
    };
  }

  private static bootstrapMedianDifference(
    sample1: number[],
    sample2: number[],
    bootstrapSamples = 1000,
    confidenceLevel = 0.95
  ): { lowerBound: number; upperBound: number } {
    const bootstrapDifferences: number[] = [];

    for (let i = 0; i < bootstrapSamples; i++) {
      const boot1 = this.bootstrapSample(sample1);
      const boot2 = this.bootstrapSample(sample2);
      const bootDiff =
        BenchmarkStatistics.percentile(
          [...boot1].sort((a, b) => a - b),
          50
        ) -
        BenchmarkStatistics.percentile(
          [...boot2].sort((a, b) => a - b),
          50
        );
      bootstrapDifferences.push(bootDiff);
    }

    bootstrapDifferences.sort((a, b) => a - b);

    const alpha = 1 - confidenceLevel;
    const lowerIdx = Math.floor((alpha / 2) * bootstrapSamples);
    const upperIdx = Math.floor((1 - alpha / 2) * bootstrapSamples);

    return {
      lowerBound: bootstrapDifferences[lowerIdx],
      upperBound: bootstrapDifferences[upperIdx],
    };
  }

  private static mannWhitneyUTest(
    sample1: number[],
    sample2: number[]
  ): {
    isSignificant: boolean;
    pValue: number;
  } {
    const n1 = sample1.length;
    const n2 = sample2.length;

    // Combine and rank all values
    const combined = [
      ...sample1.map((v) => ({ value: v, group: 1 })),
      ...sample2.map((v) => ({ value: v, group: 2 })),
    ].sort((a, b) => a.value - b.value);

    // Calculate rank sum for first group
    let r1 = 0;
    for (let i = 0; i < combined.length; i++) {
      if (combined[i].group === 1) {
        r1 += i + 1; // Ranks are 1-based
      }
    }

    // Calculate U statistics
    const u1 = r1 - (n1 * (n1 + 1)) / 2;
    const u = Math.min(u1, n1 * n2 - u1);

    // For large samples, use normal approximation
    if (n1 > 20 && n2 > 20) {
      const meanU = (n1 * n2) / 2;
      const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
      const z = Math.abs((u - meanU) / sigmaU);
      const pValue = 2 * (1 - this.normalCDF(z));

      return {
        isSignificant: pValue < 0.05,
        pValue,
      };
    }

    // For small samples, return conservative result
    return {
      isSignificant: false,
      pValue: 1,
    };
  }

  private static cohensD(
    sample1: number[],
    sample2: number[]
  ): {
    effectSize: number;
    interpretation: string;
  } {
    const mean1 = sample1.reduce((sum, val) => sum + val, 0) / sample1.length;
    const mean2 = sample2.reduce((sum, val) => sum + val, 0) / sample2.length;

    const variance1 = this.variance(sample1);
    const variance2 = this.variance(sample2);

    // Pooled standard deviation
    const pooledSD = Math.sqrt(
      ((sample1.length - 1) * variance1 + (sample2.length - 1) * variance2) /
        (sample1.length + sample2.length - 2)
    );

    const effectSize = (mean1 - mean2) / pooledSD;
    const absEffect = Math.abs(effectSize);

    let interpretation: string;
    if (absEffect < 0.2) interpretation = 'Negligible effect';
    else if (absEffect < 0.5) interpretation = 'Small effect';
    else if (absEffect < 0.8) interpretation = 'Medium effect';
    else interpretation = 'Large effect';

    return { effectSize, interpretation };
  }

  private static normalCDF(x: number): number {
    // Approximation of standard normal CDF
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  private static erf(x: number): number {
    // Approximation of error function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y =
      1.0 -
      ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private static variance(sample: number[]): number {
    const mean = sample.reduce((sum, val) => sum + val, 0) / sample.length;
    return (
      sample.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      (sample.length - 1)
    );
  }

  private static bootstrapSample<T>(sample: T[]): T[] {
    const result: T[] = [];
    for (let i = 0; i < sample.length; i++) {
      const randomIndex = Math.floor(Math.random() * sample.length);
      result.push(sample[randomIndex]);
    }
    return result;
  }
}

// Performance environment detection
export class PerformanceEnvironment {
  /**
   * Detect if performance is being throttled by running a CPU-intensive calibration
   */
  static async detectPerformanceThrottling(): Promise<{
    isThrottled: boolean;
    opsPerMs: number;
    recommendation: string;
  }> {
    const iterations = 100000;
    const start = performance.now();

    let sum = 0;
    for (let i = 0; i < iterations; i++) {
      sum += Math.sqrt(i) * Math.sin(i);
    }

    const duration = performance.now() - start;
    const opsPerMs = iterations / duration;

    // Baseline: modern browsers should handle 500+ ops/ms for this test
    const isThrottled = opsPerMs < 300;

    let recommendation: string;
    if (isThrottled) {
      recommendation =
        'Performance throttling detected. Consider: closing other tabs, plugging in laptop, checking thermal throttling, or running in incognito mode.';
    } else if (opsPerMs < 500) {
      recommendation =
        'Moderate performance detected. Results may have higher variance.';
    } else {
      recommendation = 'Good performance environment detected.';
    }

    // Keep sum alive to prevent optimization
    if (sum === Infinity) console.log('Calibration complete');

    return { isThrottled, opsPerMs, recommendation };
  }

  /**
   * Validate benchmark environment before running tests
   */
  static async validateEnvironment(): Promise<{
    isReady: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check performance throttling
    const throttleCheck = await this.detectPerformanceThrottling();
    if (throttleCheck.isThrottled) {
      issues.push('Performance throttling detected');
      recommendations.push(throttleCheck.recommendation);
    }

    // Check memory availability
    if (PerfWithMemory.memory) {
      const memInfo = PerfWithMemory.memory;
      const memUsagePercent =
        (memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit) * 100;
      if (memUsagePercent > 80) {
        issues.push('High memory usage detected');
        recommendations.push(
          'Consider closing other tabs or refreshing the page to free memory'
        );
      }
    }

    // Check if we're in an optimal browser state
    if (!('requestIdleCallback' in window)) {
      recommendations.push(
        'Browser lacks requestIdleCallback support - timing may be less accurate'
      );
    }

    // Check if dev tools are open (affects performance)
    const devToolsOpen = window.outerHeight - window.innerHeight > 160;
    if (devToolsOpen) {
      recommendations.push(
        'Developer tools appear to be open - this may affect performance measurements'
      );
    }

    return {
      isReady: issues.length === 0,
      issues,
      recommendations,
    };
  }
}
