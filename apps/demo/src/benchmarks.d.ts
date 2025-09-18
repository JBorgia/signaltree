declare global {
  interface Window {
    __SIGNALTREE_MEMO_MODE?: 'off' | 'light' | 'shallow' | 'full';
    __LAST_BENCHMARK_RESULTS__?: string; // JSON string
    __LAST_BENCHMARK_RESULTS_OBJ__?: unknown; // parsed object
    __LAST_BENCHMARK_RESULTS_TS__?: string; // ISO timestamp
  }
}

export {};
