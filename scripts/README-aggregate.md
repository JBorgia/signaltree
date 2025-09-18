aggregate-stats.js

Usage:

Node script to pool NDJSON benchmark results and compute per-scenario Mann–Whitney U and Cliff's Delta.

Examples:

node scripts/aggregate-stats.js artifacts/perf-\*.ndjson

Notes:

- The script expects each NDJSON line to be a JSON object with at least a `scenario` field and either `samples` (array) or `p50` numeric.
- It groups results by `scenario` and `memoMode` (or `mode`) where available and prints per-mode pooled stats and a comparison between two modes (prefer `light` vs `full`).
