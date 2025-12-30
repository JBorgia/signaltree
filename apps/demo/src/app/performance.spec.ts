import { TestBed } from '@angular/core/testing';
import { batching, memoization, signalTree } from '@signaltree/core';

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Quick SignalTree Performance Test
 * This runs actual SignalTree operations to get real performance data
 */
describe('SignalTree Performance Benchmarks', () => {
  let performanceResults: any;

  beforeAll(() => {
    TestBed.configureTestingModule({});
    performanceResults = {};
  });

  function measureTime(fn: () => void, iterations = 1000): number {
    const times: number[] = [];

    // Warm-up
    for (let i = 0; i < 50; i++) {
      fn();
    }

    // Actual measurements
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      fn();
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const trimmed = times.slice(
      Math.floor(iterations * 0.1),
      Math.floor(iterations * 0.9)
    );

    return trimmed[Math.floor(trimmed.length / 2)];
  }

  interface NestedState {
    [key: string]:
      | NestedState
      | {
          value: number;
          timestamp: number;
          id: string;
          counter?: number;
        };
  }

  function generateNestedState(depth: number, breadth: number): any {
    if (depth === 0) {
      return {
        value: Math.random(),
        timestamp: Date.now(),
        id: crypto.randomUUID(),
      };
    }

    const obj: any = {};
    for (let i = 0; i < breadth; i++) {
      obj[`level_${depth}_item_${i}`] = generateNestedState(depth - 1, breadth);
    }
    return obj;
  }

  function generateEntities(count: number): any[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `entity_${i}`,
      name: `Entity ${i}`,
      value: Math.random() * 1000,
      active: Math.random() > 0.5,
      category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
    }));
  }

  it('should benchmark tree initialization performance', () => {
    const smallState = generateNestedState(2, 3); // ~27 nodes
    const mediumState = generateNestedState(3, 4); // ~85 nodes
    const largeState = generateNestedState(4, 4); // ~341 nodes

    const smallTime = measureTime(() => {
      const tree = signalTree(smallState);
      tree();
    });

    const mediumTime = measureTime(() => {
      const tree = signalTree(mediumState);
      tree();
    });

    const largeTime = measureTime(() => {
      const tree = signalTree(largeState);
      tree();
    });

    performanceResults.initialization = {
      small: { nodes: 27, time: smallTime },
      medium: { nodes: 85, time: mediumTime },
      large: { nodes: 341, time: largeTime },
    };

    // Performance should be reasonable
    expect(smallTime).toBeLessThan(10);
    expect(mediumTime).toBeLessThan(20);
    expect(largeTime).toBeLessThan(50);
  });

  it('should benchmark update performance', () => {
    const state = generateNestedState(3, 4);
    const tree = signalTree(state);

    const shallowTime = measureTime(() => {
      tree((state: NestedState) => ({ ...state, counter: Math.random() }));
    });

    const deepTime = measureTime(() => {
      tree((state: any) => {
        const newState = { ...state };
        if (newState.level_3_item_0) {
          newState.level_3_item_0 = {
            ...newState.level_3_item_0,
            level_2_item_0: {
              ...newState.level_3_item_0.level_2_item_0,
              value: Math.random(),
            },
          };
        }
        return newState;
      });
    });

    performanceResults.updates = {
      shallow: shallowTime,
      deep: deepTime,
    };

    expect(shallowTime).toBeLessThan(5);
    expect(deepTime).toBeLessThan(10);
  });

  it('should benchmark batching performance', () => {
    const state = generateNestedState(3, 4);
    const regularTree = signalTree(state);
    const batchTree = signalTree(state).with(batching());

    const singleUpdateTime = measureTime(() => {
      regularTree((state: any) => ({ ...state, value: Math.random() }));
    });

    const batchedUpdateTime = measureTime(() => {
      batchTree.batchUpdate((state) => {
        const updates: any = {};
        for (let i = 0; i < 10; i++) {
          updates[`field_${i}`] = Math.random();
        }
        return { ...state, ...updates };
      });
    }, 100); // Fewer iterations for batched operations

    const efficiency = (singleUpdateTime * 10) / batchedUpdateTime;

    performanceResults.batching = {
      single: singleUpdateTime,
      batched: batchedUpdateTime,
      efficiency,
    };

    expect(efficiency).toBeGreaterThan(1); // Batching should be more efficient
  });

  it('should benchmark memoization performance', () => {
    const entities = generateEntities(1000);
    const state = { entities, filter: { category: 'A', active: true } };
    const tree = signalTree(state).with(memoization());

    const heavyComputation = (state: any) => {
      return state.entities
        .filter(
          (e: any) =>
            e.category === state.filter.category &&
            e.active === state.filter.active
        )
        .map((e: any) => ({ ...e, computed: e.value * 2 }))
        .sort((a: any, b: any) => a.computed - b.computed);
    };

    // Without memoization
    const withoutMemoTime = measureTime(() => {
      heavyComputation(tree());
    }, 100);

    // With memoization - first time
    const memoizedFn = tree.memoize(heavyComputation, 'heavy-computation');
    const firstMemoTime = measureTime(() => {
      memoizedFn();
    }, 100);

    // With memoization - cached
    const cachedMemoTime = measureTime(() => {
      memoizedFn(); // Should hit cache
    }, 100);

    const speedup = withoutMemoTime / cachedMemoTime;

    performanceResults.memoization = {
      withoutMemo: withoutMemoTime,
      firstMemo: firstMemoTime,
      cached: cachedMemoTime,
      speedup,
    };

    expect(speedup).toBeGreaterThan(2); // Cache should provide significant speedup
  });

  it('should benchmark lazy loading vs eager loading', () => {
    const largeState = generateNestedState(5, 3); // ~364 nodes

    const eagerTime = measureTime(() => {
      const tree = signalTree(largeState, { useLazySignals: false });
      tree();
    });

    const lazyTime = measureTime(() => {
      const tree = signalTree(largeState, { useLazySignals: true });
      tree();
    });

    const lazyTree = signalTree(largeState, { useLazySignals: true });
    const accessTime = measureTime(() => {
      // Access a deeply nested property to trigger signal creation
      const val = (lazyTree.$ as Record<string, any>)['level_5_item_0']?.[
        'level_4_item_0'
      ]?.['level_3_item_0']?.['level_2_item_0']?.['level_1_item_0']?.[
        'value'
      ]?.();
      void val; // Use the value to ensure it's accessed
    }, 100);

    const savings = ((eagerTime - lazyTime) / eagerTime) * 100;

    performanceResults.lazyLoading = {
      eager: eagerTime,
      lazy: lazyTime,
      access: accessTime,
      savings,
    };

    // Lazy loading might not always be faster for small trees, so just check it's reasonable
    expect(lazyTime).toBeLessThan(eagerTime * 2); // Lazy should not be more than 2x slower
  });
});
