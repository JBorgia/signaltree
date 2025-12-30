import { memoization, signalTree } from '@signaltree/core';

describe('Investigation: Understanding tree.memoize() behavior', () => {
  it('detailed trace of what happens when state changes', () => {
    const tree = signalTree({
      selectedDate: new Date('2025-12-01'),
    }).with(memoization());

    let callCount = 0;

    const filtered = tree.memoize((state) => {
      callCount++;
      console.log(
        `[Memoize Callback] Call #${callCount}, selectedDate = ${state.selectedDate.toDateString()}`
      );
      return state.selectedDate;
    }, 'test');

    console.log('\n=== DETAILED TRACE ===');

    // First access
    console.log('\n1. First access to memoized signal:');
    const r1 = filtered();
    console.log(`   Result: ${r1.toDateString()}, callCount: ${callCount}`);

    // Second access (NO state change)
    console.log('\n2. Second access (NO state change):');
    const r2 = filtered();
    console.log(`   Result: ${r2.toDateString()}, callCount: ${callCount}`);

    // Third access (still NO state change)
    console.log('\n3. Third access (still NO state change):');
    const r3 = filtered();
    console.log(`   Result: ${r3.toDateString()}, callCount: ${callCount}`);

    // Change state
    console.log(
      '\n4. Change state: tree.$.selectedDate.set(new Date("2025-12-02"))'
    );
    tree.$.selectedDate.set(new Date('2025-12-02'));

    // Access after state change
    console.log('\n5. First access AFTER state change:');
    const r4 = filtered();
    console.log(`   Result: ${r4.toDateString()}, callCount: ${callCount}`);

    // Access again (NO state change)
    console.log('\n6. Second access (NO state change):');
    const r5 = filtered();
    console.log(`   Result: ${r5.toDateString()}, callCount: ${callCount}`);

    console.log('\n=== ANALYSIS ===');
    console.log(`Total calls: ${callCount}`);
    console.log(
      'Expected with proper memoization: 2 calls (init + 1 state change)'
    );
    console.log(
      'Expected with NO memoization: Could be many more depending on computed() behavior'
    );
  });

  it('tests with multiple computed accesses', () => {
    const tree = signalTree({
      count: 0,
    }).with(memoization());

    let memoCallCount = 0;

    const memoized = tree.memoize((state) => {
      memoCallCount++;
      console.log(
        `[Memoize] Called, count = ${state.count}, call #${memoCallCount}`
      );
      return state.count * 2;
    }, 'double');

    console.log('\n=== COMPUTED ACCESS PATTERN ===');

    // Create a computed that accesses the memoized signal
    const computed1Result = memoized();
    console.log(
      `Access 1: ${computed1Result}, memoCallCount: ${memoCallCount}`
    );

    const computed2Result = memoized();
    console.log(
      `Access 2: ${computed2Result}, memoCallCount: ${memoCallCount}`
    );

    // Change state
    tree.$.count.set(1);

    const computed3Result = memoized();
    console.log(
      `Access 3 (after state change): ${computed3Result}, memoCallCount: ${memoCallCount}`
    );

    console.log(
      '\nNote: computed() will track when tree() is read. When tree state changes,'
    );
    console.log(
      'it will rerun the computed, which calls the memoized function again.'
    );
  });

  it('clarifies: is the issue with using memoize() or with how changes propagate?', () => {
    const tree = signalTree({
      filters: {
        level: 'all' as 'all' | 'info' | 'warn',
        search: '',
      },
    }).with(memoization());

    let filterCalls = 0;

    const memoized = tree.memoize((state) => {
      filterCalls++;
      console.log(
        `[Filter] Called with level='${state.filters.level}', call #${filterCalls}`
      );
      return state.filters.level;
    }, 'filter');

    console.log('\n=== NESTED STATE UPDATE ===');

    console.log('First access:');
    const r1 = memoized();
    console.log(`Result: ${r1}, calls: ${filterCalls}`);

    console.log('\nUpdate nested state: tree.$.filters.level.set("info")');
    // Try to update nested state directly - does this work?
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tree.$.filters.level as any).set('info');

    console.log('Access after update:');
    const r2 = memoized();
    console.log(`Result: ${r2}, calls: ${filterCalls}`);

    console.log('\nKey question: Did filterCalls increase?');
    console.log(`If yes: nested updates trigger re-computation`);
    console.log(`If no: nested updates do NOT propagate to memoized function`);
  });

  it('tests if the issue is specific to component template usage', () => {
    const tree = signalTree({
      selectedDate: new Date('2025-12-01'),
      logs: [
        { id: 1, date: new Date('2025-12-01') },
        { id: 2, date: new Date('2025-12-02') },
      ],
    }).with(memoization());

    let calls = 0;

    const filtered = tree.memoize((state) => {
      calls++;
      console.log(
        `[Filter] Called #${calls}, date = ${state.selectedDate.toDateString()}`
      );
      return state.logs.filter(
        (l) => l.date.toDateString() === state.selectedDate.toDateString()
      );
    });

    console.log('\n=== COMPONENT USAGE SIMULATION ===');

    // Simulate template binding: {{ filteredLogs() }}
    // In a component, this gets called on every change detection cycle

    console.log('Simulating component render cycle 1:');
    const results1 = filtered();
    console.log(`  Results: ${results1.length}, calls: ${calls}`);

    console.log('Simulating component render cycle 2 (no change):');
    const results2 = filtered();
    console.log(`  Results: ${results2.length}, calls: ${calls}`);

    console.log('\nUser updates date:');
    tree.$.selectedDate.set(new Date('2025-12-02'));

    console.log('Simulating component render cycle 3 (after state update):');
    const results3 = filtered();
    console.log(`  Results: ${results3.length}, calls: ${calls}`);

    console.log('Simulating component render cycle 4 (no change):');
    const results4 = filtered();
    console.log(`  Results: ${results4.length}, calls: ${calls}`);

    console.log(
      '\nISSUE: In Angular, each template binding triggers re-evaluation'
    );
    console.log(
      'If memoized signal uses computed(() => fn(tree())), it re-evaluates when'
    );
    console.log(
      'tree signal changes, even if dependencies inside fn havent changed'
    );
  });
});
