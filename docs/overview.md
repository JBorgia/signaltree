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
- Tree-shakeable, own code only, gzip (measured, esbuild + minify, Angular/rxjs external). **Production** (`ngDevMode: false`, what you ship): bare tree **5.79KB**; with `entityMap` **9.40KB**; with `form()` **7.90KB**. **Development** (default build, diagnostics included): **7.80 / 12.07 / 10.16KB** — defining `ngDevMode: false` reclaims **~1.8-2.4KB per tree**, and every dev string folds (verified by `tools/check-devmode-foldable.mjs`). Both figures are enforced separately by `tools/check-bundle-budget.mjs`, which gates prod tightly and dev loosely — see [dropping dev code](performance/dropping-dev-code.md).
- Performance targets: operations maintain sub‑millisecond times across common depths

### Operation latency by depth

Reproduce with `node tools/bench-depth-latency.mjs`. Median across 5 sweeps,
each 9 batches of 2,000 operations after a warm-up, on the built output.

| depth | root update through the chain |
| ----- | ----------------------------- |
| 5     | 0.0010 ms                     |
| 10    | 0.0019 ms                     |
| 15    | 0.0028 ms                     |
| 20    | 0.0038 ms                     |

**Read the shape, not the absolutes** — those are hardware-specific. Cost grows
**sublinearly in depth**: 4x the depth costs less than 4x the time, because a
write walks only the path it touches.

**No multiplier is quoted here, deliberately.** An earlier version of this
section said "~3.6x", and the table above it implied 4.8x — two numbers from two
different runs, presented as one fact. The ratio is two sub-microsecond
absolutes divided by each other, and it moves 3.2x-4.8x _within a single run_ of
the generator while the absolutes barely shift. That is the same instability the
ST2018 multiplier was deleted for; quoting a midpoint here would have repeated
the mistake one section after documenting it. The tool prints the spread.

A direct leaf write (`tree.$.a.b.c.set(v)`) does not walk the path at all and
measures at timer resolution, so the tool reports it but declines to quote it.

> Replaced a "Performance targets (Sept 2025)" table for 14.0.0. It claimed
> 0.041 / 0.061 / 0.092 / 0.104 ms at these depths and **nothing in the repo
> produced those figures** — the same defect as the publishable-size rows below.
> Worse, "operation" was never defined, and the two plausible readings differ by
> three orders of magnitude, so the claim could be neither verified nor
> falsified. Both were measured: every real figure is 10x-1000x SMALLER than
> what was published. The numbers understated the library, which is the
> forgiving direction, and were wrong all the same.

### Published package budgets (CI gates, not what apps pay)

These bound what's published to npm. Real apps tree-shake down to a fraction of
these figures, which is why the numbers above — what a consumer actually ships
— are the ones to quote.

| Metric                                              | Budget | Current |
| --------------------------------------------------- | ------ | ------- |
| minimal tree, no markers (prod, `ngDevMode: false`) | 6000 B | 5918 B  |
| tree + `stored()` (prod, `ngDevMode: false`)        | 7400 B | 7246 B  |
| core value exports                                  | 60     | 39      |

Gated by `npm run validate:budget`. Raw unbundled `dist/` across every entry
point is ~247KB, which is informational only — no consumer ships all of it.

> Two rows were removed here for 14.0.0: "Core publishable (gzipped) 25.64KB"
> and "Total ecosystem publishable 36.32KB". No tool in the repo produces either
> number any more — they date from a v9-era methodology that no longer exists,
> so they could not be re-verified and were quietly wrong rather than merely
> old. They are replaced by figures a script actually emits, rather than
> re-derived under a methodology invented to match them.

### Frequency weighting system

Performance benchmarks use research-based frequency weighting to reflect real-world usage patterns:

- **Maintainer-estimated multipliers**: hand-chosen judgement calls, not survey findings — see [the disclosure](performance/frequency-weighting-system.md#where-these-numbers-come-from)
- **Neutral comparison available**: the `equal` preset sets every weight to 1.0, which is the setting to use when comparing libraries
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
