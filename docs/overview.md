<div align="center">
  <img src="../apps/demo/public/signaltree.svg" alt="SignalTree Logo" width="80" height="80" style="background: transparent;" />
</div>

# SignalTree Overview and Specifications

This document consolidates the feature overview and technical specifications for the SignalTree ecosystem (September 2025).

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
- Compact bundle sizes across the ecosystem

## Package ecosystem

SignalTree consists of one core package with all enhancers built-in, plus three optional add-on packages:

- **@signaltree/core**: Complete state management solution including all enhancers (batching, memoization, middleware, entities, devtools, time-travel, serialization, presets)
- **@signaltree/ng-forms**: Angular Forms integration (separate package)
- **@signaltree/enterprise**: Enterprise-scale optimizations for 500+ signals (separate package)
- **@signaltree/callable-syntax**: Build-time transform for callable signal syntax (dev dependency, separate package)

**All enhancers are exported from `@signaltree/core`** — no need for separate enhancer packages.

## Technical specifications

- Angular 20.3+, TypeScript 5.5+, Node 18.17+ (development)
- Browser: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Baseline core bundle ~7.25KB gzipped; total ecosystem ~27.56KB gzipped
- Performance targets: operations maintain sub‑millisecond times across common depths

### Performance targets (Sept 2025)

| Metric                         | Target   | Current |
| ------------------------------ | -------- | ------- |
| Operation latency (5 levels)   | <0.050ms | 0.041ms |
| Operation latency (10 levels)  | <0.080ms | 0.061ms |
| Operation latency (15 levels)  | <0.120ms | 0.092ms |
| Operation latency (20+ levels) | <0.150ms | 0.104ms |
| Core bundle size               | <8.00KB  | 7.25KB  |
| Total ecosystem bundle size    | <30.00KB | 27.56KB |

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
