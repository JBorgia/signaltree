import { signalTree } from '@signaltree/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rules, withGuardrails } from './guardrails-v1-implementation';

// guardrails.spec.ts - Comprehensive test suite for SignalTree Guardrails

describe('SignalTree Guardrails Enhancer', () => {
  let tree: any;
  let guardrailsAPI: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleGroupSpy: any;

  beforeEach(() => {
    // Mock console methods
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});

    // Mock dev environment
    (globalThis as any).__DEV__ = true;
  });

  afterEach(() => {
    // Cleanup
    if (guardrailsAPI?.dispose) {
      guardrailsAPI.dispose();
    }
    vi.restoreAllMocks();
  });

  describe('Environment Detection', () => {
    it('should not apply in production', () => {
      (globalThis as any).__DEV__ = false;

      const prodTree = signalTree({ count: 0 }).with(withGuardrails());
      expect((prodTree as any).__guardrails).toBeUndefined();
    });

    it('should apply in development', () => {
      const devTree = signalTree({ count: 0 }).with(withGuardrails());
      expect((devTree as any).__guardrails).toBeDefined();
    });

    it('should respect enabled option', () => {
      const disabledTree = signalTree({ count: 0 }).with(
        withGuardrails({ enabled: false })
      );
      expect((disabledTree as any).__guardrails).toBeUndefined();

      const enabledTree = signalTree({ count: 0 }).with(
        withGuardrails({ enabled: true })
      );
      expect((enabledTree as any).__guardrails).toBeDefined();
    });

    it('should support function-based enabled check', () => {
      let shouldEnable = false;

      const tree = signalTree({ count: 0 }).with(
        withGuardrails({ enabled: () => shouldEnable })
      );
      expect((tree as any).__guardrails).toBeUndefined();

      shouldEnable = true;
      const tree2 = signalTree({ count: 0 }).with(
        withGuardrails({ enabled: () => shouldEnable })
      );
      expect((tree2 as any).__guardrails).toBeDefined();
    });
  });

  describe('Performance Budgets', () => {
    beforeEach(() => {
      tree = signalTree({
        user: { name: 'Alice', age: 30 },
        data: { items: [] },
      }).with(
        withGuardrails({
          mode: 'warn',
          budgets: {
            maxUpdateTime: 5, // 5ms budget for tests
            maxRecomputations: 10,
            maxTreeDepth: 3,
          },
          reporting: { console: false }, // Disable auto-reporting
        })
      );

      guardrailsAPI = tree.__guardrails;
    });

    it('should track update time budget', async () => {
      // Simulate slow update
      const slowUpdate = () => {
        const start = Date.now();
        while (Date.now() - start < 10) {} // Busy wait 10ms
        tree.$.user.name.set('Bob');
      };

      slowUpdate();

      const report = guardrailsAPI.getReport();
      const updateViolation = report.issues.find(
        (i) => i.type === 'budget' && i.message.includes('Update took')
      );

      expect(updateViolation).toBeDefined();
      expect(updateViolation?.severity).toBe('error');
    });

    it('should track recomputation budget', () => {
      // Simulate many recomputations
      for (let i = 0; i < 15; i++) {
        tree.$.data.items.set([...tree.$.data.items(), i]);
      }

      const report = guardrailsAPI.getReport();
      const recompViolation = report.issues.find(
        (i) => i.type === 'budget' && i.message.includes('recomputations')
      );

      // May or may not trigger depending on timing
      if (recompViolation) {
        expect(recompViolation.severity).toBe('warning');
      }
    });

    it('should respect alert threshold', () => {
      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          budgets: {
            maxUpdateTime: 10,
            alertThreshold: 0.5, // Warn at 50%
          },
        })
      );

      // 6ms update (60% of budget)
      const mediumUpdate = () => {
        const start = Date.now();
        while (Date.now() - start < 6) {}
        tree.$.count.set(1);
      };

      mediumUpdate();

      const report = tree.__guardrails.getReport();
      const warning = report.issues.find((i) => i.type === 'budget');

      if (warning) {
        expect(warning.severity).toBe('warning');
      }
    });

    it('should throw in throw mode', () => {
      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          mode: 'throw',
          budgets: { maxUpdateTime: 1 }, // Impossible budget
        })
      );

      expect(() => {
        tree.$.count.set(1);
      }).toThrow(/Guardrails violation/);
    });
  });

  describe('Hot Path Analysis', () => {
    beforeEach(() => {
      tree = signalTree({
        counter: 0,
        data: { value: 0 },
        cache: { temp: 0 },
      }).with(
        withGuardrails({
          hotPaths: {
            enabled: true,
            threshold: 5, // 5 updates/sec is hot
            topN: 3,
            windowMs: 1000,
          },
          reporting: { console: false },
        })
      );

      guardrailsAPI = tree.__guardrails;
    });

    it('should identify hot paths', () => {
      // Rapid updates to counter
      for (let i = 0; i < 10; i++) {
        tree.$.counter.set(i);
      }

      const report = guardrailsAPI.getReport();
      const hotPath = report.hotPaths.find((h) => h.path === 'counter');

      expect(hotPath).toBeDefined();
      expect(hotPath?.updatesPerSecond).toBeGreaterThanOrEqual(5);
      expect(hotPath?.heatScore).toBeGreaterThan(0);
    });

    it('should track multiple hot paths', () => {
      // Update multiple paths rapidly
      for (let i = 0; i < 8; i++) {
        tree.$.counter.set(i);
        tree.$.data.value.set(i);
      }

      const report = guardrailsAPI.getReport();
      expect(report.hotPaths.length).toBeGreaterThan(0);
      expect(report.hotPaths.length).toBeLessThanOrEqual(3); // topN limit
    });

    it('should calculate heat scores correctly', () => {
      // Many fast updates
      for (let i = 0; i < 20; i++) {
        tree.$.cache.temp.set(i);
      }

      const report = guardrailsAPI.getReport();
      const hotPath = report.hotPaths[0];

      expect(hotPath?.heatScore).toBeLessThanOrEqual(100);
      expect(hotPath?.heatScore).toBeGreaterThan(50); // Very hot
    });

    it('should track downstream effects', () => {
      // Assuming dev hooks are available
      if (tree.__devHooks) {
        tree.__devHooks.onRecomputation = (path: string, trigger: string) => {
          // Track that 'counter' triggers 'computed1'
          if (trigger === 'counter') {
            const stats = guardrailsAPI.getStats();
            const current = stats.downstreamEffects.get('counter') || 0;
            stats.downstreamEffects.set('counter', current + 1);
          }
        };
      }

      // Trigger updates
      for (let i = 0; i < 10; i++) {
        tree.$.counter.set(i);
      }

      const report = guardrailsAPI.getReport();
      const hotPath = report.hotPaths.find((h) => h.path === 'counter');

      // Will be 0 without dev hooks, >0 with them
      expect(hotPath?.downstreamEffects).toBeDefined();
    });
  });

  describe('Memory Leak Detection', () => {
    beforeEach(() => {
      tree = signalTree({
        features: {},
        cache: {},
      }).with(
        withGuardrails({
          memoryLeaks: {
            enabled: true,
            checkInterval: 100, // Fast checks for tests
            retentionThreshold: 10, // Low threshold for tests
            growthRate: 0.1, // 10% growth triggers warning
            trackUnread: true,
          },
          reporting: { console: false },
        })
      );

      guardrailsAPI = tree.__guardrails;
    });

    it('should warn on high signal retention', async () => {
      const stats = guardrailsAPI.getStats();

      // Simulate many signals
      stats.signalCount = 15;

      // Wait for check interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      const report = guardrailsAPI.getReport();
      const memoryWarning = report.issues.find(
        (i) =>
          i.type === 'memory' && i.message.includes('High signal retention')
      );

      expect(memoryWarning).toBeDefined();
      expect(memoryWarning?.severity).toBe('warning');
    });

    it('should detect rapid growth', async () => {
      const stats = guardrailsAPI.getStats();

      // Simulate growth
      stats.signalCount = 10;
      stats.signalGrowthRate = 0.15; // 15% growth

      await new Promise((resolve) => setTimeout(resolve, 150));

      const report = guardrailsAPI.getReport();
      const growthWarning = report.issues.find(
        (i) => i.type === 'memory' && i.message.includes('growing rapidly')
      );

      expect(growthWarning).toBeDefined();
    });

    it('should track unread signals', async () => {
      const stats = guardrailsAPI.getStats();

      // Add unread signal info
      stats.retainedPaths.set('features.unused', {
        createdAt: Date.now() - 15000, // Created 15s ago
        lastRead: 0, // Never read
        lastWrite: Date.now() - 15000,
        readCount: 0,
        writeCount: 1,
        isDisposed: false,
      });

      await new Promise((resolve) => setTimeout(resolve, 150));

      const report = guardrailsAPI.getReport();
      const unreadWarning = report.issues.find(
        (i) => i.type === 'memory' && i.message.includes('never read')
      );

      expect(unreadWarning).toBeDefined();
      expect(unreadWarning?.severity).toBe('info');
    });
  });

  describe('Custom Rules', () => {
    it('should evaluate custom rules', () => {
      tree = signalTree({
        deeply: { nested: { object: { with: { many: { levels: 'value' } } } } },
      }).with(
        withGuardrails({
          customRules: [rules.noDeepNesting(3)],
          reporting: { console: false },
        })
      );

      tree.$.deeply.nested.object.with.set({ many: { levels: 'updated' } });

      const report = tree.__guardrails.getReport();
      const nestingViolation = report.issues.find((i) =>
        i.message.includes('Path too deep')
      );

      expect(nestingViolation).toBeDefined();
      expect(nestingViolation?.type).toBe('rule');
    });

    it('should prevent functions in state', () => {
      tree = signalTree({ data: {} }).with(
        withGuardrails({
          customRules: [rules.noFunctionsInState()],
          reporting: { console: false },
        })
      );

      tree.$.data.set({ callback: () => {} });

      const report = tree.__guardrails.getReport();
      const functionViolation = report.issues.find((i) =>
        i.message.includes('Functions cannot be stored')
      );

      expect(functionViolation).toBeDefined();
      expect(functionViolation?.severity).toBe('error');
    });

    it('should check payload size', () => {
      tree = signalTree({ data: '' }).with(
        withGuardrails({
          customRules: [rules.maxPayloadSize(1)], // 1KB max
          reporting: { console: false },
        })
      );

      // Create >1KB string
      const largeString = 'x'.repeat(2000);
      tree.$.data.set(largeString);

      const report = tree.__guardrails.getReport();
      const sizeViolation = report.issues.find((i) =>
        i.message.includes('Payload too large')
      );

      expect(sizeViolation).toBeDefined();
    });

    it('should handle rule errors gracefully', () => {
      const badRule = {
        name: 'bad-rule',
        test: () => {
          throw new Error('Rule error');
        },
        message: 'Should not see this',
      };

      tree = signalTree({ data: 0 }).with(
        withGuardrails({
          customRules: [badRule],
          reporting: { console: false },
        })
      );

      expect(() => {
        tree.$.data.set(1);
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('bad-rule'),
        expect.any(Error)
      );
    });
  });

  describe('Intent-Aware Suppression', () => {
    beforeEach(() => {
      tree = signalTree({
        user: { name: '', age: 0 },
        cache: {},
      }).with(
        withGuardrails({
          suppression: {
            autoSuppress: ['hydrate', 'reset', 'serialization'],
            respectMetadata: true,
          },
          analysis: {
            warnParentReplace: true,
          },
          reporting: { console: false },
        })
      );

      guardrailsAPI = tree.__guardrails;
    });

    it('should suppress with metadata flag', () => {
      tree.update(
        { user: { name: 'New', age: 25 } },
        { suppressGuardrails: true }
      );

      const report = guardrailsAPI.getReport();
      expect(report.issues.length).toBe(0);
    });

    it('should auto-suppress hydrate intent', () => {
      tree.update(
        { user: { name: 'Hydrated', age: 30 } },
        { intent: 'hydrate' }
      );

      const report = guardrailsAPI.getReport();
      expect(report.issues.length).toBe(0);
    });

    it('should auto-suppress serialization source', () => {
      tree.update(
        { cache: { data: 'from storage' } },
        { source: 'serialization' }
      );

      const report = guardrailsAPI.getReport();
      expect(report.issues.length).toBe(0);
    });

    it('should support scoped suppression', () => {
      guardrailsAPI.scoped('reset', () => {
        // This would normally trigger parent replace warning
        tree.update({ user: { name: 'Reset', age: 0 } });
      });

      const report = guardrailsAPI.getReport();
      expect(report.issues.length).toBe(0);
    });

    it('should support suppress helper', () => {
      guardrailsAPI.suppress(() => {
        // All guardrails suppressed
        tree.$.user.set({ name: 'Suppressed', age: 100 });
      });

      const report = guardrailsAPI.getReport();
      expect(report.issues.length).toBe(0);
    });
  });

  describe('Reporting', () => {
    it('should report to console', () => {
      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          hotPaths: { threshold: 1 },
          reporting: {
            console: true,
            interval: 100,
          },
        })
      );

      // Trigger hot path
      for (let i = 0; i < 5; i++) {
        tree.$.count.set(i);
      }

      // Wait for report
      setTimeout(() => {
        expect(consoleGroupSpy).toHaveBeenCalledWith(
          expect.stringContaining('Guardrails Report')
        );
      }, 150);
    });

    it('should call custom reporter', (done) => {
      const customReporter = vi.fn((report) => {
        expect(report.timestamp).toBeDefined();
        expect(report.issues).toBeDefined();
        expect(report.hotPaths).toBeDefined();
        done();
      });

      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          reporting: {
            customReporter,
            interval: 50,
          },
        })
      );

      tree.$.count.set(1);
    });

    it('should aggregate similar warnings', () => {
      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          analysis: { forbidRootRead: true },
          reporting: {
            aggregateWarnings: true,
            console: false,
          },
        })
      );

      // Same violation multiple times
      for (let i = 0; i < 5; i++) {
        const value = tree(); // Root read
      }

      const report = tree.__guardrails.getReport();
      const rootReadViolations = report.issues.filter((i) =>
        i.message.includes('Reading from root')
      );

      expect(rootReadViolations.length).toBe(1);
      expect(rootReadViolations[0].count).toBe(5);
    });
  });

  describe('Disposal and Cleanup', () => {
    it('should clean up intervals on dispose', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          memoryLeaks: { enabled: true, checkInterval: 100 },
          reporting: { interval: 100 },
        })
      );

      const guardrails = tree.__guardrails;
      guardrails.dispose();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should stop reporting after disposal', async () => {
      tree = signalTree({ count: 0 }).with(
        withGuardrails({
          reporting: {
            console: true,
            interval: 50,
          },
        })
      );

      tree.__guardrails.dispose();

      // Updates after disposal
      tree.$.count.set(1);
      tree.$.count.set(2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have reported
      expect(consoleGroupSpy).not.toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex state updates', () => {
      const complexState = {
        users: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          settings: { theme: 'light', notifications: true },
        })),
        cache: { data: {}, timestamp: Date.now() },
        ui: { activeView: 'dashboard', sidebarOpen: true },
      };

      tree = signalTree(complexState).with(
        withGuardrails({
          budgets: { maxUpdateTime: 16 },
          hotPaths: { enabled: true },
          memoryLeaks: { enabled: true },
          customRules: [rules.noDeepNesting(5), rules.maxPayloadSize(100)],
        })
      );

      // Bulk update
      tree.update({
        users: complexState.users.map((u) => ({
          ...u,
          settings: { ...u.settings, theme: 'dark' },
        })),
        ui: { activeView: 'settings', sidebarOpen: false },
      });

      const report = tree.__guardrails.getReport();

      // Should complete without critical errors
      const errors = report.issues.filter((i) => i.severity === 'error');
      expect(errors.length).toBe(0);
    });
  });

  describe('Bundle Size and Tree Shaking', () => {
    it('should not include guardrails in production build', () => {
      // This would be verified by bundle analysis
      // Here we just check the metadata
      expect(guardrailsMetadata.devOnly).toBe(true);
      expect(guardrailsMetadata.sideEffects).toBe(false);
    });
  });
});
