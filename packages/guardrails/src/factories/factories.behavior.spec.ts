import { signalTree } from '@signaltree/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rules } from '../lib/rules';
import {
  createFeatureTree,
  createFormTree,
  createGuardedFormTree,
} from './index';

import type { GuardrailsAPI, GuardrailsReport } from '../lib/types';
import type { ISignalTree } from '@signaltree/core';

/**
 * Behavioral pin for the ngDevMode-gated implementation pick in
 * factories/index.ts (RFC 0004 §8): factories used to statically import
 * '../noop', so factory-created trees had INERT guardrails even in dev.
 * These specs fail if the `__DEV__ ? real : noop` pick is flipped back to
 * the noop (mutation-checked: inverting the ternary makes every test here
 * fail because the noop attaches no `__guardrails` API and records nothing).
 */

function api(tree: ISignalTree<Record<string, unknown>>): GuardrailsAPI {
  return (tree as unknown as Record<string, unknown>)[
    '__guardrails'
  ] as GuardrailsAPI;
}

describe('guardrails factories — dev gate is functional (not the noop)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('createFeatureTree in dev wires REAL guardrails: a rule violation is recorded as a dev error and reported', () => {
    vi.useFakeTimers();
    const reports: GuardrailsReport[] = [];

    const tree = createFeatureTree(
      signalTree,
      { handler: null as unknown },
      {
        name: 'gate-spec',
        env: 'development',
        guardrails: {
          // Plain leaf writes don't reach the PathNotifier (it only emits for
          // entity collections), so force the polling strategy to observe the
          // violation deterministically.
          changeDetection: { disablePathNotifier: true },
          customRules: [rules.noFunctionsInState()],
          hotPaths: { enabled: false },
          memoryLeaks: { enabled: false },
          reporting: {
            // `console` unset keeps the console channel quiet; customReporter
            // fires regardless of the console setting (fixed in 11.6.0 — it
            // used to be silenced by `console: false`'s early return).
            interval: 20,
            customReporter: (r) => reports.push(r),
          },
        },
      }
    );

    // Noop pick would return the tree untouched — no monitoring API at all.
    expect(api(tree)).toBeDefined();

    // Violation: store a function in state (noFunctionsInState, severity error).
    (
      tree.$ as unknown as Record<string, { set(v: unknown): void }>
    )['handler'].set(() => undefined);

    // One polling tick (50ms) detects the change and evaluates rules.
    vi.advanceTimersByTime(55);

    const issues = api(tree).getReport().issues;
    expect(
      issues.some(
        (i) =>
          i.type === 'rule' &&
          i.severity === 'error' &&
          i.metadata?.['rule'] === 'no-functions'
      )
    ).toBe(true);

    // The violation is also delivered through the reporting channel.
    vi.advanceTimersByTime(25);
    expect(
      reports.some((r) =>
        r.issues.some((i) => i.metadata?.['rule'] === 'no-functions')
      )
    ).toBe(true);

    tree.destroy?.();
  });

  it('createGuardedFormTree attaches functional guardrails in dev (test env)', () => {
    // vitest NODE_ENV=test → createFeatureTree enables guardrails; the gated
    // pick must supply the real implementation, which attaches __guardrails.
    const tree = createGuardedFormTree(signalTree, { name: '' }, 'profile');
    const treeApi = api(tree);
    expect(treeApi).toBeDefined();
    expect(typeof treeApi.getReport).toBe('function');
    expect(treeApi.getReport().stats).toBeDefined();
    tree.destroy?.();
  });

  it('deprecated createFormTree alias warns once and delegates to createGuardedFormTree', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const t1 = createFormTree(signalTree, { name: '' }, 'p1');
    const t2 = createFormTree(signalTree, { name: '' }, 'p2');

    const deprecationWarns = warn.mock.calls.filter((c) =>
      String(c[0]).includes('createFormTree is deprecated')
    );
    expect(deprecationWarns.length).toBe(1); // once per process, not per call

    // Delegation produces the same guarded tree shape as the new name.
    expect(api(t1)).toBeDefined();
    expect(api(t2)).toBeDefined();

    t1.destroy?.();
    t2.destroy?.();
  });
});
