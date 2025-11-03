declare global {
  interface Window {
    __LAST_BENCHMARK_EXTENDED_RESULTS__?: Record<
      string,
      Record<string, unknown>
    >;
    __SIGNALTREE_ACTIVE_ENHANCERS__?: string[];
    __LAST_BENCHMARK_RESULTS__?: string;
    __LAST_BENCHMARK_RESULTS_OBJ__?: unknown;
    __LAST_BENCHMARK_RESULTS_TS__?: string;
  }
}

export {};
