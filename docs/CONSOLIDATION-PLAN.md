# Documentation Consolidation Plan

Status: Proposal only. No files have been moved or deleted.

Goal: Reduce duplication, centralize canonical docs, and make navigation clear.

## Proposed canonical structure

- docs/overview.md

  - Consolidate: FEATURES.md + SPECIFICATIONS.md
  - Rationale: One authoritative overview/spec document referenced from the root README.

- docs/performance/metrics.md

  - Consolidate: METRICS-REPORT.md + COMPREHENSIVE-METRICS-REPORT.md + REVOLUTIONARY-METRICS-REPORT.md + EXTREME-DEPTH-TESTING.md
  - Rationale: Single source for performance numbers, methodologies, and deep-nesting benchmarks.

- docs/performance/bundle-optimization.md

  - Consolidate: BUNDLE-ANALYSIS-REPORT.md + BUNDLE-OPTIMIZATION-REPORT.md + docs/BUNDLE-OPTIMIZATION-GUIDE.md
  - Keep separate: docs/OPTIMIZATION-CHECKLIST.md (quick reference), but link from the canonical page.
  - Rationale: One living guide that includes analysis + recommendations; a separate short checklist remains handy.

- docs/deployment/production.md

  - Move (no content change): PRODUCTION-DEPLOYMENT.md
  - Rationale: Keep deployment content under docs/.

- packages/core/README.md (Enhancers section)

  - Consolidate: packages/core/ENHANCERS.md → a new “Enhancers” section in core README (or keep as packages/core/docs/ENHANCERS.md and link from README).
  - Rationale: Reduce fragmentation for core users.

- scripts/README.md

  - Consolidate: scripts/performance/README.md → a dedicated “Performance” section inside scripts/README.md
  - Rationale: One entry point for all scripts docs.

- Legal (no consolidation)

  - Keep: LICENSE, INTELLECTUAL_PROPERTY.md
  - Optional move: docs/legal/ with separate files. Keep as separate docs due to legal nature.

- Per-package docs
  - Keep: packages/\*/README.md as the canonical per-package documentation.

## File-by-file mapping

- Root-level reports

  - BUNDLE-ANALYSIS-REPORT.md → docs/performance/bundle-optimization.md
  - BUNDLE-OPTIMIZATION-REPORT.md → docs/performance/bundle-optimization.md
  - METRICS-REPORT.md → docs/performance/metrics.md
  - COMPREHENSIVE-METRICS-REPORT.md → docs/performance/metrics.md
  - REVOLUTIONARY-METRICS-REPORT.md → docs/performance/metrics.md
  - EXTREME-DEPTH-TESTING.md → docs/performance/metrics.md (as a dedicated “Deep nesting” section)

- Existing docs/

  - docs/BUNDLE-OPTIMIZATION-GUIDE.md → docs/performance/bundle-optimization.md
  - docs/OPTIMIZATION-CHECKLIST.md → Stay separate; link from bundle-optimization.md

- Overview/spec

  - FEATURES.md + SPECIFICATIONS.md → docs/overview.md

- Deployment

  - PRODUCTION-DEPLOYMENT.md → docs/deployment/production.md

- Core package

  - packages/core/ENHANCERS.md → Merge into packages/core/README.md (Enhancers section) or move to packages/core/docs/ENHANCERS.md and link.

- Scripts

  - scripts/performance/README.md → Merge into scripts/README.md (“Performance” section)

- Keep as-is (reference only)
  - apps/demo/README.md, .githooks/README.md, packages/\*/README.md

## Execution steps (suggested)

1. Create target folders: docs/performance/, docs/deployment/
2. Merge and normalize content as mapped above
3. Add deprecation banners to superseded files pointing to the canonical docs
4. Update root README and package READMEs to link to canonical docs
5. Remove superseded files once links are updated and reviewed
