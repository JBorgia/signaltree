## Performance Artifact Layout

Organized, versioned performance artifacts live here (code remains in `scripts/performance/`).

Structure:

```
performance/
  baselines/
    micro/<engine>/baseline.json       # committed variance baselines
    macro/baseline.json                # (optional) aggregate baseline
    size/baseline.json                 # gzip size baseline
  results/                             # ephemeral latest run outputs (gitignored)
    micro/<engine>/latest.json         # latest variance stats (median/stddev/p95)
    macro/latest.json                  # latest aggregate macro run
    macro/median.json                  # median summary (RUNS - WARMUP)
    size/latest.json                   # latest size snapshot
  history/
    macro/benchmark-median-<timestamp>.json  # archived median summaries
```

Guidelines:

- Commit only files under `baselines/` and `history/` (macro median history is optional but useful for trend analysis).
- Never commit `results/` (already ignored) – they are transient outputs.
- Use scripts under `scripts/performance/` to generate/update artifacts; don’t write into this tree manually.

Key Scripts (invoke from repo root):

- `node scripts/performance/micro-benchmarks-variance.mjs` (angular engine)
- `node scripts/performance/micro-benchmarks-variance-vanilla.mjs` (vanilla engine)
- `node scripts/performance/run-benchmark.mjs` (macro single run)
- `node scripts/performance/run-benchmark-median.mjs` (macro multiple runs + median + history archive)
- `node scripts/performance/compare-benchmark.mjs` (regression detection)
- `node scripts/performance/size-snapshot.mjs` then `size-regression-check.mjs` (size guard)

Environment / Flags:

- `BENCH_RUNS`, `BENCH_WARMUP` – control macro median aggregation.
- `LATEST_BENCHMARK_FILE` – manually compare a specific historical macro file.
- `MAX_SIZE_GROWTH_PCT` – size regression threshold (default 5%).

Migration Notes:

Legacy JSON outputs formerly inside `scripts/performance/` have been relocated (or superseded). Historical snapshots can be moved into `performance/history/macro/` if needed; otherwise they may be deleted to reduce noise.

Next Ideas:

- Add automatic pruning (keep last N macro history files).
- Introduce trend report summarizing last 10 median runs.
- Persist micro benchmark historical series if long‑term distribution drift tracking is desired.
