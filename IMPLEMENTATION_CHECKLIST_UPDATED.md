# v5.0 Implementation Checklist (Updated)

## Status Summary

```
Planning:   ✅ COMPLETE
Phase 1:    ✅ COMPLETE (types defined)
Phases 2-8: ⏳ READY TO START
Improvements: ✅ EVALUATED & DECIDED
```

---

## Key Changes from Evaluation

Based on comprehensive review of all 20 improvement options:

✅ **ADDED:**

- Effect-based persistence (no 50ms polling!)
- Structural sharing for time travel (O(1) vs O(n))
- Selective path enhancement (tree.$.users.with(...))
- Proxy-only interception (wrap at access, not creation)
- Per-path subscriber map (O(1) notification)
- WeakRef auto-cleanup (no memory leaks)
- Debug trace logging (essential for debugging)
- Batch suspension API (bulk operation escape hatch)

❌ **REMOVED:**

- Built-in compiled prod mode (lazy init is enough)
- Hot path opt-out (educate users instead)
- Parallel v2 implementation (breaking changes ok)
- Legacy adapters (no ecosystem to migrate)
- DevTools interceptor internals (YAGNI)

⚠️ **DEFERRED:**

- Separate entry points (measure bundle impact first)
- Enhancer validation helper (wait for ecosystem)

---

## Phase 1: Type Definitions ✅

**Status:** COMPLETE

- [x] EntitySignal, EntityConfig, hooks, PathNotifier interface
- [x] Commit: 8c4ef01
- [x] No TypeScript errors

---

## Phase 2: PathNotifier Core + Optimizations ⏳

### [ ] Create path-notifier.ts (~400 lines)

**Architecture Improvements:**

- [ ] Lazy initialization (no creation until first .with() call)
- [ ] Per-path subscriber map for O(1) exact match
- [ ] Support wildcard patterns (\* for children, \*\* for descendants)
- [ ] Support function predicates for custom filtering

```typescript
class PathNotifier {
  // Lazy init
  static create(): PathNotifier {
    return new PathNotifier();
  }

  // Per-path optimization
  private exact = new Map<string, Set<Handler>>(); // O(1) lookup
  private prefixes = new Map<string, Set<Handler>>(); // 'users.*'
  private wildcards = Set<Handler>; // '**'

  // WeakRef cleanup
  private refs = new WeakMap<object, unsubscribe>();

  notify(path: string, value: unknown, prev: unknown) {
    // Fast path: exact match (most common)
    this.exact.get(path)?.forEach((h) => h(value, prev, path));

    // Medium path: prefix match
    const prefix = path.split('.')[0];
    this.prefixes.get(prefix)?.forEach((h) => h(value, prev, path));

    // Slow path: wildcards (only if subscribed)
    if (this.wildcards.size) {
      this.wildcards.forEach((h) => h(value, prev, path));
    }
  }

  // WeakRef support
  subscribeWith(context: object, pattern: string, handler: Handler): void {
    this.subscribe(pattern, handler);
    // Auto-cleanup when context is GC'd
    this.refs.set(context, () => this.unsubscribe(pattern, handler));
  }
}
```

### [ ] Create path-notifier.spec.ts (~400 lines)

Test coverage:

- [ ] Pattern matching (exact, wildcard, predicate)
- [ ] O(1) exact path notification
- [ ] Subscription/unsubscription lifecycle
- [ ] WeakRef auto-cleanup
- [ ] Interception with blocking and async support
- [ ] Performance: notify() < 1ms for 1000 handlers
- [ ] Memory cleanup verified

---

## Phase 3: SignalTree Core Integration ⏳

### [ ] Modify packages/core/src/lib/signal-tree.ts

**Architecture Improvements:**

- [ ] Lazy PathNotifier initialization (`_pathNotifier: undefined`)
- [ ] Proxy-only interception (wrap signals at access time, not creation)
- [ ] Zero overhead for unenhanced trees

```typescript
class SignalTree<T> {
  // Lazy init (not created until .with() called)
  private _pathNotifier: PathNotifier | undefined;

  get pathNotifier(): PathNotifier {
    if (!this._pathNotifier) {
      this._pathNotifier = PathNotifier.create();
    }
    return this._pathNotifier;
  }

  // Proxy-only wrapping (wrap at access, not creation)
  private createAccessProxy(signals: Record<string, WritableSignal<any>>) {
    return new Proxy(signals, {
      get: (target, path: string | symbol) => {
        const signal = target[path];
        // Wrap only when accessed
        return this.wrapSignalForTracking(signal, path);
      },
    });
  }
}
```

**Test coverage:**

- [ ] All mutation types trigger PathNotifier
- [ ] Nested paths accurate
- [ ] Zero overhead when PathNotifier unused
- [ ] No performance regression vs v4
- [ ] Proper cleanup on destroy

---

## Phase 4: EntitySignal + Selective Enhancement ⏳

### [ ] Create EntitySignal implementation (~400 lines)

**Features:**

- [ ] Map<K, WritableSignal<E>> storage for O(1) operations
- [ ] Full CRUD (addOne/Many, updateOne/Many/Where, removeOne/Many/Where, upsertOne/Many)
- [ ] Queries (all, count, ids, has, isEmpty, where, find, byId)
- [ ] Local hooks (tap, intercept)
- [ ] Integration with PathNotifier for global enhancers

### [ ] Add Selective Path Enhancement (~150 lines)

**New Pattern:**

```typescript
// Before: Track everything globally
const tree = signalTree(state).with(withTimeTravel());

// After: Enhance only what you need
const tree = signalTree(state);
tree.$.users.with(withTimeTravel()); // Track entities
tree.$.settings.with(withPersistence()); // Persist settings
tree.$.ui.mouse; // ← zero overhead, no tracking
```

This is the elegant answer to "what about hot paths?"

**Implementation:**

- [ ] .with() method on EntitySignal and tree.$
- [ ] Per-collection enhancer chains
- [ ] Isolated PathNotifier subscriptions per enhanced path

**Tests:**

- [ ] Global enhancement works
- [ ] Per-path enhancement works
- [ ] Unenhanced paths have zero overhead
- [ ] Mixed enhanced/unenhanced paths work together

---

## Phase 5: Fix Enhancers (New Implementations) ⏳

### [ ] 5.1: withBatching → Instance-Scoped Queue

**Changes:**

- [ ] Remove global `updateQueue`, `flushTimeoutId`, `currentBatchingConfig`
- [ ] Each tree instance has isolated queue
- [ ] Add `tree.suspend()` API for bulk operations

```typescript
tree.suspend(() => {
  // All mutations inside batched into single notification
  for (let i = 0; i < 10000; i++) {
    tree.$.items.addOne(item);
  }
  // One batch notification instead of 10000
});
```

**Tests:**

- [ ] Multiple trees have independent queues
- [ ] Queue isolation verified
- [ ] Suspension API works for bulk ops
- [ ] Performance comparable to v4

---

### [ ] 5.2: withPersistence → Effect-Based (No Polling!)

**Major Improvement:** Remove 50ms polling loop entirely!

```typescript
export function withPersistence<T>(config: PersistenceConfig) {
  return (tree: SignalTree<T>) => {
    // Use Angular's native effect() for dependency tracking
    effect(() => {
      const state = tree(); // Reads tracked signal
      debouncedSave(state); // Called only on actual changes
    });

    return tree;
  };
}
```

**Why better:**

- ✅ Zero polling (only called when tree changes)
- ✅ Angular's effect() handles cleanup
- ✅ Truly signal-native
- ✅ Much simpler code

**Performance:**

- [ ] Verify 0 calls/sec when idle (was 20,000/sec)
- [ ] Memory cleanup on destroy
- [ ] Debouncing works correctly

---

### [ ] 5.3: withTimeTravel → Structural Sharing

**Major Improvement:** O(1) snapshots instead of O(n) deepClone!

```typescript
interface HistoryEntry<T> {
  path: string; // 'users.u1.name'
  prev: unknown; // 'Alice'
  next: unknown; // 'Bob'
  timestamp: number;
}

// Memory: 1000 mutations = ~KB (diffs) not MB (full clones)
// This makes time travel viable for large state
```

**Implementation:**

- [ ] Intercept all mutations
- [ ] Store only (path, prev, next) triplets
- [ ] Reconstruct state via applying patches
- [ ] Undo/redo via applying inverse patches

**Benefits:**

- [ ] Massive memory reduction
- [ ] Large state trees now viable for time travel
- [ ] O(1) snapshot vs O(n) deepClone

**Tests:**

- [ ] All mutation types tracked
- [ ] History size efficient
- [ ] Undo/redo works
- [ ] Memory usage within expectations

---

### [ ] 5.4: withDevTools → PathNotifier Subscription

Simple rewrite using PathNotifier:

- [ ] Subscribe to all changes via PathNotifier
- [ ] Send to Redux DevTools
- [ ] Handle time-travel from DevTools

No special "DevTools interceptor infrastructure"—just subscribe like other enhancers.

---

## Phase 6: Entity + Enhancer Integration ⏳

- [ ] Entities + batching suspension work together
- [ ] Entities + effect-based persistence
- [ ] Entities + time travel with structural sharing
- [ ] Entities + DevTools tracking
- [ ] All enhancers work together without interference
- [ ] Debug trace shows entity mutation flow

---

## Phase 7: Documentation & Migration ⏳

### [ ] Update Documentation

- [ ] Entity guide with selective enhancement examples
- [ ] Batching suspension API documentation
- [ ] Effect-based persistence benefits
- [ ] Debug mode usage guide
- [ ] Performance tuning guide

### [ ] Create MIGRATION_v5.md

- [ ] Before/after for each major feature
- [ ] Deprecation warnings guide
- [ ] New selective enhancement pattern
- [ ] Persistence API changes (polling → effect-based)

### [ ] Demo App Updates

- [ ] Use selective enhancement pattern
- [ ] Show batching suspension for bulk operations
- [ ] Highlight persistence improvements (no polling)

---

## Phase 8: Release v5.0 ⏳

- [ ] All tests pass
- [ ] Bundle size acceptable (~2.5 KB added)
- [ ] Performance benchmarks show improvements
- [ ] Memory cleanup verified (no leaks)
- [ ] Migration guide clear
- [ ] Publish to npm
- [ ] Create GitHub release

---

## Implementation Order (Revised)

```
Phase 2: PathNotifier Core (include all optimizations)
  ├─ Per-path subscriber map
  ├─ Lazy initialization
  ├─ WeakRef cleanup
  └─ Debug trace logging

Phase 3: SignalTree Integration
  ├─ Lazy PathNotifier init
  └─ Proxy-only interception

Phase 4: EntitySignal + Selective Enhancement
  ├─ EntitySignal with hooks
  └─ .with() pattern on collections

Phase 5: Enhancer Implementations (New!)
  ├─ Batching (instance-scoped queue + suspension)
  ├─ Persistence (effect-based, no polling)
  ├─ TimeTravel (structural sharing, O(1))
  └─ DevTools (PathNotifier subscription)

Phase 6-8: Integration, documentation, release
```

---

## Performance Targets (Updated)

| Metric              | Target                  | Impact  |
| ------------------- | ----------------------- | ------- |
| Entity updateOne    | O(1) (was O(n))         | 40-100x |
| Persistence calls   | 0/sec idle (was 20k)    | ∞       |
| TimeTravel memory   | O(k) diffs (was O(n))   | 50-100x |
| PathNotifier notify | < 1ms for 1000 handlers | ✅      |
| Tree creation       | O(1) lazy (was O(n))    | ✅      |
| Bundle size         | +2.5 KB justified       | ✅      |

---

## Success Criteria (Updated)

### Code Quality

- [ ] 0 global mutable state
- [ ] 100% type coverage
- [ ] All tests pass
- [ ] No TypeScript errors

### Performance

- [ ] Entity ops 40-100x faster
- [ ] Persistence 0 calls/sec idle
- [ ] TimeTravel memory efficient (structural sharing)
- [ ] PathNotifier < 1% overhead
- [ ] No performance regression

### DX

- [ ] Selective enhancement pattern clear
- [ ] tree.suspend() obvious usage
- [ ] Debug trace helpful
- [ ] Migration path clear

### Reliability

- [ ] No memory leaks
- [ ] WeakRef cleanup verified
- [ ] Proper error handling
- [ ] Async validation support

---

## Risk Mitigation (Updated)

| Risk                    | Likelihood | Impact | Mitigation                  |
| ----------------------- | ---------- | ------ | --------------------------- |
| Effect() complexity     | Low        | Medium | Stick to simple pattern     |
| Structural sharing bugs | Low        | High   | Comprehensive tests         |
| WeakRef browser support | Very Low   | Low    | Polyfill available          |
| Lazy init edge cases    | Low        | Medium | Test all enhancement combos |

---

## Bundle Size Projection (Updated)

```
Core improvements:
  PathNotifier (lazy):       0 KB when unused, ~0.8 KB if used
  EntitySignal:              1.5 KB
  Proxy interception:        included in core

Enhancers (rewritten):
  Batching (instance):       0.6 KB (smaller, no global state)
  Persistence (effect):      0.4 KB (SMALLER than polling!)
  TimeTravel (structural):   0.8 KB (smaller than deepClone!)
  DevTools:                  0.3 KB

Estimated total:             +2.5 KB gzipped
Justified by benefits
```

---

## Confidence Level

🟢 **VERY HIGH**

- ✅ All 20 options evaluated against SignalTree principles
- ✅ 9 improvements locked in
- ✅ Architecture cohesive and elegant
- ✅ Performance targets realistic
- ✅ No breaking architectural decisions needed

Ready to implement.
