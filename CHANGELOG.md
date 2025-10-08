# Changelog

All notable changes to SignalTree will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed - October 7, 2025

#### Middleware Benchmark Cleanup

- **Removed synthetic middleware benchmarks** from NgRx Store, NgXs, Akita, Elf, and NgRx SignalStore benchmark services
- **Reason**: Synthetic implementations were trivial function calls that didn't represent actual library middleware/plugin architectures
- **Impact**: Benchmark comparison now accurately shows only SignalTree has native before/after state update interception middleware
- **Files affected**:
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-benchmark.service.ts`
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngxs-benchmark.service.ts`
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/akita-benchmark.service.ts`
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/elf-benchmark.service.ts`
  - `apps/demo/src/app/pages/realistic-comparison/benchmark-orchestrator/services/ngrx-signals-benchmark.service.ts`

**Methodology Note**: Other libraries have different plugin/hook systems:

- NgRx Store: Meta-reducers (action interception)
- NgXs: Plugin system (action lifecycle)
- Akita: akitaPreUpdate hooks (state transition hooks)
- Elf: RxJS effects/operators (observable streams)
- NgRx SignalStore: withHooks (lifecycle hooks, NOT state update middleware)

These operate fundamentally differently than SignalTree's `withMiddleware()` which provides before/after interception of individual state property updates.

### Documentation

#### Updated

- `missing-implementations-complete.md` - Marked middleware sections as removed with explanation
- `middleware-capabilities-analysis.md` - Updated status to reflect removal decision

#### Added

- `MIDDLEWARE_CLEANUP.md` - Comprehensive documentation of research findings and removal rationale
- `CHANGELOG.md` - Created to track significant changes

---

## Historical Note

This changelog was created on October 7, 2025. Prior changes were not formally tracked in a changelog format but can be found in git commit history.
