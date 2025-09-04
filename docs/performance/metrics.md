# Performance Metrics and Methodology

This document consolidates performance metrics and deep-nesting test results (September 2025).

## Summary (averaged)

- Operation latency across depths:
  - 5 levels: ~0.061ms
  - 10 levels: ~0.109ms
  - 15 levels: ~0.098ms
  - 20+ levels: ~0.103ms
- Bundle composition: total ecosystem ~27.56KB gzipped

## Deep nesting analysis

Representative measurements across different depths (5-run averages). Results vary by environment.

| Depth level | Avg time | Range         |
| ----------- | -------- | ------------- |
| 5 levels    | 0.061ms  | 0.041–0.133ms |
| 10 levels   | 0.109ms  | 0.060–0.181ms |
| 15 levels   | 0.098ms  | 0.088–0.126ms |
| 20+ levels  | 0.103ms  | 0.100–0.106ms |

## Methodology

- 5-run averages per depth level
- Controlled demo app benchmarking
- Similar state shapes across tests

## Notes

- Figures here replace prior ad-hoc reports and marketing summaries
- See also: docs/performance/bundle-optimization.md for bundle size details

---

Consolidated from `METRICS-REPORT.md`, `COMPREHENSIVE-METRICS-REPORT.md`, `REVOLUTIONARY-METRICS-REPORT.md`, and `EXTREME-DEPTH-TESTING.md`.
