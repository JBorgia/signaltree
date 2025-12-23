# Investigation Summary: tree.memoize() Not Firing on State Changes

## User Report

The user reported:

> "Using [(ngModel)]=currSelectedDate and (on select) with that debug method actually shows the state is updating, the memoization is just not firing"

**What this means:**

- `tree.$.selectedDate.set(newDate)` is being called and IS updating tree state ✅
- The memoized filter function is NOT recalculating when the date changes ❌
- The results remain cached even though the dependency changed

## Root Cause Analysis

### Issue Found: `tree.memoize()` uses stub implementation

The `withMemoization()` enhancer creates a cache store but **does NOT override** the `tree.memoize()` method.

**Current behavior:**

```typescript
// In signal-tree.ts (stub - never overridden)
tree.memoize = <R>(fn: (tree: T) => R, cacheKey?: string): Signal<R> => {
  console.warn(SIGNAL_TREE_MESSAGES.MEMOIZE_NOT_ENABLED);
  void cacheKey;
  return computed(() => fn(tree())); // ← Just wraps in computed()
};
```

**What happens:**

1. `tree.memoize()` returns a `computed()` signal
2. `computed()` tracks when `tree()` is called inside the callback
3. When ANY property in tree changes, the entire tree signal changes
4. This causes computed to re-evaluate the memoized function
5. **But** it doesn't actually cache the result based on dependencies

### Why the user sees this behavior

When the user updates the date via `(ngModelChange)`:

```typescript
onDateChange(newDate: Date) {
  tree.$.selectedDate.set(newDate);  // Updates tree state ✅
}
```

The tree state DOES update, but:

1. `tree.memoize()` is still using the stub `computed(() => fn(tree()))`
2. The `computed()` sees that `tree()` changed (because ANY signal changed)
3. It re-runs the memoized function
4. **However**, the function shouldn't just blindly run every time - it should cache

**The critical issue:** There's inconsistent behavior:

- If you call the memoized signal from template: `{{ filteredLogs() }}` - it behaves like a computed
- But the memoized FUNCTION is called each time
- Which makes it look like memoization isn't working

### Test Results

Created failing tests that demonstrate:

1. **`demonstrates that tree.memoize ignores state changes`**

   - Call memoized function: callCount = 1 ✅
   - Update state: tree.$.selectedDate.set(new Date('2025-12-02'))
   - Call again: callCount = 2 ❌ (should be 1 with proper memoization)
   - **Result: FAILED** - proves memoization isn't working

2. **`shows that memoizedUpdate DOES work`**

   - `memoizedUpdate()` correctly caches ✅
   - `tree.memoize()` does NOT cache ❌
   - **Result: FAILED** - proves only memoizedUpdate works, not memoize

3. **`proves root cause: tree.memoize still uses stub`**
   - Wraps function in `computed(() => fn(tree()))`
   - No actual caching logic

## The Real Problem

### What the user is experiencing:

The user's log filtering component is structured like:

```typescript
private filteredLogs = this.tree.memoize((state) => {
  // Filter logic here
  return filtered;
}, 'filtered-logs');

// In template:
filteredLogs()
```

**What happens on date change:**

1. User updates date: `tree.$.selectedDate.set(newDate)` ✅
2. Tree state updates ✅
3. `computed()` sees tree changed and re-runs memoized function ✅
4. Filtering DOES execute with new data ✅
5. BUT: No actual caching based on `selectedDate` value

**Why it SEEMS like it's not working:**

- User might see the filter function executing multiple times
- Or the filter function might not be seeing the updated date value
- Or there could be a timing issue with Angular change detection

### Side Note: withEntities() and logs

The log-filtering-demo uses `withEntities()` which might have separate issues:

```typescript
private logsEntity = this.tree.entities<Log>('logs'); // Old API - removed in v5.1.4

// Updates via entity manager
this.logsEntity.add(log);
this.logsEntity.remove(log.id);
```

This is separate from the memoization issue but could interact with it.

## Solution

### Short Term (What the user should do now):

Instead of using `tree.memoize()`, use `tree.memoizedUpdate()` which DOES work:

```typescript
// Use memoizedUpdate instead
private cache = new Map<string, LogEntry[]>();

updateDateAndFilter(newDate: Date) {
  this.tree.memoizedUpdate(
    (state) => ({
      selectedDate: newDate,
      // memoization happens here
    }),
    'filter'
  );
}
```

Or use Angular's `computed()` directly with `withComputed()` pattern:

```typescript
private filteredLogs = computed(() => {
  return this.performFilter(this.tree());
});

private performFilter = memoize((state) => {
  // Filter logic
});
```

### Long Term (What needs fixing in SignalTree):

The `withMemoization()` enhancer needs to override `tree.memoize()`:

```typescript
if (enabled) {
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
```

## Files Created for Documentation

1. **MEMOIZATION_BUG_REPORT.md** - Detailed bug report with root cause analysis
2. **memoization-bug.spec.ts** - Failing tests that demonstrate the bug
3. **memoization-investigation.spec.ts** - Detailed investigation tests showing behavior

## Next Steps

1. **Verify the fix** - Apply the solution to withMemoization()
2. **Update tests** - Make memoization-bug.spec.ts pass
3. **Update user component** - Test that log-filtering-demo works correctly
4. **Document** - Add clear examples to memoization documentation showing the difference between:
   - `tree.memoize()` - for wrapping computations
   - `tree.memoizedUpdate()` - for batching updates with caching

## Key Takeaway

**The issue is NOT that tree state isn't updating** - it IS updating correctly.

**The issue is that `tree.memoize()` doesn't have proper memoization logic** - it just uses a computed() wrapper.

This should be:

- Clearly documented as a known limitation
- Fixed in the library
- Or deprecated in favor of `tree.memoizedUpdate()` or Angular's built-in `computed()`
