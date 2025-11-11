import { withGuardrails } from '../src/lib/guardrails';
import { rules } from '../src/lib/rules';
import type { SignalTree } from '@signaltree/core';
import type { GuardrailIssue, GuardrailsAPI } from '../src/lib/types';

type Middleware<T> = {
  id: string;
  before?: (action: string, payload: unknown, state: T) => boolean;
  after?: (action: string, payload: unknown, state: T, newState: T) => void;
};

type MockTree<T extends Record<string, unknown>> = {
  (): T;
  (value: Partial<T>): T;
  (updater: (current: T) => Partial<T>): T;
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

  const tree = ((arg?: Partial<T> | ((current: T) => Partial<T>)) => {
    if (arguments.length === 0) {
      return state;
    }

    const currentState = structuredClone(state);
    const payload =
      typeof arg === 'function'
        ? (arg as (current: T) => Partial<T>)(currentState)
        : (arg as Partial<T>);

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
});
