import { memoization, signalTree } from '@signaltree/core';
import { describe, expect, it } from 'vitest';

import { guardrails } from '../guardrails';

// Import enhancer from source to avoid Vitest package ESM resolution issues
describe('recomputation tracking', () => {
  it('counts recomputations from memoization and triggers budget warning', async () => {
    const tree = signalTree({ a: 1, b: 2 });
    const memo = memoization({ enabled: true });
    const guard = guardrails({
      budgets: { maxRecomputations: 1 },
      reporting: { aggregateWarnings: false },
      changeDetection: { disablePathNotifier: true }, // signalTree doesn't emit PathNotifier events
    });
    const enhanced = guard(memo(tree));

    // a simple memoized computation
    const compute = (t: { a: number; b: number }) => t.a + t.b;
    const sig: any = (enhanced as any).memoize(compute);

    // read once to create cache, then mutate to cause recomputation
    sig();
    enhanced.$.a.set(5);
    sig();

    // wait for PathNotifier events to flush
    await new Promise((resolve) => setTimeout(resolve, 0));

    const api = (enhanced as any).__guardrails;
    const report = api.getReport();

    expect(report.stats.recomputationCount).toBeGreaterThan(0);
    expect(report.issues.some((i: any) => i.type === 'budget')).toBe(true);
  });

  describe('recomputation budget edge cases', () => {
    it('warns when budget is exceeded by single recomputation', async () => {
      const tree = signalTree({ value: 1 });
      const memo = memoization({ enabled: true });
      const guard = guardrails({
        budgets: { maxRecomputations: 1 }, // Allow only 1 recomputation
        reporting: { aggregateWarnings: false },
        changeDetection: { disablePathNotifier: true },
      });
      const enhanced = guard(memo(tree));

      const compute = (t: { value: number }) => t.value * 2;
      const sig: any = (enhanced as any).memoize(compute);

      sig();
      enhanced.$.value.set(2);
      sig();
      enhanced.$.value.set(3);
      sig(); // This second recomputation exceeds budget of 1

      await new Promise((resolve) => setTimeout(resolve, 0));

      const api = (enhanced as any).__guardrails;
      const report = api.getReport();
      // With 2 recomputations and budget of 1, should have budget issue
      expect(report.stats.recomputationCount).toBeGreaterThanOrEqual(2);
      expect(report.issues.some((i: any) => i.type === 'budget')).toBe(true);
    });

    it('tracks recomputations per path', async () => {
      const tree = signalTree({
        x: 1,
        y: 2,
        z: 3,
      });
      const memo = memoization({
        enabled: true,
      });
      const guard = guardrails({
        budgets: { maxRecomputations: 100 },
        reporting: { aggregateWarnings: false },
        changeDetection: { disablePathNotifier: true },
      });
      const enhanced = guard(memo(tree));

      // Create multiple memoized computations
      interface MemoizedComputation<T, R> {
        (t: T): R;
      }

      interface EnhancedTree {
        memoize: <T, R>(fn: MemoizedComputation<T, R>) => () => R;
      }

      const sig1: ReturnType<EnhancedTree['memoize']> = (
        enhanced as EnhancedTree
      ).memoize((t: { x: number; y: number; z: number }) => t.x);
      interface Sig2Computation {
        (t: { x: number; y: number; z: number }): number;
      }
      const sig2: ReturnType<EnhancedTree['memoize']> = (
        enhanced as EnhancedTree
      ).memoize(((t) => t.y) as Sig2Computation);
      interface Sig3Computation {
        (t: { x: number; y: number; z: number }): number;
      }
      const sig3: ReturnType<EnhancedTree['memoize']> = (
        enhanced as EnhancedTree
      ).memoize(((t) => t.z) as Sig3Computation);

      // Read them all
      sig1();
      sig2();
      sig3();

      // Mutate and re-read multiple times
      enhanced.$.x.set(10);
      sig1();
      enhanced.$.y.set(20);
      sig2();
      enhanced.$.z.set(30);
      sig3();

      await new Promise((resolve) => setTimeout(resolve, 0));

      const api = (enhanced as any).__guardrails;
      const report = api.getReport();
      expect(report.stats.recomputationCount).toBeGreaterThan(2);
    });

    it('resets recomputation count after disposal', async () => {
      const tree = signalTree({ count: 0 });
      const memo = memoization({ enabled: true });
      const guard = guardrails({
        budgets: { maxRecomputations: 10 },
        reporting: { aggregateWarnings: false },
        changeDetection: { disablePathNotifier: true },
      });
      const enhanced = guard(memo(tree));

      const compute = (t: { count: number }) => t.count + 1;
      const sig: any = (enhanced as any).memoize(compute);

      // Generate some recomputations
      sig();
      enhanced.$.count.set(1);
      sig();

      const api = (enhanced as any).__guardrails;
      let report = api.getReport();
      const firstCount = report.stats.recomputationCount;
      expect(firstCount).toBeGreaterThan(0);

      // Dispose
      api.dispose();

      // Re-initialize
      const enhanced2 = guard(memo(tree));
      const sig2: any = (enhanced2 as any).memoize(compute);
      sig2();

      const api2 = (enhanced2 as any).__guardrails;
      report = api2.getReport();
      // Count should be lower in new instance
      expect(report.stats.recomputationCount).toBeLessThanOrEqual(firstCount);

      api2.dispose();
    });

    it('handles rapid successive recomputations', async () => {
      const tree = signalTree({ value: 0 });
      const memo = memoization({ enabled: true });
      const guard = guardrails({
        budgets: { maxRecomputations: 50 },
        reporting: { aggregateWarnings: false },
        changeDetection: { disablePathNotifier: true },
      });
      const enhanced = guard(memo(tree));

      const compute = (t: { value: number }) => t.value;
      const sig: any = (enhanced as any).memoize(compute);

      sig(); // Initial call

      // Rapid mutations and reads
      for (let i = 0; i < 10; i++) {
        enhanced.$.value.set(i);
        sig();
      }

      await new Promise((resolve) => setTimeout(resolve, 0));

      const api = (enhanced as any).__guardrails;
      const report = api.getReport();
      expect(report.stats.recomputationCount).toBeGreaterThan(0);
      // Should not exceed budget
      expect(report.issues.filter((i: any) => i.type === 'budget')).toEqual([]);
    });
  });
});
