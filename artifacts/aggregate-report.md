# Aggregate benchmark report
Generated: 2025-09-20T16:19:24.891Z

## Summary
Libraries found: SignalTree

## Per-scenario table
### deep-nested

| Library | median (ms) | p95 (ms) | ops/s | samples | manyZeros | quantized | highVariance | Rank |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SignalTree | 0.10000002384185791 | 0.20000004768371582 | 10000 | 100 | YES | YES | no | 🏆 |

**Flags**:
- SignalTree: many zeros
- SignalTree: quantized low samples

**Recommendation**: For scenarios flagged with many zeros / quantized: increase per-sample work, set the enhanced runner (longer minDuration), or rerun with aggregation mode to avoid timer quantization.
