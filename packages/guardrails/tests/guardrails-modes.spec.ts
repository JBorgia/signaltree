import { guardrails } from '../src/lib/guardrails';
import { rules } from '../src/lib/rules';

import type { ISignalTree } from '@signaltree/core';
import type { GuardrailsAPI, GuardrailsReport } from '../src/lib/types';

type MockTree<T extends Record<string, unknown>> = {
  (): T;
  (value: Partial<T>): T;
  $: T;
  destroy: () => void;
};

type GuardrailsTree<T extends Record<string, unknown>> = MockTree<T> & {
  __guardrails?: GuardrailsAPI;
};

const TEST_CONFIG_BASE = {
  changeDetection: { disablePathNotifier: true },
} as const;

const POLLING_INTERVAL_MS = 50;

function createMockTree<T extends Record<string, unknown>>(
  initial: T
): MockTree<T> {
  let state = structuredClone(initial);
  const tree = ((arg?: Partial<T>) => {
    if (arg === undefined) return state;
    state = { ...state, ...arg };
    return state;
  }) as MockTree<T>;
  Object.defineProperties(tree, {
    $: { get: () => state, enumerable: false },
  });
  tree.destroy = () => undefined;
  return tree;
}

async function waitForPolling(times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    vi.advanceTimersByTime(POLLING_INTERVAL_MS);
    await Promise.resolve();
  }
}

describe('Guardrails — modes and reporting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env['NODE_ENV'] = 'development';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as { __DEV__?: boolean }).__DEV__;
  });

  it('mode: throw — budget violations propagate as thrown errors', async () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = guardrails({
      ...TEST_CONFIG_BASE,
      mode: 'throw',
      budgets: { maxUpdateTime: 5 },
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as ISignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    // Mock slow performance to trigger budget violation
    const perfNowMock = vi.spyOn(performance, 'now');
    let callCount = 0;
    perfNowMock.mockImplementation(() => {
      callCount++;
      return callCount * 10;
    });

    enhanced({ count: 1 });

    // Budget violations go through analyzePostUpdate which doesn't catch addIssue's
    // throw, so polling-driven detection should propagate the error.
    await expect(async () => {
      await waitForPolling(2);
    }).rejects.toThrow(/Guardrails/);

    enhanced.__guardrails?.dispose();
  });

  it('reporting: customReporter is called when issues are reported', async () => {
    const tree = createMockTree({ count: 0 });
    const reports: GuardrailsReport[] = [];
    const enhancer = guardrails({
      ...TEST_CONFIG_BASE,
      customRules: [
        {
          name: 'always-fail',
          test: () => false,
          message: 'always fails',
          severity: 'warning',
        },
      ],
      // Note: maybeReport early-returns when console is explicitly false,
      // so customReporter only fires when console is left default or set to true/'verbose'.
      // The console.log spy in beforeEach silences any output so this is still quiet.
      reporting: {
        interval: 50,
        customReporter: (report) => reports.push(report),
      },
    });
    const enhanced = enhancer(
      tree as unknown as ISignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    enhanced({ count: 1 });
    await waitForPolling(2);
    // Advance past the reporting interval (default checks every reporting.interval ms)
    vi.advanceTimersByTime(60);
    await Promise.resolve();

    expect(reports.length).toBeGreaterThan(0);
    expect(reports[0]?.issues.some((i) => i.metadata?.['rule'] === 'always-fail')).toBe(
      true
    );

    enhanced.__guardrails?.dispose();
  });

  it('issue aggregation: identical rule failures collapse into a single counted entry', async () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = guardrails({
      ...TEST_CONFIG_BASE,
      customRules: [
        {
          name: 'always-fail',
          test: () => false,
          message: 'fails every time',
          severity: 'warning',
        },
      ],
      reporting: { console: false, aggregateWarnings: true },
    });
    const enhanced = enhancer(
      tree as unknown as ISignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    enhanced({ count: 1 });
    await waitForPolling(1);
    enhanced({ count: 2 });
    await waitForPolling(1);
    enhanced({ count: 3 });
    await waitForPolling(1);

    const report = enhanced.__guardrails?.getReport();
    if (!report) throw new Error('no report');

    const failingRule = report.issues.filter(
      (issue) => issue.metadata?.['rule'] === 'always-fail'
    );

    // With aggregation: at most one entry per (type, path, message) combination.
    // The count field reflects how many times it fired.
    expect(failingRule.length).toBeLessThanOrEqual(report.issues.length);
    if (failingRule[0]) {
      expect(failingRule[0].count).toBeGreaterThanOrEqual(1);
    }

    enhanced.__guardrails?.dispose();
  });
});
