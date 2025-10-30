import { OptimizedUpdateEngine } from './update-engine';

describe("OptimizedUpdateEngine", () => {
  it("should detect simple changes", () => {
    const tree = { name: "Alice", age: 30 };
    const engine = new OptimizedUpdateEngine(tree);

    const result = engine.update(tree, { age: 31 });

    expect(result.changed).toBe(true);
    expect(result.changedPaths.some((p) => p.includes("age"))).toBe(true);
  });

  it("should return false when no changes", () => {
    const tree = { name: "Alice" };
    const engine = new OptimizedUpdateEngine(tree);

    const result = engine.update(tree, { name: "Alice" });

    expect(result.changed).toBe(false);
  });

  it("should handle nested objects", () => {
    const tree = {
      user: {
        profile: { name: "Alice", age: 30 },
      },
    };

    const engine = new OptimizedUpdateEngine(tree);
    const result = engine.update(tree, {
      user: { profile: { age: 31 } },
    });

    expect(result.changed).toBe(true);
  });

  it("should respect maxDepth option", () => {
    const tree = {
      level1: {
        level2: {
          level3: { deep: "value" },
        },
      },
    };

    const engine = new OptimizedUpdateEngine(tree);
    const result = engine.update(
      tree,
      {
        level1: {
          level2: {
            level3: { deep: "changed" },
          },
        },
      },
      { maxDepth: 2 }
    );

    expect(result.changed).toBe(false);
  });

  it("should return index statistics", () => {
    const tree = { a: 1, b: 2 };
    const engine = new OptimizedUpdateEngine(tree);

    const stats = engine.getIndexStats();

    expect(stats).toHaveProperty("hits");
    expect(stats).toHaveProperty("misses");
    expect(stats).toHaveProperty("hitRate");
  });

  it("should handle large objects efficiently", () => {
    const largeObj: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      largeObj["field" + i] = i;
    }

    const updates: Record<string, unknown> = {};
    for (let i = 0; i < 1000; i++) {
      updates["field" + i] = i + 1000;
    }

    const engine = new OptimizedUpdateEngine(largeObj);
    const start = performance.now();
    const result = engine.update(largeObj, updates);
    const duration = performance.now() - start;

    expect(result.changed).toBe(true);
    expect(duration).toBeLessThan(200);
  });
});
