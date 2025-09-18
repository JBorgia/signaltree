# Aggregate benchmark report
Generated: 2025-09-17T15:31:34.449Z

## Summary
Libraries found: SignalTree

## Per-scenario table
### deep-nested

| Library | median (ms) | p95 (ms) | ops/s | samples | manyZeros | quantized | highVariance | Rank |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SignalTree | 0.10000002384185791 | 0.20000004768371582 | 10000 | 100 | no | YES | no | 🏆 |

**Flags**:
- SignalTree: quantized low samples

**Recommendation**: For scenarios flagged with many zeros / quantized: increase per-sample work, set the enhanced runner (longer minDuration), or rerun with aggregation mode to avoid timer quantization.

### large-array

| Library | median (ms) | p95 (ms) | ops/s | samples | manyZeros | quantized | highVariance | Rank |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| SignalTree | 1.4000000953674316 | 1.600000023841858 | 714 | 100 | no | no | no | 🏆 |
