import { signal } from '@angular/core';

import { PathIndex } from './path-index';

import type { WritableSignal } from "@angular/core";

describe("PathIndex", () => {
  let index: PathIndex;

  beforeEach(() => {
    index = new PathIndex();
  });

  describe("set and get", () => {
    it("should store and retrieve values by path", () => {
      const testSignal = signal(42);
      index.set(["user", "age"], testSignal);

      const retrieved = index.get(["user", "age"]);
      expect(retrieved).toBe(testSignal);
      expect(retrieved?.()).toBe(42);
    });

    it("should handle nested paths", () => {
      const nameSignal = signal("Alice");
      const ageSignal = signal(30);
      const citySignal = signal("NYC");

      index.set(["user", "profile", "name"], nameSignal);
      index.set(["user", "profile", "age"], ageSignal);
      index.set(["user", "address", "city"], citySignal);

      expect(index.get(["user", "profile", "name"])).toBe(nameSignal);
      expect(index.get(["user", "profile", "age"])).toBe(ageSignal);
      expect(index.get(["user", "address", "city"])).toBe(citySignal);
    });

    it("should handle array indices", () => {
      const sig = signal("item");
      index.set(["items", 0, "name"], sig);

      const retrieved = index.get(["items", 0, "name"]);
      expect(retrieved).toBe(sig);
    });

    it("should return null for non-existent paths", () => {
      expect(index.get(["nonexistent", "path"])).toBeNull();
    });

    it("should handle empty paths", () => {
      const sig = signal("root");
      index.set([], sig);

      expect(index.get([])).toBe(sig);
    });
  });

  describe("has", () => {
    it("should return true for existing paths", () => {
      const sig = signal(1);
      index.set(["test"], sig);

      expect(index.has(["test"])).toBe(true);
    });

    it("should return false for non-existent paths", () => {
      expect(index.has(["nonexistent"])).toBe(false);
    });
  });

  describe("getByPrefix", () => {
    beforeEach(() => {
      index.set(["user", "name"], signal("Alice"));
      index.set(["user", "age"], signal(30));
      index.set(["user", "profile", "bio"], signal("Dev"));
      index.set(["config", "theme"], signal("dark"));
    });

    it("should get all values matching a prefix", () => {
      const userValues = index.getByPrefix(["user"]);

      expect(userValues.size).toBe(3);
      expect(userValues.get("name")?.()).toBe("Alice");
      expect(userValues.get("age")?.()).toBe(30);
      expect(userValues.get("profile.bio")?.()).toBe("Dev");
    });

    it("should return empty map for non-existent prefix", () => {
      const values = index.getByPrefix(["nonexistent"]);
      expect(values.size).toBe(0);
    });

    it("should handle nested prefixes", () => {
      const profileValues = index.getByPrefix(["user", "profile"]);

      expect(profileValues.size).toBe(1);
      expect(profileValues.get("bio")?.()).toBe("Dev");
    });
  });

  describe("delete", () => {
    it("should delete a value and return true", () => {
      const sig = signal(1);
      index.set(["test"], sig);

      expect(index.delete(["test"])).toBe(true);
      expect(index.has(["test"])).toBe(false);
    });

    it("should return false for non-existent paths", () => {
      expect(index.delete(["nonexistent"])).toBe(false);
    });

    it("should clean up empty nodes", () => {
      index.set(["user", "name"], signal("Alice"));
      index.set(["user", "age"], signal(30));

      index.delete(["user", "name"]);

      // Age should still be accessible
      expect(index.has(["user", "age"])).toBe(true);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      index.set(["a"], signal(1));
      index.set(["b"], signal(2));
      index.set(["c"], signal(3));

      index.clear();

      expect(index.has(["a"])).toBe(false);
      expect(index.has(["b"])).toBe(false);
      expect(index.has(["c"])).toBe(false);
    });
  });

  describe("getStats", () => {
    it("should track hits and misses", () => {
      const sig = signal(1);
      index.set(["test"], sig);

      // Trigger a hit
      index.get(["test"]);

      // Trigger a miss
      index.get(["nonexistent"]);

      const stats = index.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it("should track sets", () => {
      index.set(["a"], signal(1));
      index.set(["b"], signal(2));

      const stats = index.getStats();
      expect(stats.sets).toBe(2);
    });
  });

  describe("buildFromTree", () => {
    it("should index signals from a tree structure", () => {
      const tree = {
        user: {
          name: signal("Alice"),
          age: signal(30),
          profile: {
            bio: signal("Developer"),
          },
        },
        config: signal("dark"),
      };

      index.buildFromTree(tree);

      expect(index.has(["user", "name"])).toBe(true);
      expect(index.has(["user", "age"])).toBe(true);
      expect(index.has(["user", "profile", "bio"])).toBe(true);
      expect(index.has(["config"])).toBe(true);

      expect(index.get(["user", "name"])?.()).toBe("Alice");
      expect(index.get(["config"])?.()).toBe("dark");
    });

    it("should handle nested objects without signals", () => {
      const tree = {
        data: {
          nested: {
            value: signal(42),
          },
        },
      };

      index.buildFromTree(tree);

      expect(index.has(["data", "nested", "value"])).toBe(true);
    });

    it("should skip non-signal leaves", () => {
      const tree = {
        signal: signal(1),
        notSignal: "plain value",
      };

      index.buildFromTree(tree);

      expect(index.has(["signal"])).toBe(true);
      expect(index.has(["notSignal"])).toBe(false);
    });
  });

  describe("WeakRef behavior", () => {
    it("should allow garbage collection of signals", () => {
      const sig: WritableSignal<number> = signal(42);
      index.set(["test"], sig);

      // Signal should be retrievable
      expect(index.get(["test"])).toBe(sig);

      // Note: We can't actually trigger GC in tests, but the WeakRef
      // allows it to happen in production
    });

    it("should clean up stale references on access", () => {
      const sig: WritableSignal<number> = signal(42);
      index.set(["test"], sig);

      const stats1 = index.getStats();
      const initialSets = stats1.sets;

      // Access should maintain cache
      index.get(["test"]);

      const stats2 = index.getStats();
      expect(stats2.sets).toBe(initialSets);
    });
  });

  describe("performance", () => {
    it("should handle large numbers of paths efficiently", () => {
      const start = performance.now();

      // Index 1000 signals
      for (let i = 0; i < 1000; i++) {
        index.set(["items", i], signal(i));
      }

      const indexTime = performance.now() - start;

      // Retrieval should be fast
      const retrieveStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        index.get(["items", i]);
      }
      const retrieveTime = performance.now() - retrieveStart;

      // Both operations should be reasonably fast
      expect(indexTime).toBeLessThan(100); // Indexing 1000 items < 100ms
      expect(retrieveTime).toBeLessThan(50); // Retrieving 1000 items < 50ms
    });

    it("should have O(k) lookup time regardless of total size", () => {
      // Add 100 signals
      for (let i = 0; i < 100; i++) {
        index.set(["items", i], signal(i));
      }

      // Warm-up runs to stabilize JIT compilation
      for (let i = 0; i < 10; i++) {
        index.get(["items", 50]);
      }

      // Measure with 100 items (multiple runs to reduce variance)
      let duration100 = 0;
      const runs = 100;
      for (let run = 0; run < runs; run++) {
        const time = performance.now();
        index.get(["items", 50]);
        duration100 += performance.now() - time;
      }
      duration100 /= runs;

      // Add 900 more signals (10x more data)
      for (let i = 100; i < 1000; i++) {
        index.set(["items", i], signal(i));
      }

      // Warm-up after adding more data
      for (let i = 0; i < 10; i++) {
        index.get(["items", 50]);
      }

      // Measure with 1000 items (multiple runs to reduce variance)
      let duration1000 = 0;
      for (let run = 0; run < runs; run++) {
        const time = performance.now();
        index.get(["items", 50]);
        duration1000 += performance.now() - time;
      }
      duration1000 /= runs;

      // Lookup time should not increase significantly with 10x more data
      // O(k) means constant time regardless of total size
      // Allow 10x tolerance for CI environment variance
      expect(duration1000).toBeLessThan(duration100 * 10);
    });
  });
});
