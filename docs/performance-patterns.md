# Performance Patterns & Guidance

This document summarizes practical patterns to avoid common performance pitfalls when using SignalTree in Angular applications. Focused on real-world, production-relevant scenarios.

## Selector Sharing (Recommended)
Avoid creating identical computed/selectors repeatedly across components. Prefer single shared selectors exported from a module.

```ts
// selectors/user.selectors.ts
export const selectActiveUsers = (tree: AppTree) =>
  tree.$.users.where(isActive);

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
- Measure both *notification* overhead and *actual UI render* cost; a tiny notification win may be negated by more renders in the UI

---

If you'd like, I can add a demo page showing the `selectActiveUsers` pattern and a micro-benchmark that demonstrates caching wins.
