import { rules } from '../src/lib/rules';

import type { ISignalTree } from '@signaltree/core';
import type { RuleContext, RuntimeStats } from '../src/lib/types';

function statsStub(): RuntimeStats {
  return {
    updateCount: 0,
    totalUpdateTime: 0,
    avgUpdateTime: 0,
    p50UpdateTime: 0,
    p95UpdateTime: 0,
    p99UpdateTime: 0,
    maxUpdateTime: 0,
    recomputationCount: 0,
    recomputationsPerSecond: 0,
    signalCount: 0,
    signalRetention: 0,
    unreadSignalCount: 0,
    memoryGrowthRate: 0,
    hotPathCount: 0,
    violationCount: 0,
  };
}

function ctx(
  overrides: Partial<RuleContext> = {}
): RuleContext<Record<string, unknown>> {
  return {
    path: [],
    value: undefined,
    tree: {} as ISignalTree<Record<string, unknown>>,
    stats: statsStub(),
    ...overrides,
  };
}

describe('built-in rules', () => {
  describe('noDeepNesting', () => {
    it('passes when path length is at or below maxDepth', () => {
      const rule = rules.noDeepNesting(3);
      expect(rule.test(ctx({ path: ['a'] }))).toBe(true);
      expect(rule.test(ctx({ path: ['a', 'b', 'c'] }))).toBe(true);
    });

    it('fails when path is deeper than maxDepth', () => {
      const rule = rules.noDeepNesting(2);
      expect(rule.test(ctx({ path: ['a', 'b', 'c'] }))).toBe(false);
    });
  });

  describe('noFunctionsInState', () => {
    it('rejects functions', () => {
      const rule = rules.noFunctionsInState();
      expect(rule.test(ctx({ value: () => 0 }))).toBe(false);
    });

    it('accepts non-function values', () => {
      const rule = rules.noFunctionsInState();
      expect(rule.test(ctx({ value: 0 }))).toBe(true);
      expect(rule.test(ctx({ value: { fn: 'string' } }))).toBe(true);
      expect(rule.test(ctx({ value: null }))).toBe(true);
    });
  });

  describe('noCacheInPersistence', () => {
    it('blocks cache writes during serialization', () => {
      const rule = rules.noCacheInPersistence();
      expect(
        rule.test(
          ctx({
            path: ['user', 'cache'],
            value: 'anything',
            metadata: { source: 'serialization' },
          })
        )
      ).toBe(false);
    });

    it('allows cache writes outside serialization context', () => {
      const rule = rules.noCacheInPersistence();
      expect(
        rule.test(
          ctx({
            path: ['user', 'cache'],
            value: 'anything',
            metadata: { source: 'user' },
          })
        )
      ).toBe(true);
    });
  });

  describe('maxPayloadSize', () => {
    it('rejects values that exceed the byte budget', () => {
      const rule = rules.maxPayloadSize(1); // 1 KB
      const heavy = 'x'.repeat(2048); // ~2KB
      expect(rule.test(ctx({ value: heavy }))).toBe(false);
    });

    it('accepts values under the byte budget', () => {
      const rule = rules.maxPayloadSize(1);
      expect(rule.test(ctx({ value: 'small' }))).toBe(true);
    });
  });

  describe('noSensitiveData', () => {
    it('blocks default sensitive keys (case-insensitive)', () => {
      const rule = rules.noSensitiveData();
      expect(rule.test(ctx({ path: ['user', 'password'] }))).toBe(false);
      expect(rule.test(ctx({ path: ['authToken'] }))).toBe(false);
      expect(rule.test(ctx({ path: ['SECRET_KEY'] }))).toBe(false);
      expect(rule.test(ctx({ path: ['profile', 'apiKey'] }))).toBe(false);
    });

    it('accepts non-sensitive paths', () => {
      const rule = rules.noSensitiveData();
      expect(rule.test(ctx({ path: ['user', 'name'] }))).toBe(true);
      expect(rule.test(ctx({ path: ['settings', 'theme'] }))).toBe(true);
    });

    it('honors custom sensitive-key list', () => {
      const rule = rules.noSensitiveData(['ssn', 'dob']);
      expect(rule.test(ctx({ path: ['user', 'ssn'] }))).toBe(false);
      expect(rule.test(ctx({ path: ['user', 'password'] }))).toBe(true); // not in custom list
    });
  });
});
