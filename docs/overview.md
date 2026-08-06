<div align="center">
  <img src="../apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="80" height="80" style="background: transparent;" />
</div>

# SignalTree Overview and Specifications

This document consolidates the feature overview and technical specifications for the SignalTree ecosystem.

## Release notes

Release notes live in [`CHANGELOG.md`](../CHANGELOG.md) — the single source of truth.
This page previously duplicated a "Latest release" list, which then sat at 7.6.0
while the packages shipped 13.x. Don't reintroduce it; link the changelog instead.

## Overview

- Recursive typing with deep nesting and accurate type inference
- Sub‑millisecond operations measured at 5–20+ levels
- Memory efficiency via structural sharing and lazy signal creation
- Small, focused packages with strong TypeScript support
- Extensible via enhancers and optional packages

## Core capabilities

- Hierarchical signal trees with type-safe access and updates
- Lazy signal creation on first access
- Structural sharing for immutable updates
- Tree-shakeable: unused enhancers and optional packages are eliminated by modern bundlers

## Package ecosystem

SignalTree is one core package with every enhancer built in, plus seven optional
add-ons. Package boundaries follow the rule in
[RFC 0007](rfcs/0007-packaging-principle-and-ng-forms-reslice.md): an independent
dependency or runtime earns its own package; a within-tree mechanic lives in core.

- **@signaltree/core**: the whole state layer — enhancers (batching, devtools, time-travel, serialization), markers (`entityMap`, `status`, `stored`, `form`, `asyncSource`, `asyncQuery`), plus `loader()`, `history()`, `trackHistory()`, `linked()`, `derivedFrom()`, `defineStore()`, `asReadonly()`
- **@signaltree/ng-forms**: Angular Forms integration — `createFormTree` (FormGroup) and `signalForm()` (Angular 22 Signal Forms bridge). Separate because it depends on `@angular/forms`
- **@signaltree/schema**: StandardSchema-compatible runtime validation registered against tree paths
- **@signaltree/events**: domain-event bus with an `entityMap` bridge and optimistic-update manager
- **@signaltree/realtime**: SSE/SignalR wiring onto tag-based cache invalidation
- **@signaltree/guardrails**: opt-in runtime write auditing and intent-aware suppression
- **@signaltree/enterprise**: _deprecated in 13.5.0_ — superseded by `tree.updateAndReport()` in `@signaltree/core`, which is faster and needs no enhancer

**All enhancers are exported from `@signaltree/core`** — no need for separate enhancer packages.

## Technical specifications

- Angular 20, 21, or 22 (see `peerDependencies`), TypeScript 5.5+, Node 18.17+ (development)
- Browser: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Tree-shakeable, own code only, gzip (measured, esbuild + minify, Angular/rxjs external): a bare tree ~5.6KB; with `entityMap` ~8.5KB; with `form()` ~7.7KB. Enforced by `tools/check-bundle-budget.mjs`. Defining `ngDevMode: false` in a production build reclaims a further ~0.5–0.9KB — see [dropping dev code](performance/dropping-dev-code.md)
- Performance targets: operations maintain sub‑millisecond times across common depths

### Performance targets (Sept 2025)

| Metric                         | Target   | Current |
| ------------------------------ | -------- | ------- |
| Operation latency (5 levels)   | <0.050ms | 0.041ms |
| Operation latency (10 levels)  | <0.080ms | 0.061ms |
| Operation latency (15 levels)  | <0.120ms | 0.092ms |
| Operation latency (20+ levels) | <0.150ms | 0.104ms |

### Published package budgets (CI gates, not what apps pay)

These bound what's published to npm. Real apps tree-shake down to a fraction of these figures.

| Metric                         | Budget   | Current |
| ------------------------------ | -------- | ------- |
| Core publishable (gzipped)     | <30.00KB | 25.64KB |
| Total ecosystem publishable    | <40.00KB | 36.32KB |

### Frequency weighting system

Performance benchmarks use research-based frequency weighting to reflect real-world usage patterns:

- **Research-Based Multipliers**: Derived from analysis of 40,000+ developer surveys and 10,000+ GitHub repositories
- **Smart Weight Adjustment**: One-click application of weights from State of JS 2023 data and React DevTools Profiler analysis
- **Real-World Relevance**: Weighted results prioritize operations that apps actually use frequently
- **Comprehensive Analysis**: Reports ranking changes and weight impact alongside raw performance metrics

See [Frequency Weighting System Documentation](performance/frequency-weighting-system.md) for complete methodology and implementation details.

### Supported data types (serialization)

- Primitives, objects, arrays
- Date, RegExp, Map, Set
- Circular references (handled)

### Enhancers and composition

- Extensible via `tree.with(...)` enhancers
- Metadata-driven ordering with `requires`/`provides`
- Prefer mutation (augment in place) to preserve identity

## Integration notes

- Angular-first usage; works with other frameworks (React, Vue, Svelte) via simple adapters
- SSR hydration available via serialization

---

Source materials consolidated from `FEATURES.md` and `SPECIFICATIONS.md`.
