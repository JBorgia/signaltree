# Performance Patterns & Guidance

This document summarizes practical patterns to avoid common performance pitfalls when using SignalTree in Angular applications. Focused on real-world, production-relevant scenarios.

## Selector Sharing (Recommended)

Avoid creating identical computed/selectors repeatedly across components. Prefer single shared selectors exported from a module.

```ts
// selectors/user.selectors.ts
export const selectActiveUsers = (tree: AppTree) => tree.$.users.where(isActive);

// Component
class UserListComponent {
  activeUsers = selectActiveUsers(this.tree);
}
```

Why: Reuse avoids creating many `computed()` instances for the same derived query.

## Cached predicate queries in EntitySignal

`EntitySignal.where(predicate)` and `find(predicate)` now cache computed signals when callers pass the same function reference. This yields a large win when components reuse the same named predicate:

```ts
const isActive = (u: User) => u.active;
const s1 = tree.$.users.where(isActive); // cached
const s2 = tree.$.users.where(isActive); // same Signal instance
```

**Caveat:** Function identity matters. Inline anonymous predicates (e.g. `where(u => u.active)`) will not be cached. Prefer named predicate functions.

## Enhancer ordering & telemetry
Enhancers can depend on each-other (e.g., memoization assumes stable signals, batching controls notification timing). The demo harness now:

- Uses the library's `resolveEnhancerOrder()` helper to establish a safe apply order for enhancers selected in the UI or defaults.
- Detects whether a memoization enhancer was already requested using attached enhancer metadata (safer than string-matching function names).
- Exposes the final list of applied enhancers on `window.__SIGNALTREE_ACTIVE_ENHANCERS__` so CI and Playwright exporters can audit the exact runtime enhancer set.

Recommended per-scenario enhancer sets (demo defaults):

- Deep Nested Updates: `batching(), shallowMemoization()`
- Array updates: `highPerformanceBatching(), withLazyArrays()` (when large)
- Computed chains: `batching(), shallowMemoization()` (or `computedMemoization()` if heavy computed graphs)
- Selector workloads: `lightweightMemoization()` or `selectorMemoization()`
- Serialization: `memoization(), highPerformanceBatching(), serialization()`

These show the typical trade-offs — choose the smallest set that addresses your bottleneck to keep semantics predictable.

## When NOT to worry: Rapid Sequential Updates

Angular's microtask-based change detection already batches many record updates. Benchmarks that artificially call `tree.$.counter.set(i)` in a tight loop outside Angular's zone are not reflective of typical Angular apps.

If you truly need sustained 60Hz updates (games, real-time viz), consider:

- Handling rendering on a dedicated rAF loop
- Minimising Angular CD calls (OnPush, manual markForCheck)
- Using a specialized dataflow outside Angular

SignalTree will remain framework-friendly and avoid adding default behavior that changes notification timing.

## Architecture Patterns to Avoid Subscriber Scaling

- Split hot state nodes (avoid one giant list with thousands of subscribers)
- Use shared selectors instead of per-component inline selectors
- Move heavy derived work to a service/shared computed instead of duplicating across components
- Virtualize large lists

## Diagnostics & Benchmarks

- Add subscriber-scaling scenarios to your CI benchmarks if your app deals with large subscriber counts
- Measure both _notification_ overhead and _actual UI render_ cost; a tiny notification win may be negated by more renders in the UI

---

If you'd like, I can add a demo page showing the `selectActiveUsers` pattern and a micro-benchmark that demonstrates caching wins.
