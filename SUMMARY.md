# SignalTree v5.0 - Plan Summary

## The Goal

Add **PathNotifier** (simple change notification) + **Entity Collections** (Map-based CRUD with scoped hooks) while fixing 4 broken enhancers.

## Reality Check

Scope corrected from overengineering:

- **Was:** 20-25 days, ~1500 lines of complex optimizations
- **Now:** 14-17 days, ~650 lines implementation + 400 lines enhancer fixes + 300 tests/docs

## What We're Building

### PathNotifier (~50 lines)

```typescript
class PathNotifier {
  subscribe(pattern: string, handler): unsubscribe;
  notify(path: string, value, prev): void;
}
```

- **Lazy init:** Only created on first `.with()` call (zero overhead if unused)
- **Keep simple:** No interceptors, no complex patterns. Just notify subscribers.

### Entity System (~500 lines)

```typescript
tree.$.users: EntitySignal<User, string>
  ├── addOne(entity): Key
  ├── updateOne(key, updates): void
  ├── removeOne(key): void
  ├── all(): Signal<Entity[]>
  ├── tap(handlers): unsubscribe      // Observe mutations
  └── intercept(handlers): unsubscribe // Block/transform
```

- **Scoped hooks:** No global pollution

### Integration (~100 lines)

- Wire PathNotifier to enhancers
- Connect existing `useStructuralSharing` to TimeTravel
- Enable Logging, Batching, Persistence via PathNotifier

### Tests & Documentation (~300 lines)

- Unit tests for all CRUD operations
- Hook integration tests
- Usage examples and API documentation

## Timeline

| Phase     | Task          | Days           |
| --------- | ------------- | -------------- |
| 1         | Types         | ✅ DONE        |
| 2         | PathNotifier  | 2              |
| 3         | Entity System | 5-7            |
| 4         | **Enhancer Migration** | **3-4** |
| 5         | Testing       | 1              |
| 6         | Docs          | 1              |
| 7         | Release       | 1              |
| **TOTAL** | | **14-17 days** |

## What We're NOT Doing

| Idea                                     | Why Not                         |
| ---------------------------------------- | ------------------------------- |
| Effect-based persistence                 | Forces full tree read           |
| Computed change streams                  | O(n) on every access            |
| Selective path enhancement               | Cognitive overload              |
| Per-path subscriber maps                 | Premature optimization          |
| Batch suspension API                     | Breaks invisible infrastructure |
| Separate entry points                    | Lazy init is enough             |
| Rebuild WeakRef/debug/structural sharing | Already exists                  |

## What We ARE Fixing

| Component | Current Issue | Fix |
|-----------|--------------|-----|
| **Batching** | Global state (shared across trees) | Instance-scoped queue via PathNotifier |
| **Persistence** | 50ms polling never cleaned up | PathNotifier subscription (0 overhead idle) |
| **TimeTravel** | Misses tree.$.x.y leaf mutations | PathNotifier subscription catches all |
| **DevTools** | Misses leaf mutations | PathNotifier provides full context |
| **Core Middleware** | tree.addTap/removeTap don't scale | Replace with scoped entity hooks |

## Key Principles

- **Reuse existing** - WeakRef, debug mode, structural sharing already work
- **Keep simple** - Add complexity only when proven needed
- **Invisible infrastructure** - Users see entities, not PathNotifier
- **Signal-native** - Feels like Angular signals

---

**Status:** 🟢 Ready to implement
