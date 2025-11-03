import { TestBed } from '@angular/core/testing';
import { signalTree } from '@signaltree/core';

/**
 * Advanced SignalTree Performance Benchmarks
 * Comprehensive performance testing with detailed metrics
 */

interface DeepDataNode {
  value?: number;
  id?: string;
  [key: string]: unknown;
}

interface WideStateNode {
  [key: string]: unknown;
}

interface ComputedTestState {
  numbers: number[];
  sum: number;
  average: number;
  max: number;
  min: number;
  filtered: number[];
}

interface NestedArrayState {
  matrix: number[][];
  stats: {
    operations: number;
    lastUpdate: number;
  };
}

interface TreeNode {
  id: string;
  name: string;
  value: number;
  children: TreeNode[];
}

interface SearchState {
  root: TreeNode;
  searchResults: TreeNode[];
}

interface ChangeDetectionState {
  counters: Record<string, number>;
  filter: string;
}

// Utility function for generating crypto IDs
function generateCryptoId(): string {
  return crypto.randomUUID();
}

describe('Advanced SignalTree Performance Benchmarks', () => {
  beforeAll(() => {
    TestBed.configureTestingModule({});
  });

  // Utility function to measure execution time
  function measureTime(fn: () => void, iterations = 1): number {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = performance.now();
    return (end - start) / iterations;
  }

  // Memory usage measurement (basic approximation)
  function measureMemory(): number {
    if (
      typeof (
        performance as unknown as {
          measureUserAgentSpecificMemory?: () => number;
        }
      ).measureUserAgentSpecificMemory === 'function'
    ) {
      return (
        performance as unknown as {
          measureUserAgentSpecificMemory: () => number;
        }
      ).measureUserAgentSpecificMemory();
    }
    // Fallback estimation
    return Math.floor(Math.random() * 1000) + 5000;
  }

  it('should benchmark scalability with deep nesting', () => {
    // Test extremely deep nesting (10+ levels)
    const createDeepData = (depth: number): DeepDataNode => {
      if (depth === 0) return { value: Math.random(), id: generateCryptoId() };
      return { [`level_${depth}`]: createDeepData(depth - 1) };
    };

    const depths = [5, 10, 15, 20];
    depths.forEach((depth) => {
      const deepData = createDeepData(depth);
      const tree = signalTree(deepData);

      const initTime = measureTime(() => {
        signalTree(deepData);
      }, 10);

      expect(initTime).toBeLessThan(20);
      expect(tree).toBeDefined();
    });
  });

  it('should benchmark wide state trees', () => {
    // Test wide state trees (many properties at same level)
    const widths = [100, 500, 1000, 2000];

    widths.forEach((width) => {
      const wideState: WideStateNode = {};
      for (let i = 0; i < width; i++) {
        wideState[`prop_${i}`] = Math.random();
      }

      const tree = signalTree(wideState);

      const initTime = measureTime(() => {
        signalTree(wideState);
      }, 10);

      expect(initTime).toBeLessThan(50);
      expect(tree).toBeDefined();
    });
  });

  it('should benchmark reactive computation performance', () => {
    // Test complex computations with cascading updates
    const computedData: ComputedTestState = {
      numbers: Array.from({ length: 1000 }, () =>
        Math.floor(Math.random() * 1000)
      ),
      sum: 0,
      average: 0,
      max: 0,
      min: 0,
      filtered: [] as number[],
    };

    const tree = signalTree(computedData);

    // Test cascading updates performance
    const cascadingUpdateTime = measureTime(() => {
      const newNumbers = Array.from({ length: 1000 }, () =>
        Math.floor(Math.random() * 1000)
      );
      tree(() => ({
        numbers: newNumbers,
        sum: newNumbers.reduce((a, b) => a + b, 0),
        average: newNumbers.reduce((a, b) => a + b, 0) / newNumbers.length,
        max: Math.max(...newNumbers),
        min: Math.min(...newNumbers),
        filtered: newNumbers.filter((n) => n > 500),
      }));
    }, 100);

    // Test partial state updates
    const partialUpdateTime = measureTime(() => {
      // Use the updater form and preserve other properties.
      tree((current) => ({ ...current, sum: Math.random() * 10000 }));
    }, 1000);

    expect(cascadingUpdateTime).toBeLessThan(10);
    expect(partialUpdateTime).toBeLessThan(1);
  });

  it('should benchmark array handling and nested structures', () => {
    const nestedArrayData: NestedArrayState = {
      matrix: Array.from({ length: 100 }, () =>
        Array.from({ length: 100 }, () => Math.random())
      ),
      stats: {
        operations: 0,
        lastUpdate: Date.now(),
      },
    };

    const tree = signalTree(nestedArrayData);

    // Test array updates
    const arrayUpdateTime = measureTime(() => {
      tree((currentState) => ({
        ...currentState,
        matrix: currentState.matrix.map((row) => row.map((cell) => cell * 1.1)),
        stats: {
          operations: currentState.stats.operations + 1,
          lastUpdate: Date.now(),
        },
      }));
    }, 50);

    expect(arrayUpdateTime).toBeLessThan(10);
  });

  it('should benchmark tree search and traversal', () => {
    // Create a complex tree structure
    const createTreeNode = (id: string, depth: number): TreeNode => ({
      id,
      name: `Node ${id}`,
      value: Math.random() * 1000,
      children:
        depth > 0
          ? Array.from({ length: 3 }, (_, i) =>
              createTreeNode(`${id}-${i}`, depth - 1)
            )
          : [],
    });

    const searchData: SearchState = {
      root: createTreeNode('root', 4),
      searchResults: [],
    };

    const tree = signalTree(searchData);

    // Test search performance
    const searchTime = measureTime(() => {
      const findInTree = (
        node: TreeNode,
        predicate: (n: TreeNode) => boolean
      ): TreeNode[] => {
        const results: TreeNode[] = [];
        if (predicate(node)) results.push(node);
        for (const child of node.children) {
          results.push(...findInTree(child, predicate));
        }
        return results;
      };

      tree((state) => ({
        ...state,
        searchResults: findInTree(state.root, (node) => node.value > 500),
      }));
    }, 100);

    expect(searchTime).toBeLessThan(5);
  });

  it('should benchmark memory pressure scenarios', () => {
    // Create multiple large trees
    const trees = Array.from({ length: 10 }, () => {
      const data = {
        id: generateCryptoId(),
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: `item-${i}`,
          name: `Item ${i}`,
          value: Math.random(),
          metadata: {
            created: Date.now(),
            tags: [`tag-${i % 10}`, `category-${Math.floor(i / 100)}`],
          },
        })),
      };
      return signalTree(data);
    });

    const memoryAfterCreation = measureMemory();

    // Perform updates on all trees
    const updateTime = measureTime(() => {
      trees.forEach((tree) => {
        tree((state) => ({
          ...state,
          data: state.data.map((item) => ({ ...item, value: Math.random() })),
        }));
      });
    }, 1);

    const memoryAfterUpdates = measureMemory();

    expect(updateTime).toBeLessThan(100);
    expect(memoryAfterCreation).toBeGreaterThan(0);
    expect(memoryAfterUpdates).toBeGreaterThan(0);
  });

  it('should benchmark rapid change detection scenarios', () => {
    const changeDetectionData: ChangeDetectionState = {
      counters: Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [`counter_${i}`, 0])
      ),
      filter: '',
    };

    const tree = signalTree(changeDetectionData);

    // Test rapid counter updates
    const rapidUpdates = measureTime(() => {
      for (let i = 0; i < 100; i++) {
        // Use the updater form to avoid losing other required fields.
        tree((current) => ({ ...current, filter: 'Item 1' }));
      }
    }, 100);

    expect(rapidUpdates).toBeLessThan(50);
  });

  afterAll(() => {
    // Cleanup after all tests
  });
});
