# Bundle Optimization and Analysis

Consolidated guidance and reports for bundle size analysis and optimization across the SignalTree ecosystem.

## Current status

- Total ecosystem: ~27.56KB gzipped (packages)
- All packages meeting realistic targets per consolidated analysis scripts

## Canonical tools

- scripts/consolidated-bundle-analysis.js — single source of truth
- npm run size:report — consolidated bundle analysis

## Workflow

1. Clear cache and rebuild packages
2. Measure gzipped output sizes
3. Validate claims and thresholds
4. Report pass/fail with recommendations

## Optimization techniques

- Remove debug-only code and logs
- Eliminate redundant exports and wrappers
- Consolidate type handlers/utilities
- Ensure tree-shaking friendly patterns

## References

- Detailed guide: scripts/README.md (Analysis & Performance)
- Quick reference: docs/OPTIMIZATION-CHECKLIST.md

---

Consolidated from `BUNDLE-ANALYSIS-REPORT.md`, `BUNDLE-OPTIMIZATION-REPORT.md`, and `docs/BUNDLE-OPTIMIZATION-GUIDE.md`.
