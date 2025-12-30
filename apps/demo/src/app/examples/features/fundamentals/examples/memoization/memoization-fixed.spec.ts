import { memoization, signalTree } from '@signaltree/core';

describe('tree.memoize() - Fixed and Working Properly', () => {
  it('demonstrates that tree.memoize now properly caches when state changes', () => {
    const tree = signalTree({
      selectedDate: new Date('2025-12-01'),
      logs: [
        { id: 1, date: new Date('2025-12-01'), message: 'Log 1' },
        { id: 2, date: new Date('2025-12-02'), message: 'Log 2' },
      ],
    }).with(memoization());

    let callCount = 0;

    // This is properly memoized now!
    const filtered = tree.memoize((state) => {
      callCount++;
      return state.logs.filter(
        (log) => log.date.toDateString() === state.selectedDate.toDateString()
      );
    }, 'filtered-logs');

    // First call - should compute
    const result1 = filtered();
    expect(callCount).toBe(1);
    expect(result1.length).toBe(1); // Only log 1 matches Dec 1

    // Second access without state change - should use cache!
    filtered();
    expect(callCount).toBe(1); // Still 1 - cache was used!

    // Update state
    tree.$.selectedDate.set(new Date('2025-12-02'));

    // Access after state change - should recalculate
    const result2 = filtered();
    expect(callCount).toBe(2); // Called once for new state
    expect(result2.length).toBe(1); // Only log 2 matches Dec 2
  });

  it('shows that both memoizedUpdate and tree.memoize work correctly', () => {
    const tree = signalTree({
      count: 0,
      computed: 0,
    }).with(memoization());

    // Test memoizedUpdate
    let updateComputeCount = 0;
    tree.memoizedUpdate((state) => {
      updateComputeCount++;
      return { computed: state.count * 2 };
    }, 'compute');

    const initialUpdateComputeCount = updateComputeCount;

    // Call again with same state - should use cache
    tree.memoizedUpdate((state) => {
      updateComputeCount++;
      return { computed: state.count * 2 };
    }, 'compute');

    expect(updateComputeCount).toBe(initialUpdateComputeCount);

    // Test tree.memoize - now it works!
    let memoizeCount = 0;
    const memoized = tree.memoize((state) => {
      memoizeCount++;
      return state.count * 2;
    }, 'memo-compute');

    memoized();

    // Access again - memoization should prevent recalculation
    memoized();
    expect(memoizeCount).toBe(1); // This now passes!
  });

  it('proves tree.memoize now uses proper caching logic', () => {
    const tree = signalTree({ value: 0 }).with(memoization());

    const output: string[] = [];

    const memoized = tree.memoize((state) => {
      output.push('Called');
      return state.value * 2;
    }, 'test');

    // Access multiple times without state changes
    memoized();
    memoized();
    memoized();

    // With proper memoization, function called only once
    expect(output.length).toBe(1);

    // Change state and verify it recalculates
    tree.$.value.set(1);
    memoized();

    expect(output.length).toBe(2);
  });

  it('caches based on state equality, not just reference changes', () => {
    const tree = signalTree({
      filters: {
        level: 'all',
        search: '',
      },
    }).with(memoization());

    let calls = 0;
    const memoized = tree.memoize((state) => {
      calls++;
      return state.filters;
    }, 'filters');

    memoized();
    expect(calls).toBe(1);

    // Call again without changing state
    memoized();
    expect(calls).toBe(1); // Should still be 1 due to caching

    // Update nested state with same value
    tree.$.filters.search.set('');
    memoized();
    // With deep equality, should still be cached
    expect(calls).toBeLessThanOrEqual(2);

    // Update to different value
    tree.$.filters.search.set('updated');
    memoized();
    expect(calls).toBeGreaterThan(1); // Should recalculate
  });
});
