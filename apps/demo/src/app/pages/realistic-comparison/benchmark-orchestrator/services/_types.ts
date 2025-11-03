export interface BenchmarkResult {
  durationMs: number;
  memoryDeltaMB?: number;
  notes?: string;
}

// helper: normalize ms from performance entries
export function ms(n: number): number {
  return Math.round(n * 100) / 100;
}

declare global {
  interface Window {
    __SIGNALTREE_ACTIVE_ENHANCERS__?: string[];
    __SIGNALTREE_MEMO_MODE__?: 'off' | 'light' | 'shallow' | 'full';
    __LAST_COLDSTART_RESULTS__?: Record<string, BenchmarkResult>;
    __AKITA_LAST_COLDSTART_METRICS__?: BenchmarkResult;
    __ELF_LAST_COLDSTART_METRICS__?: BenchmarkResult;
    __NGRX_LAST_COLDSTART_METRICS__?: BenchmarkResult;
    __NGRX_SIGNALS_LAST_COLDSTART_METRICS__?: BenchmarkResult;
    __NGXS_LAST_COLDSTART_METRICS__?: BenchmarkResult;
    __SIGNALTREE_LAST_COLDSTART_METRICS__?: BenchmarkResult;
    __LAST_BENCHMARK_EXTENDED_RESULTS__?:
      | Record<string, Record<string, BenchmarkResult>>
      | undefined;
    __LAST_BENCHMARK_RESULTS__?: string;
    __LAST_BENCHMARK_RESULTS_OBJ__?: unknown;
  }
}

export {};

// Safe helper to read heap used size without spreading `(performance as any)` across the codebase
export function safeGetHeapUsed(): number | null {
  // Use a proper interface for the extended performance object
  interface ExtendedPerformance extends Performance {
    memory?: {
      usedJSHeapSize: number;
    };
  }

  return (performance as ExtendedPerformance)?.memory?.usedJSHeapSize ?? null;
}
