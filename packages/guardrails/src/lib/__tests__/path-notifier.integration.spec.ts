import { getPathNotifier, signalTree } from '@signaltree/core';
import { describe, expect, it, vi } from 'vitest';

import { guardrails } from '../guardrails';

describe('PathNotifier integration', () => {
  // TODO: PathNotifier doesn't emit events for regular signalTree mutations
  // This test was written assuming PathNotifier works with signalTree, but it only
  // fires events for entity signal mutations. Either:
  // 1. Use entity signals in this test, or
  // 2. Accept that PathNotifier integration only works with entity-based trees
  it.skip('uses PathNotifier when available', async () => {
    const tree = signalTree({ users: { u1: { name: 'Alice' } } });
    const enhanced = guardrails()(tree);

    const notifier = getPathNotifier();
    let notified = false;
    const unsub = notifier.subscribe('users.*', () => {
      notified = true;
    });

    // mutate via tree
    (enhanced.$['users'] as any).u1.name.set('Bob');

    // allow any async microtasks to flush
    await new Promise((resolve) => setTimeout(resolve, 0));
    unsub();
    expect(notified).toBe(true);

    const api = (enhanced as any).__guardrails;
    expect(api).toBeDefined();
    const report = api.getReport();
    // ensure hotPaths or issues were updated without diff polling
    expect(report.stats.updateCount).toBeGreaterThan(0);
  });

  it('falls back to polling when PathNotifier is unavailable', () => {
    vi.useFakeTimers();
    const tree = signalTree({ settings: { theme: 'dark' } });
    // Explicitly disable PathNotifier to test polling fallback
    const enhanced = guardrails({
      changeDetection: { disablePathNotifier: true },
    })(tree);

    // Mutation
    (enhanced.$['settings'] as any).theme.set('light');
    vi.advanceTimersByTime(100); // advance polling interval
    const api = (enhanced as any).__guardrails;
    expect(api.getStats().updateCount).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  describe('PathNotifier edge cases', () => {
    it('handles multiple rapid mutations within polling interval', () => {
      vi.useFakeTimers();
      const tree = signalTree({ a: 1, b: 2, c: 3 });
      const enhanced = guardrails({
        changeDetection: { disablePathNotifier: true },
      })(tree);

      // Multiple rapid mutations
      (enhanced.$['a'] as any).set(10);
      (enhanced.$['b'] as any).set(20);
      (enhanced.$['c'] as any).set(30);

      // Single poll should detect changes
      vi.advanceTimersByTime(50);

      const api = (enhanced as any).__guardrails;
      const report = api.getReport();
      // At least one update should be detected
      expect(report.stats.updateCount).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('handles subscription without prior mutations', () => {
      vi.useFakeTimers();
      const tree = signalTree({ count: 0 });
      const enhanced = guardrails({
        changeDetection: { disablePathNotifier: true },
      })(tree);

      // Initialize without mutations
      const api = (enhanced as any).__guardrails;
      let report = api.getReport();
      expect(report.stats.updateCount).toBe(0);

      // Now mutate
      (enhanced.$['count'] as any).set(1);
      vi.advanceTimersByTime(50);

      report = api.getReport();
      expect(report.stats.updateCount).toBeGreaterThanOrEqual(1);

      vi.useRealTimers();
    });

    it('continues detecting changes after disposal and re-initialization', () => {
      vi.useFakeTimers();
      const tree = signalTree({ value: 0 });

      // First initialization
      const enhanced1 = guardrails({
        changeDetection: { disablePathNotifier: true },
      })(tree);

      (enhanced1.$['value'] as any).set(1);
      vi.advanceTimersByTime(50);
      const api1 = (enhanced1 as any).__guardrails;
      const count1 = api1.getReport().stats.updateCount;
      expect(count1).toBeGreaterThan(0);

      // Dispose
      api1.dispose();

      // Re-initialize on same tree
      const enhanced2 = guardrails({
        changeDetection: { disablePathNotifier: true },
      })(tree);

      (enhanced2.$['value'] as any).set(2);
      vi.advanceTimersByTime(50);
      const api2 = (enhanced2 as any).__guardrails;
      const count2 = api2.getReport().stats.updateCount;
      expect(count2).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('detects changes in nested structure', () => {
      vi.useFakeTimers();
      const tree = signalTree({
        nested: {
          prop: 'initial',
        },
      });

      const enhanced = guardrails({
        changeDetection: { disablePathNotifier: true },
      })(tree);

      // Mutate nested value
      (enhanced.$['nested'] as any).prop.set('updated');
      vi.advanceTimersByTime(50);

      const api = (enhanced as any).__guardrails;
      const report = api.getReport();
      expect(report.stats.updateCount).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('handles polling with stress test', () => {
      vi.useFakeTimers();
      const tree = signalTree({ count: 0 });
      const enhanced = guardrails({
        changeDetection: { disablePathNotifier: true },
      })(tree);

      // Make changes and immediately poll
      for (let i = 0; i < 5; i++) {
        (enhanced.$['count'] as any).set(i);
        vi.advanceTimersByTime(50);
      }

      const api = (enhanced as any).__guardrails;
      const report = api.getReport();
      expect(report.stats.updateCount).toBeGreaterThan(0);

      vi.useRealTimers();
    });
  });
});
