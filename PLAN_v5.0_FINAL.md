# SignalTree v5.0 - Final Implementation Plan

**Status:** Reviewed, consolidated, and scope-corrected based on teammate feedback  
**Timeline:** 14-17 days (includes critical enhancer migrations + fixes)  
**Complexity:** Medium (core is simple, but 4 broken enhancers need migration)

---

## Executive Summary

Add **PathNotifier infrastructure** (simple notification system) and **entity collections** (Map-based CRUD with scoped hooks) to SignalTree while keeping the architecture minimal and focused.

### What We're Building

| Component         | Purpose                                 | Size       |
| ----------------- | --------------------------------------- | ---------- |
| **PathNotifier**  | Simple change notification system       | ~50 lines  |
| **Entity System** | Map-based collections with scoped hooks | ~500 lines |
| **Integration**   | Wire components together                | ~100 lines |
| **Tests & Docs**  | Validation and examples                 | ~300 lines |

### What We're NOT Building

- Complex per-path subscriber maps (keep it simple)
- Computed change streams (harmful to performance)
- Selective path enhancement APIs (cognitive overload)
- Separate entry points (lazy init is enough)
- Rebuilds of existing infrastructure (WeakRef, debug mode, structural sharing already exist)

### What We ARE Fixing

This isn't just "new features." We're fixing broken implementations in 4 enhancers and core:

| Component           | Current Issue                              | Fix                                      |
| ------------------- | ------------------------------------------ | ---------------------------------------- |
| **Batching**        | Global mutable state (shared across trees) | Instance-scoped queue via PathNotifier   |
| **Persistence**     | 50ms polling never cleaned up              | PathNotifier subscription (event-driven) |
| **TimeTravel**      | Misses leaf mutations (tree.$.x.y changes) | PathNotifier subscription catches all    |
| **DevTools**        | Misses leaf mutations                      | PathNotifier subscription catches all    |
| **Core Middleware** | tree.addTap/removeTap don't scale          | Replace with scoped entity hooks         |

---

## Architecture Overview

```
SignalTree v5.0
├── PathNotifier (internal)
│   └── Simple subscribe/notify for all mutations
├── Entity System (public)
│   ├── EntitySignal<Entity, Key>
│   ├── CRUD: addOne, updateOne, removeOne, upsertOne
│   └── Hooks: tap() and intercept()
└── Global Enhancers (existing)
    ├── withTimeTravel (wire structural sharing)
    ├── withLogging
    ├── withBatching
    └── withPersistence
```

### Key Principles

1. **Invisible Infrastructure** - Users work with signals and entities, not PathNotifier
2. **Signal-Native DX** - Feels like Angular signals, not a special library
3. **Minimal API** - Few methods, obvious behavior
4. **Backward Compatible** - Existing SignalTree code unchanged
5. **Type-Safe** - No string paths in public API

---

## Phase Breakdown

### Phase 1: Type Definitions ✅ COMPLETE

**Deliverable:** TypeScript interfaces for all v5.0 concepts

```
Commit: 8c4ef01
Files: packages/core/src/lib/entity-system.types.ts
Lines: 500+
Status: ✅ No TypeScript errors
```

---

### Phase 2: PathNotifier Core (2 days)

**Deliverable:** Simple, internal notification system

**What to build:**

```typescript
// packages/core/src/lib/path-notifier.ts (~50 lines)

class PathNotifier {
  private subscribers = new Map<string, Set<Handler>>();

  subscribe(pattern: string, handler: Handler): () => void {
    if (!this.subscribers.has(pattern)) {
      this.subscribers.set(pattern, new Set());
    }
    const handlers = this.subscribers.get(pattern)!;
    handlers.add(handler);

    return () => handlers.delete(handler);
  }

  notify(path: string, value: unknown, prev: unknown): void {
    // Simple pattern matching
    for (const [pattern, handlers] of this.subscribers) {
      if (this.matches(pattern, path)) {
        handlers.forEach((h) => h(value, prev, path));
      }
    }
  }

  private matches(pattern: string, path: string): boolean {
    // Handle wildcards: "users.*" matches "users.u1"
    // Handle globstar: "**" matches everything
    // Or just exact match for v1
  }
}
```

**Integration points:**

- Inject into SignalTree constructor
- Call notify() when tree mutations occur
- Lazy-create on first use (no overhead if unused)

**Key guideline:** Keep it simple. No interceptors, no complex pattern matching. Just notify subscribers.

---

### Phase 3: Entity System (5-7 days)

**Deliverable:** Map-based entity collections with hooks

**What to build:**

```typescript
// packages/core/src/lib/entity-signal.ts (~500 lines)

export class EntitySignal<Entity, Key = string> {
  private storage = new Map<Key, Entity>();

  constructor(private config: EntityConfig<Entity, Key>, private pathNotifier: PathNotifier) {}

  // CRUD operations
  addOne(entity: Entity): Key {
    const key = this.config.selectKey(entity);
    this.storage.set(key, entity);
    this.pathNotifier.notify(`entities.${key}`, entity, undefined);
    return key;
  }

  updateOne(key: Key, updates: Partial<Entity>): void {
    const entity = this.storage.get(key);
    if (!entity) throw new Error(`Entity ${key} not found`);

    const prev = entity;
    const next = { ...entity, ...updates };
    this.storage.set(key, next);
    this.pathNotifier.notify(`entities.${key}`, next, prev);
  }

  removeOne(key: Key): void {
    const prev = this.storage.get(key);
    this.storage.delete(key);
    this.pathNotifier.notify(`entities.${key}`, undefined, prev);
  }

  // Derived signals
  all(): Signal<Entity[]> {
    return computed(() => Array.from(this.storage.values()));
  }

  // Hooks (scoped to this entity signal)
  tap(handlers: EntityHooks<Entity>): () => void {
    // Listen to mutations, read-only
    const unsubs = [];
    if (handlers.add) {
      unsubs.push(
        this.pathNotifier.subscribe('entities.*', (value, prev) => {
          if (prev === undefined) handlers.add?.(value);
        })
      );
    }
    // ... similar for update, remove
    return () => unsubs.forEach((u) => u());
  }

  intercept(handlers: EntityHooks<Entity>): () => void {
    // Listen and potentially block/transform mutations
    // Implementation depends on PathNotifier interceptor support
    // If too complex, defer to v5.1
  }
}
```

**EntitySignal scoping rules:**

- Hooks are scoped to the EntitySignal they're called on
- No global pollution
- Multiple EntitySignals can coexist without conflicts

**Integration with SignalTree:**

```typescript
// In tree.$, expose entity signals
tree.$.users; // EntitySignal<User, string>
tree.$.posts; // EntitySignal<Post, number>

// Developer experience
const userId = tree.$.users.addOne({ id: 'u1', name: 'Alice' });
tree.$.users.updateOne(userId, { name: 'Alice Updated' });

// With hooks
tree.$.users.tap({
  add: (user) => console.log('User added:', user),
  remove: (user) => console.log('User removed:', user),
});
```

---

### Phase 4: Enhancer Migration (3-4 days)

**Deliverable:** Migrate 4 broken enhancers to use PathNotifier + remove broken core middleware

#### 4.1 Batching Enhancer (1 day)

**Current Issue:** Global mutable state (broken—shared by ALL trees)

```typescript
// ❌ BROKEN: Global state
let updateQueue = []; // Shared across instances
let isScheduled = false;
```

**New Implementation:**

```typescript
// ✅ FIXED: Instance-scoped via PathNotifier
export function withBatching<T>() {
  return (tree: SignalTree<T>) => {
    const queue = []; // Per-tree instance
    const pathNotifier = tree.pathNotifier;

    pathNotifier.subscribe('**', (value, prev, path) => {
      queue.push({ path, value, prev });
      if (!isScheduled) {
        isScheduled = true;
        queueMicrotask(() => {
          queue.forEach((item) => tree.notifyChange(item));
          queue.length = 0;
          isScheduled = false;
        });
      }
    });

    return tree;
  };
}
```

#### 4.2 Persistence Enhancer (1 day)

**Current Issue:** 50ms polling (never cleaned up—always running)

```typescript
// ❌ BROKEN: Polls every 50ms even if idle
const interval = setInterval(() => checkForChanges(tree), 50);
// No cleanup on destroy()
```

**New Implementation:**

```typescript
// ✅ FIXED: Only runs on actual mutations
export function withPersistence<T>(config: PersistenceConfig) {
  return (tree: SignalTree<T>) => {
    const unsub = tree.pathNotifier.subscribe((value, prev, path) => {
      if (config.shouldPersist(path)) {
        debouncedSave(tree());
      }
    });

    tree.onDestroy(() => unsub());
    return tree;
  };
}
```

**Impact:** 50 ms polling → 0 calls while idle

#### 4.3 TimeTravel Enhancer (1 day)

**Current Issue:** Only catches tree() calls, misses leaf updates via tree.$.x.y()

```typescript
// ❌ BROKEN: Can't track tree.$.users.name() changes
const enhanced = function (...args) {
  const result = original(...args);
  recordHistory(result); // Only sees full tree snapshots
  return result;
};
```

**New Implementation:**

```typescript
// ✅ FIXED: PathNotifier catches everything
export function withTimeTravel<T>(config: TimeTravelConfig = {}) {
  return (tree: SignalTree<T>) => {
    const history = [tree()];

    tree.pathNotifier.subscribe('**', (value, prev, path) => {
      const snapshot = config.useStructuralSharing ? structuralClone(tree()) : deepClone(tree());
      history.push(snapshot);
    });

    tree.undo = () => {
      if (history.length > 1) {
        history.pop();
        restoreState(tree, history[history.length - 1]);
      }
    };

    return tree;
  };
}
```

#### 4.4 DevTools Enhancer (0.5 days)

**Current Issue:** Same as TimeTravel—only sees top-level mutations

**New Implementation:**

```typescript
// ✅ FIXED: PathNotifier gives ALL mutations with full context
export function withDevTools<T>() {
  return (tree: SignalTree<T>) => {
    tree.pathNotifier.subscribe('**', (value, prev, path) => {
      window.__SIGNALTREE_DEVTOOLS__?.recordMutation({
        path,
        value,
        prev,
        timestamp: Date.now(),
      });
    });
    return tree;
  };
}
```

#### 4.5 Remove Broken Core Middleware (0.5 days)

**Current Issue:** tree.addTap() / removeTap() don't scale (global to tree, hard to remove)

```typescript
// ❌ REMOVE from SignalTree interface:
addTap(middleware: Middleware<T>): void;    // Global to entire tree
removeTap(id: string): void;                // Requires ID management

// ✅ REPLACE with scoped entity hooks:
tree.$.users.tap({
  add: (user) => console.log('Added:', user),
  update: (user) => console.log('Updated:', user),
  remove: (user) => console.log('Removed:', user),
});

tree.$.posts.tap({
  add: (post) => console.log('Post added:', post),
});
```

**Why better:**

- Per-entity scoping (users tap gets only user events, not all tree events)
- Easy removal (just call returned unsubscribe function)
- No ID management (no naming conflicts)
- Matches Angular patterns (lifecycle hooks on components)

---

### Phase 5: Testing & Validation (1 day)

**What to test:**

- PathNotifier basic notification
- Entity CRUD operations
- Entity hooks (tap, intercept)
- Multiple entity signals in one tree
- Integration with enhancers
- Memory cleanup (WeakRef where applicable)

**Coverage target:** >85% for all new code

---

### Phase 6: Documentation (1 day)

**What to document:**

- Entity system quick start
- CRUD examples
- Hooks patterns
- Performance characteristics
- Migration guide (if needed)

---

### Phase 7: Release & Polish (1 day)

**What to verify:**

- Build output correct
- TypeScript strict mode passes
- Bundle size acceptable
- All tests green
- README updated

---

## Timeline Summary

| Phase     | Task                                                                                 | Days           | Status   |
| --------- | ------------------------------------------------------------------------------------ | -------------- | -------- |
| 1         | Type definitions                                                                     | -              | ✅ DONE  |
| 2         | PathNotifier core                                                                    | 2              | ⏳ Ready |
| 3         | Entity system                                                                        | 5-7            | ⏳ Ready |
| 4         | Enhancer migration (batching, persistence, time-travel, devtools, remove middleware) | 3-4            | ⏳ Ready |
| 5         | Testing                                                                              | 1              | ⏳ Ready |
| 6         | Documentation                                                                        | 1              | ⏳ Ready |
| 7         | Release                                                                              | 1              | ⏳ Ready |
| **TOTAL** |                                                                                      | **14-17 days** |          |

**Timeline Reasoning:**

- **Was:** 20-25 days (overengineered with unnecessary features)
- **Now:** 14-17 days (focused: PathNotifier + entities + fix 4 broken enhancers)
- **Removed:** ~800 lines of premature optimizations
- **Added:** ~400 lines to fix existing broken code

---

## What We Learned

### Mistakes to Avoid

❌ **Effect-based persistence** - Forces full tree read on every change  
❌ **Computed change streams** - O(n) overhead on every access  
❌ **Selective path enhancement** - Scoping confusion, doubles cognitive load  
❌ **Per-path subscriber maps** - Premature optimization before profiling  
❌ **Batch suspension API** - Breaks "invisible infrastructure" principle  
❌ **Separate entry points** - Unnecessary choice burden  
❌ **Complex pattern matching** - Keep PathNotifier simple

### What We Did Right

✅ **Reuse existing infrastructure** - WeakRef, debug mode, structural sharing already exist  
✅ **Keep PathNotifier simple** - Just notify, no interceptors or complexity  
✅ **Map-based entities** - O(1) operations, clean semantics  
✅ **Scoped hooks** - No global state pollution  
✅ **Entity-first DX** - Matches how developers think

---

## Success Criteria

### Code Quality

- [ ] TypeScript strict mode ✅
- [ ] > 85% test coverage
- [ ] Zero console warnings
- [ ] Linting passes

### Performance

- [ ] Entity CRUD <1ms average
- [ ] Tree creation <5ms even with 1000 entities
- [ ] No memory leaks in hook cleanup
- [ ] Bundle size +5-10 KB gzipped

### Developer Experience

- [ ] Entity API feels like Angular signals
- [ ] Hooks work intuitively
- [ ] Documentation clear and complete
- [ ] Examples work copy-paste

### Compatibility

- [ ] All existing SignalTree tests pass
- [ ] No breaking changes
- [ ] Backward compatible

---

## How to Start

**Week 1:**

1. **Days 1-2:** PathNotifier core + Entity system (~2-3 days)

   - Files: `path-notifier.ts` (~50 lines), `entity-signal.ts` (~500 lines)
   - Quick: Just notify, CRUD, basic hooks

2. **Days 3-7:** Enhancer migration (~3-4 days)
   - Migrate: withBatching, withPersistence, withTimeTravel, withDevTools
   - Remove: tree.addTap/removeTap
   - Wire: structural sharing to time-travel

**Week 2:** 3. **Days 8-9:** Testing + integration (~2 days)

- Verify all CRUD ops work
- Verify all 4 migrated enhancers work
- Verify hooks cleanup
- Verify no memory leaks

4. **Days 10-11:** Documentation + migration guide (~2 days)

   - Entity quick start
   - Before/after for removed middleware
   - Enhancer examples
   - Migration guide for users

5. **Days 12-13:** Release prep (~1-2 days)
   - Build, bundle size check
   - All tests green
   - Tag and release

---

## Decision Log

**Decision:** Keep PathNotifier simple (no interceptors, no complex patterns)  
**Rationale:** YAGNI. Enhance later if needed. Current simplicity means fewer bugs.

**Decision:** Don't build separate entry points  
**Rationale:** Lazy initialization is enough. No user burden.

**Decision:** Don't implement selective path enhancement  
**Rationale:** Scoping is confusing. Filter functions in enhancers are sufficient.

**Decision:** Don't implement effect-based persistence  
**Rationale:** Forces full tree read on every change. PathNotifier subscription is cleaner.

**Decision:** Reuse existing structural sharing config  
**Rationale:** Already implemented. Just wire to time-travel. ~10 lines of code.

**Decision:** Fix broken enhancers as part of this release, not v5.1  
**Rationale:** PathNotifier exists now. Using it to fix batching/persistence/timetravel is faster than maintaining broken code. Removes technical debt.

**Decision:** Remove tree.addTap() / removeTap() in favor of entity hooks  
**Rationale:** Core middleware doesn't scale (global to tree, hard to remove). Entity hooks are scoped, returnable, match Angular patterns.

---

## References

- **Type Definitions:** See Phase 1 commit 8c4ef01
- **Architecture Details:** See ARCHITECTURE.md
- **Design Decisions:** See DESIGN_DECISIONS.md
- **Entity System Spec:** See ENTITY_REFACTOR_COMPLETE_PLAN.md
- **Honest Evaluation:** See HONEST_REEVALUATION.md

---

**Last Updated:** December 10, 2025  
**Status:** Ready to implement  
**Confidence:** 🟢 HIGH
