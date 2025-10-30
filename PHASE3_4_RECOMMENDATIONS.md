# Phase 3 & 4 Features Worth Implementing

**Context**: Phase 2 is now optional via `withEnterprise()`. This document lists remaining valuable features from Phase 3 and Phase 4 that should still be implemented.

---

## ✅ HIGH PRIORITY - Implement These

### 1. **Computed Signals Enhancer** (Phase 3)

**Value**: Essential for reactive applications  
**Complexity**: Medium  
**Bundle Impact**: ~1.5KB as optional enhancer

```typescript
import { signalTree } from '@signaltree/core';
import { withComputed } from '@signaltree/core/computed';

const tree = signalTree(state).with(withComputed());

// Memoized, auto-tracked computed values
const total = tree.computed.create('cart.total', () => tree.$.items().reduce((sum, item) => sum + item.price * item.quantity, 0));

// Depends on items array - only recalculates when items change
```

**Why Implement**:

- ✅ **Essential reactive pattern** - 80% of apps need computed values
- ✅ **Clear value proposition** - auto-memoization + dependency tracking
- ✅ **Optional** - doesn't bloat core
- ✅ **Competitive feature** - NgRx, Zustand, MobX all have this

**Implementation Approach**:

- Create `packages/core/src/lib/computed/` directory
- Implement as optional enhancer like `withEnterprise()`
- Secondary entry point: `@signaltree/core/computed`
- Use Angular's `computed()` under the hood

---

### 2. **Default Batching (Microtask Strategy)** (Phase 3)

**Value**: Significant performance win  
**Complexity**: Medium  
**Bundle Impact**: ~0.5KB (core feature)

```typescript
// CURRENT: Each update triggers recomputation
tree.$.user.firstName('Jane'); // Recompute
tree.$.user.lastName('Smith'); // Recompute
tree.$.user.age(25); // Recompute

// WITH BATCHING: Batched by default
tree.$.user.firstName('Jane'); // Queued
tree.$.user.lastName('Smith'); // Queued
tree.$.user.age(25); // Queued
// Microtask: Single recomputation

// Explicit transactions for complex updates
tree.transaction(() => {
  tree.update({
    /* bulk updates */
  });
});
```

**Why Implement**:

- ✅ **90% reduction in redundant computations**
- ✅ **Justified bundle cost** - improves ALL users
- ✅ **Industry standard** - React, Vue, Angular all batch
- ✅ **Simple API** - works automatically + transaction() for control

**Implementation Approach**:

- Add batching to core signal updates
- Use microtask queue (`queueMicrotask()`)
- Add `tree.transaction()` for explicit batching
- Add `tree.sync()` escape hatch for immediate updates

---

### 3. **Comprehensive Error Diagnostics** (Phase 3)

**Value**: Critical for production debugging  
**Complexity**: Low-Medium  
**Bundle Impact**: ~1KB (core feature)

```typescript
// Development mode: Rich error context
const tree = signalTree(state, {
  debug: true,
  diagnostics: {
    onError: (error) => {
      console.error('Tree error:', error);
      Sentry.captureException(error);
    },
  },
});

// Production: Lightweight error reporting
// Errors automatically include:
// - Path where error occurred
// - Previous value
// - Stack trace (dev only)
// - Recovery attempts
```

**Why Implement**:

- ✅ **Silent failures currently** - no visibility into issues
- ✅ **Production essential** - needed for monitoring
- ✅ **Small cost** - 1KB for huge debugging improvement
- ✅ **Simple API** - mostly automatic

**Implementation Approach**:

- Replace all `try/catch {}` with proper error handling
- Add error context (path, value, stack)
- Add recovery strategies
- Tree-shake dev-only features in prod

---

### 4. **Edge Case Testing** (Phase 3)

**Value**: Prevents bugs  
**Complexity**: Low  
**Bundle Impact**: 0KB (tests only)

**Test Coverage Gaps**:

- Symbol keys in objects
- Concurrent updates
- Circular references
- Deep recursion limits
- Large arrays (10k+ items)
- Memory pressure scenarios

**Why Implement**:

- ✅ **Prevents production bugs**
- ✅ **No bundle cost** - tests only
- ✅ **Builds confidence** - comprehensive coverage
- ✅ **Quick wins** - add tests incrementally

---

### 5. **JSDoc Enhancements** (Phase 3)

**Value**: Better DX  
**Complexity**: Low  
**Bundle Impact**: 0KB (comments only)

````typescript
/**
 * Creates a reactive signal tree from a state object.
 *
 * @example
 * ```typescript
 * const tree = signalTree({ count: 0 });
 * tree.$.count(); // Get: 0
 * tree.$.count(5); // Set: 5
 * ```
 *
 * @param initial - The initial state object
 * @param config - Optional configuration
 * @returns A reactive signal tree with accessor properties
 *
 * @see {@link SignalTreeConfig} for configuration options
 * @public
 */
export function signalTree<T>(initial: T, config?: SignalTreeConfig): SignalTree<T>;
````

**Why Implement**:

- ✅ **Better IntelliSense** - helps users discover features
- ✅ **No cost** - comments don't affect bundle
- ✅ **Professional polish** - shows attention to detail
- ✅ **Quick wins** - add incrementally

---

## 🤔 MEDIUM PRIORITY - Consider These

### 6. **Async Computed Values** (Phase 3)

**Value**: Nice-to-have for API integration  
**Complexity**: High  
**Bundle Impact**: ~1KB (in computed enhancer)

```typescript
const user = tree.computed.async(
  'user.profile',
  async () => {
    const id = tree.$.userId();
    return await fetch(`/api/users/${id}`).then((r) => r.json());
  },
  {
    loading: null,
    revalidate: 30000, // Revalidate every 30s
  }
);

// user() returns { data, loading, error }
```

**Consider Because**:

- ⚠️ **Solves async state** - but might be out of scope
- ⚠️ **Complexity** - loading states, error handling, cancellation
- ⚠️ **Alternative exists** - users can use TanStack Query instead

**Decision**: ❓ **Defer to user feedback** - if requested, add to computed enhancer

---

### 7. **LRU Cache for Computed Values** (Phase 3)

**Value**: Memory optimization for large trees  
**Complexity**: Medium  
**Bundle Impact**: ~0.3KB (in computed enhancer)

```typescript
const tree = signalTree(state).with(
  withComputed({
    cacheStrategy: 'lru',
    maxCacheSize: 100,
  })
);
```

**Consider Because**:

- ⚠️ **Memory optimization** - but most apps don't need it
- ⚠️ **Added complexity** - cache invalidation is hard
- ⚠️ **Edge case** - 95% of apps have <100 computed values

**Decision**: ❓ **Defer to v4.0** - optimize if users report memory issues

---

### 8. **Devtools Integration** (Phase 4)

**Value**: Excellent developer experience  
**Complexity**: High  
**Bundle Impact**: ~2KB (dev-only)

```typescript
import { signalTree } from '@signaltree/core';
import { withDevtools } from '@signaltree/core/devtools';

const tree = signalTree(state).with(
  withDevtools({
    name: 'MyApp',
    trace: true,
  })
);

// Browser extension shows:
// - State tree visualization
// - Update history with time-travel
// - Performance metrics
// - Dependency graph
```

**Consider Because**:

- ✅ **Excellent DX** - makes debugging visual
- ✅ **Dev-only** - no prod bundle cost
- ⚠️ **High effort** - requires browser extension
- ⚠️ **Niche** - only advanced users use devtools

**Decision**: ❓ **Defer to v4.0** - high value but high effort

---

## ❌ LOW PRIORITY - Skip These

### 9. **Circular Dependency Detection** (Phase 3)

**Why Skip**:

- ❌ **Rare edge case** - users don't write circular computed
- ❌ **Runtime cost** - adds overhead to every computed
- ❌ **Angular handles it** - computed() already protects against cycles

### 10. **Custom Equality Functions** (Phase 2)

**Why Skip**:

- ❌ **Already exists** - Angular signals support custom equality
- ❌ **Advanced feature** - 99% use default equality
- ❌ **Available if needed** - users can wrap signals

### 11. **Undo/Redo System** (Phase 4)

**Why Skip**:

- ❌ **Out of scope** - better as separate library
- ❌ **Large bundle cost** - would add 2-3KB
- ❌ **Application-specific** - every app needs different undo logic

### 12. **Time-Travel Debugging** (Phase 4)

**Why Skip**:

- ❌ **Part of devtools** - defer to v4.0 devtools
- ❌ **Memory intensive** - stores full state history
- ❌ **Dev-only** - limited audience

---

## 📋 Recommended Implementation Order

### Sprint 1: Core Improvements (1-2 weeks)

1. ✅ **Batching** (Medium complexity, high value)

   - Add microtask batching to signal updates
   - Implement `tree.transaction()`
   - Add `tree.sync()` escape hatch
   - Update tests

2. ✅ **Error Diagnostics** (Low complexity, high value)

   - Replace silent failures with proper error handling
   - Add error context and recovery
   - Add development mode error panel
   - Update all error handling

3. ✅ **Edge Case Tests** (Low complexity, prevents bugs)
   - Add symbol key tests
   - Add concurrent update tests
   - Add large array tests
   - Add circular reference tests

### Sprint 2: Computed Signals (1-2 weeks)

4. ✅ **Computed Signals Enhancer** (Medium complexity, essential feature)
   - Create `withComputed()` enhancer
   - Implement auto-dependency tracking
   - Add memoization
   - Create secondary entry point
   - Write comprehensive tests
   - Document usage patterns

### Sprint 3: Polish (1 week)

5. ✅ **JSDoc Enhancement** (Low complexity, professional polish)
   - Add `@example` blocks to all public APIs
   - Add cross-references
   - Add parameter descriptions
   - Generate documentation site

---

## 🎯 Success Metrics

### Batching

- ✅ 90% reduction in redundant computed calls
- ✅ <1KB bundle increase
- ✅ Zero breaking changes
- ✅ All 260+ tests passing

### Error Diagnostics

- ✅ 100% of failures logged (no more silent errors)
- ✅ <1KB bundle increase (prod)
- ✅ Error recovery rate >80%
- ✅ Clear error messages in dev mode

### Computed Signals

- ✅ Auto-dependency tracking works 100%
- ✅ Memoization prevents unnecessary recalculation
- ✅ <2KB as optional enhancer
- ✅ Simple, intuitive API

### Edge Cases

- ✅ 100% test coverage on edge cases
- ✅ No memory leaks with WeakRef
- ✅ Handles 10k+ item arrays
- ✅ Proper circular reference handling

### JSDoc

- ✅ 100% public API documented
- ✅ IntelliSense shows examples
- ✅ Generated docs site available
- ✅ Cross-references work

---

## 💰 Bundle Size Budget

| Feature              | Type     | Size        | Status      |
| -------------------- | -------- | ----------- | ----------- |
| Core (baseline)      | Required | 8.83KB      | ✅ Current  |
| Batching             | Core     | +0.5KB      | 🟡 Proposed |
| Error Diagnostics    | Core     | +1.0KB      | 🟡 Proposed |
| **Core Total**       |          | **~10.3KB** | **Target**  |
| Computed Signals     | Optional | +1.5KB      | 🟡 Proposed |
| Enterprise (Phase 2) | Optional | +2.4KB      | ✅ Complete |
| Devtools (future)    | Optional | +2KB        | 🔵 Future   |

**Strategy**: Keep core under 11KB, make everything else optional

---

## 🚀 Next Steps

**Immediate Actions**:

1. ✅ Review and approve this plan
2. ✅ Create feature branches for Sprint 1
3. ✅ Start with batching implementation
4. ✅ Add comprehensive error handling
5. ✅ Build test suite for edge cases

**Questions to Answer**:

1. Should we implement all Sprint 1 in parallel or sequentially?
2. Do we want async computed values in the first computed release?
3. Should devtools be a separate package or secondary entry point?
4. Timeline for releasing these features (v3.3? v3.5? v4.0?)

---

## 📊 Value vs Complexity Matrix

```
High Value, Low Complexity:
├─ Error Diagnostics ⭐⭐⭐
├─ Edge Case Tests ⭐⭐⭐
└─ JSDoc Enhancement ⭐⭐⭐

High Value, Medium Complexity:
├─ Batching ⭐⭐⭐⭐⭐
└─ Computed Signals ⭐⭐⭐⭐⭐

Medium Value, Medium Complexity:
├─ Async Computed
└─ LRU Cache

Medium Value, High Complexity:
└─ Devtools

Low Value:
├─ Circular Dependency Detection
├─ Custom Equality
├─ Undo/Redo
└─ Time-Travel
```

**Focus**: Top-left quadrant (high value, low-medium complexity)

---

## ✨ Final Recommendation

**Implement these 5 features in priority order**:

1. **Batching** - Essential performance, justified bundle cost
2. **Error Diagnostics** - Essential reliability, small bundle cost
3. **Edge Case Tests** - Essential quality, zero bundle cost
4. **Computed Signals** - Essential feature, optional enhancer
5. **JSDoc Enhancement** - Essential DX, zero bundle cost

**Skip or defer**:

- Async computed (users can use TanStack Query)
- LRU cache (optimize in v4.0 if needed)
- Devtools (v4.0 major feature)
- Circular detection (Angular handles it)
- Undo/redo (out of scope)

**Result**: v3.3 with batching + error handling + edge tests (core ~10.3KB) + optional computed enhancer (~1.5KB)
