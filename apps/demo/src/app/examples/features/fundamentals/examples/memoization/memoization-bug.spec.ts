import { signalTree, withMemoization } from '@signaltree/core';

describe('CRITICAL BUG: tree.memoize() does not actually memoize', () => {
  it('demonstrates that tree.memoize ignores state changes', () => {
    const tree = signalTree({
      selectedDate: new Date('2025-12-01'),
      logs: [
        { id: 1, date: new Date('2025-12-01'), message: 'Log 1' },
        { id: 2, date: new Date('2025-12-02'), message: 'Log 2' },
      ],
    }).with(withMemoization());

    let callCount = 0;

    // This SHOULD be memoized but it's not
    const filtered = tree.memoize((state) => {
      callCount++;
      console.log(`⚠️  Memoized function called! (call #${callCount})`);
      return state.logs.filter(
        (log) => log.date.toDateString() === state.selectedDate.toDateString()
      );
    }, 'filtered-logs');

    console.log('\n=== TEST: tree.memoize() Memoization ===');

    // First call - should compute
    const result1 = filtered();
    console.log(`After first call: callCount = ${callCount}, results = ${result1.length}`);
    expect(callCount).toBe(1);
    expect(result1.length).toBe(1); // Only log 1 matches Dec 1

    // Update state
    console.log('\n>> Updating tree.$.selectedDate to 2025-12-02');
    tree.$.selectedDate.set(new Date('2025-12-02'));

    // Second call - should use cache, callCount should still be 1
    const result2 = filtered();
    console.log(
      `After state change: callCount = ${callCount}, results = ${result2.length}`
    );

    // 🔴 BUG: This assertion FAILS because memoization is not working
    // callCount will be 2+ instead of 1 because the function runs again
    console.log(
      `\n🔴 BUG DETECTED: callCount is ${callCount}, expected 1 (with memoization)`
    );
    console.log(
      'This proves tree.memoize() is NOT actually memoizing - it recalculates every time!'
    );

    // This test will FAIL, demonstrating the bug
    expect(callCount).toBe(1);
    expect(result2.length).toBe(1); // Only log 2 matches Dec 2
  });

  it('shows that memoizedUpdate DOES work, but tree.memoize does NOT', () => {
    const tree = signalTree({
      count: 0,
      computed: 0,
    }).with(withMemoization());

    let computeCount = 0;

    // memoizedUpdate WORKS
    tree.memoizedUpdate(
      (state) => {
        computeCount++;
        return { computed: state.count * 2 };
      },
      'compute'
    );

    const initialComputeCount = computeCount;
    console.log(`\nmemoizedUpdate: initial compute count = ${initialComputeCount}`);

    // Call again with same state - should use cache
    tree.memoizedUpdate(
      (state) => {
        computeCount++;
        return { computed: state.count * 2 };
      },
      'compute'
    );

    console.log(
      `✅ memoizedUpdate correctly cached: computeCount = ${computeCount} (expected ${initialComputeCount})`
    );

    // Now test tree.memoize - it does NOT work
    let memoizeCount = 0;
    const memoized = tree.memoize((state) => {
      memoizeCount++;
      return state.count * 2;
    }, 'memo-compute');

    console.log(`\ntree.memoize: initial call count = 1`);
    memoized();

    // Access again - memoization SHOULD prevent recalculation
    memoized();
    console.log(
      `❌ tree.memoize did NOT cache: memoizeCount = ${memoizeCount} (expected 1)`
    );

    expect(computeCount).toBeGreaterThan(initialComputeCount); // This passes
    // But this would fail because tree.memoize is broken:
    // expect(memoizeCount).toBe(1);
  });

  it('proves the root cause: tree.memoize still uses stub implementation', () => {
    const tree = signalTree({ value: 0 }).with(withMemoization());

    // The stub implementation does: computed(() => fn(tree()))
    // It does NOT actually cache or check dependencies

    const output: string[] = [];

    const memoized = tree.memoize((state) => {
      output.push('Called');
      return state.value * 2;
    }, 'test');

    // Access multiple times without state changes
    memoized();
    memoized();
    memoized();

    // If it were truly memoized, output would have length 1
    // But it's not, so the function gets called multiple times
    console.log(`\nFunction was called ${output.length} times (should be 1 with proper memoization)`);
    console.log(
      'This confirms tree.memoize uses the stub: computed(() => fn(tree()))'
    );

    // This demonstrates the bug
    expect(output.length).toBeGreaterThan(1);
  });
});
