# Bundle Optimization and Analysis

Consolidated guidance and reports for bundle size analysis and optimization across the SignalTree ecosystem.

## Current status

- Tree-shake entry points (sum of facade files) measure **30.99KB gzipped**; the consolidated architecture saves **4.28KB** (~15.9%) versus the legacy separate-package layout (26.87KB total) when all enhancers are consumed.
- Full publishable output (`core` + `enterprise` + `callable-syntax` + `shared` + `types` + `utils`) sums to **36.31KB gzipped**; the core package alone compresses to **25.63KB gzipped**.
- Guardrails main bundle is **5.08KB gzipped** (baseline 6.57KB, −21.5%), and every package remains under its max budget with updated size claims.

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
