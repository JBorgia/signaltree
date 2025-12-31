# 🐛 CRITICAL BUG: tree.memoize() Not Actually Memoizing

## Problem

When using `memoization()` enhancer, the `tree.memoize()` method **does NOT actually memoize**. It continues to use the stub implementation that just wraps the function in `computed()` without any caching logic.

**User Report:**

- Tree state IS updating correctly (verified with debug logging)
- `tree.$.selectedDate.set()` IS being called
- But `tree.memoize((state) => { ... })` is NOT firing its recalculation logic

## Root Cause

In `packages/core/src/enhancers/memoization/lib/memoization.ts`, the `memoization()` function only implements:

- `tree.memoizedUpdate()`
- `tree.clearMemoCache()`
- `tree.getCacheStats()`

**But it does NOT override** `tree.memoize()`.

The stub implementation in `packages/core/src/lib/signal-tree.ts` (line 563) is never replaced:

```typescript
tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
  console.warn(SIGNAL_TREE_MESSAGES.MEMOIZE_NOT_ENABLED);
  void cacheKey;
  return computed(() => fn(tree())); // ← No memoization happening here!
};
```

This console.warn IS visible in tests, confirming memoization is disabled for `tree.memoize()`.

## Expected Behavior

When `memoization()` is applied, `tree.memoize()` should:

1. Cache the result based on the state values read inside the memoized function
2. Only recalculate when those state values change
3. Return the cached result when dependencies haven't changed

## Actual Behavior

Currently `tree.memoize()` just calls the function wrapped in `computed()`, which:

- Recalculates on EVERY single signal access in the component
- Ignores the `cacheKey` parameter completely
- Provides NO performance benefit

## Example of the Bug

```typescript
// This demonstrates the bug:
const tree = signalTree({
  selectedDate: new Date('2025-12-01'),
  logs: [...]
}).with(memoization());  // ← Memoization enabled

let filterCalls = 0;

// This is supposed to be memoized
const filteredLogs = tree.memoize((state) => {
  filterCalls++;  // This increments EVERY TIME
  return state.logs.filter(log =>
    log.date.toDateString() === state.selectedDate.toDateString()
  );
}, 'logs');

// User updates tree state
tree.$.selectedDate.set(new Date('2025-12-02'));

// Expected: filterCalls still === 1 (cached result)
// Actual: filterCalls === many more! (recalculating on every access)
```

## Solution Required

The `memoization()` function needs to override `tree.memoize()` with a proper implementation that:

1. Tracks which state properties are accessed inside the memoized function
2. Caches the result with a dependency set
3. Only recalculates when dependencies change
4. Uses the provided cache store and equality function

### Implementation Approach

```typescript
export function memoization<T>(config: MemoizationConfig = {}) {
  return (tree: ISignalTree<T>): MemoizedSignalTree<T> => {
    // ... existing setup code ...

    if (enabled) {
      // Add proper tree.memoize implementation
      (tree as any).memoize = <R>(fn: (state: T) => R, cacheKey?: string): Signal<R> => {
        return computed(() => {
          const currentState = originalTreeCall();
          const key = cacheKey || generateCacheKey(fn, [currentState]);

          // Check cache
          const cached = cache.get(key);
          if (cached && equalityFn(cached.deps, [currentState])) {
            return cached.value as R;
          }

          // Compute and cache
          const result = fn(currentState);
          cache.set(key, {
            value: result,
            deps: [currentState],
            timestamp: Date.now(),
            hitCount: 1,
          });

          return result;
        });
      };
    }

    return tree as MemoizedSignalTree<T>;
  };
}
```

## Tests Affected

All tests in `model-binding.spec.ts` that test memoization:

- "should call memoized filter on initialization"
- "should trigger memoization when date changes"
- "should filter logs by date correctly"
- "should not recompute if date doesn't actually change"
- etc.

These tests are currently passing because they don't check if memoization is actually happening - they just check final results.

## Real-World Impact

Any developer using `tree.memoize()` for performance optimization:

- Gets NO performance benefit
- Wastes time wondering why filters/computations aren't cached
- Experiences unexpected performance degradation

## Files to Modify

- `packages/core/src/enhancers/memoization/lib/memoization.ts` - Add `tree.memoize()` override
- Tests may need adjustment if they rely on specific recalculation counts
