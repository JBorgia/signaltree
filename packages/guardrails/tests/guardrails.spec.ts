import { withGuardrails } from '../src/lib/guardrails';
import { rules } from '../src/lib/rules';
import type { SignalTree } from '@signaltree/core';
import type { GuardrailIssue, GuardrailsAPI } from '../src/lib/types';

type Middleware<T> = {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
};

type UpdatePayload<T extends Record<string, unknown>> = Partial<T> &
  Record<string, unknown>;

type MockTree<T extends Record<string, unknown>> = {
  (): T;
  (value: UpdatePayload<T>): T;
  (updater: (current: T) => UpdatePayload<T>): T;
  state: T;
  $: T;
  addTap: (middleware: Middleware<T>) => void;
  removeTap: (id: string) => void;
  destroy: () => void;
};

type GuardrailsTree<T extends Record<string, unknown>> = MockTree<T> & {
  __guardrails?: GuardrailsAPI;
};

interface DevGlobal extends Global {
  __DEV__?: boolean;
}

const getDevGlobal = (): DevGlobal => globalThis as DevGlobal;

function setDevFlag(value: boolean | undefined): void {
  const devGlobal = getDevGlobal();
  if (value === undefined) {
    delete devGlobal.__DEV__;
  } else {
    devGlobal.__DEV__ = value;
  }
}

function createMockTree<T extends Record<string, unknown>>(
  initial: T
): MockTree<T> {
  let state = structuredClone(initial);
  const middlewares: Middleware<T>[] = [];

  const tree = ((
    arg?: UpdatePayload<T> | ((current: T) => UpdatePayload<T>)
  ) => {
    if (arguments.length === 0) {
      return state;
    }

    const currentState = structuredClone(state);
    const payload =
      typeof arg === 'function'
        ? (arg as (current: T) => UpdatePayload<T>)(currentState)
        : (arg as UpdatePayload<T>);

    for (const middleware of middlewares) {
      if (
        middleware.before &&
        !middleware.before('UPDATE', payload, currentState)
      ) {
        return state;
      }
    }

    state = { ...state, ...payload };

    for (const middleware of middlewares) {
      middleware.after?.('UPDATE', payload, currentState, state);
    }

    return state;
  }) as MockTree<T>;

  Object.defineProperties(tree, {
    state: {
      get: () => state,
      enumerable: false,
    },
    $: {
      get: () => state,
      enumerable: false,
    },
  });

  tree.addTap = (middleware: Middleware<T>) => {
    const index = middlewares.findIndex((entry) => entry.id === middleware.id);
    if (index >= 0) {
      middlewares[index] = middleware;
    } else {
      middlewares.push(middleware);
    }
  };
  tree.removeTap = (id: string) => {
    const index = middlewares.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      middlewares.splice(index, 1);
    }
  };
  tree.destroy = () => {
    // noop for tests
  };

  return tree;
}

describe('Guardrails Enhancer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    setDevFlag(true);
    process.env['NODE_ENV'] = 'development';
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    setDevFlag(undefined);
  });

  it('does not attach guardrails in production mode', () => {
    setDevFlag(false);
    process.env['NODE_ENV'] = 'production';

    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails();
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    expect(enhanced.__guardrails).toBeUndefined();
  });

  it('attaches guardrails API in development mode', () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({ reporting: { console: false } });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    expect(enhanced.__guardrails).toBeDefined();
    expect(typeof enhanced.__guardrails?.getReport).toBe('function');
    expect(typeof enhanced.__guardrails?.getStats).toBe('function');
  });

  it('captures update time budget violations', () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({
      budgets: { maxUpdateTime: 5 },
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValue(10);

    enhanced({ count: 1 });

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }
    const hasBudgetIssue = report.issues.some(
      (issue: GuardrailIssue) => issue.type === 'budget'
    );
    expect(hasBudgetIssue).toBe(true);

    enhanced.__guardrails?.dispose();
  });

  it('runs custom guardrail rules', () => {
    const tree = createMockTree({
      nested: { level: {} as Record<string, unknown> },
    });
    const enhancer = withGuardrails({
      customRules: [rules.noDeepNesting(2)],
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{
        nested: { level: Record<string, unknown> };
      }>
    ) as unknown as GuardrailsTree<{
      nested: { level: Record<string, unknown> };
    }>;

    enhanced({ nested: { level: { deeper: { value: 1 } } } });

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }
    const hasRuleIssue = report.issues.some((issue: GuardrailIssue) => {
      const rule = issue.metadata?.['rule'];
      return rule === 'no-deep-nesting';
    });
    expect(hasRuleIssue).toBe(true);

    enhanced.__guardrails?.dispose();
  });

  it('allows suppression of guardrails instrumentation', () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({
      budgets: { maxUpdateTime: 5 },
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(10)
      .mockReturnValue(10);

    const api = enhanced.__guardrails;
    if (!api) {
      throw new Error('Guardrails API unavailable');
    }

    api?.suppress(() => {
      enhanced({ count: 1 });
    });

    const report = api.getReport();
    expect(report.issues).toHaveLength(0);

    api.dispose();
  });

  it('tracks hot paths when threshold is exceeded', () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({
      hotPaths: { enabled: true, threshold: 1, windowMs: 1000, topN: 5 },
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    const nowValues = [0, 1, 1, 2];
    jest
      .spyOn(performance, 'now')
      .mockImplementation(() => nowValues.shift() ?? 2);

    enhanced({ count: 1 });
    enhanced({ count: 2 });

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }

    expect(report.hotPaths.length).toBeGreaterThan(0);
    const hotPathTargets = report.hotPaths.map((entry) => entry.path);
    expect(hotPathTargets).toContain('root');
    const [hotPath] = report.hotPaths;
    expect(hotPath.updatesPerSecond).toBeGreaterThan(1);

    enhanced.__guardrails?.dispose();
  });

  it('updates percentile stats across multiple samples', () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    const nowValues = [0, 5, 10, 30, 35, 70];
    jest
      .spyOn(performance, 'now')
      .mockImplementation(() => nowValues.shift() ?? 70);

    enhanced({ count: 1 });
    enhanced({ count: 2 });
    enhanced({ count: 3 });

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }

    expect(report.stats.updateCount).toBe(3);
    expect(report.stats.p50UpdateTime).toBeGreaterThan(0);
    expect(report.stats.p95UpdateTime).toBeGreaterThanOrEqual(
      report.stats.p50UpdateTime
    );
    expect(report.stats.p99UpdateTime).toBeGreaterThanOrEqual(
      report.stats.p95UpdateTime
    );

    enhanced.__guardrails?.dispose();
  });

  it('auto suppresses updates based on metadata intent', () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({
      budgets: { maxUpdateTime: 5 },
      suppression: { autoSuppress: ['bulk'] },
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(25)
      .mockReturnValue(25);

    enhanced({ count: 1, metadata: { intent: 'bulk' } });

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }
    expect(report.issues).toHaveLength(0);

    enhanced.__guardrails?.dispose();
  });

  it('disposes middleware and clears monitoring interval', () => {
    const tree = createMockTree({ count: 0 });
    const removeSpy = jest.spyOn(tree, 'removeTap');
    const clearSpy = jest.spyOn(globalThis, 'clearInterval');
    const enhancer = withGuardrails({
      reporting: { console: false },
    });
    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    const api = enhanced.__guardrails;
    if (!api) {
      throw new Error('Guardrails API unavailable');
    }

    api.dispose();

    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy.mock.calls[0]?.[0]).toContain('guardrails:');
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('reports analysis issues when diff ratio exceeds threshold', () => {
    const tree = createMockTree({
      profile: {
        name: 'Alice',
        location: { city: 'Denver', state: 'CO' },
      },
    });

    const enhancer = withGuardrails({
      analysis: { warnParentReplace: true, minDiffForParentReplace: 0.5 },
      reporting: { console: false },
    });

    const enhanced = enhancer(
      tree as unknown as SignalTree<{
        profile: { name: string; location: Record<string, string> };
      }>
    ) as unknown as GuardrailsTree<{
      profile: { name: string; location: Record<string, string> };
    }>;

    enhanced({
      profile: {
        name: 'Alice',
        location: { country: 'USA', timezone: 'MST' },
      },
    });

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }

    const analysisIssues = report.issues.filter(
      (issue) => issue.type === 'analysis'
    );
    expect(analysisIssues.length).toBeGreaterThan(0);
    expect(analysisIssues[0]?.message).toContain('High diff ratio');

    enhanced.__guardrails?.dispose();
  });

  it('handles asynchronous guardrail rules that resolve to false', async () => {
    const tree = createMockTree({ count: 0 });
    const enhancer = withGuardrails({
      customRules: [
        {
          name: 'async-test',
          test: async () => {
            await Promise.resolve();
            return false;
          },
          message: 'Async rule failed',
          severity: 'warning',
        },
      ],
      reporting: { console: false },
    });

    const enhanced = enhancer(
      tree as unknown as SignalTree<{ count: number }>
    ) as unknown as GuardrailsTree<{ count: number }>;

    enhanced({ count: 1 });
    await Promise.resolve();
    await Promise.resolve();

    const report = enhanced.__guardrails?.getReport();
    if (!report) {
      throw new Error('Guardrails report unavailable');
    }

    const ruleIssues = report.issues.filter((issue) => issue.type === 'rule');
    expect(ruleIssues.length).toBeGreaterThan(0);
    expect(ruleIssues[0]?.metadata?.['rule']).toBe('async-test');

    enhanced.__guardrails?.dispose();
  });
});
