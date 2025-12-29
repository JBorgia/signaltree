import { withGuardrails } from '../lib/guardrails';
import { rules } from '../lib/rules';

/**
 * Factory Patterns for SignalTree with Guardrails
 * @packageDocumentation
 */

import type {
  SignalTreeBase as SignalTree,
  TreeConfig,
} from '@signaltree/core';

import type { GuardrailsConfig } from '../lib/types';

declare const ngDevMode: boolean | undefined;

interface GlobalProcess {
  env?: Record<string, string | undefined>;
}

declare const process: GlobalProcess | undefined;

type SignalTreeFactory<T extends Record<string, unknown>> = (
  initial: T,
  config?: TreeConfig
) => SignalTree<T>;

type EnhancerFn<T extends Record<string, unknown>> = (
  tree: SignalTree<T>
) => SignalTree<T>;

interface FeatureTreeOptions<T extends Record<string, unknown>> {
  name: string;
  env?: 'development' | 'test' | 'staging' | 'production';
  persistence?: boolean | Record<string, unknown>;
  guardrails?: boolean | GuardrailsConfig;
  devtools?: boolean;
  enhancers?: EnhancerFn<T>[];
}

function isGuardrailsConfig<T extends Record<string, unknown>>(
  value: unknown
): value is GuardrailsConfig<T> {
  return Boolean(value) && typeof value === 'object';
}

function resolveGuardrailsConfig<T extends Record<string, unknown>>(
  guardrails: FeatureTreeOptions<T>['guardrails']
): GuardrailsConfig<T> | undefined {
  if (guardrails === false) {
    return undefined;
  }

  if (isGuardrailsConfig<T>(guardrails)) {
    return guardrails;
  }

  return {
    budgets: { maxUpdateTime: 16, maxRecomputations: 100 },
    hotPaths: { enabled: true, threshold: 10 },
    reporting: { console: true },
  } as GuardrailsConfig<T>;
}

/**
 * Framework-agnostic factory for creating feature trees with guardrails
 */
export function createFeatureTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  options: FeatureTreeOptions<T>
): SignalTree<T> {
  const env = options.env ?? process?.env?.['NODE_ENV'] ?? 'production';

  const isDev = env === 'development';
  const isTest = env === 'test';

  const enhancers: EnhancerFn<T>[] = [];

  if (isDev || isTest) {
    const guardrailsConfig = resolveGuardrailsConfig<T>(options.guardrails);
    if (guardrailsConfig) {
      enhancers.push(withGuardrails(guardrailsConfig));
    }
  }

  if (options.enhancers?.length) {
    enhancers.push(...options.enhancers);
  }

  let tree = signalTree(initial);
  for (const enhancer of enhancers) {
    tree = tree.with(enhancer);
  }

  return tree;
}

/**
 * Angular-specific factory
 */
export function createAngularFeatureTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  options: Omit<FeatureTreeOptions<T>, 'env'>
): SignalTree<T> {
  const isDev = Boolean(ngDevMode);

  return createFeatureTree(signalTree, initial, {
    ...options,
    env: isDev ? 'development' : 'production',
  });
}

/**
 * App shell tree with strict budgets
 */
export function createAppShellTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T
): SignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: 'app-shell',
    guardrails: {
      budgets: {
        maxUpdateTime: 4,
        maxMemory: 20,
      },
      hotPaths: { threshold: 5 },
      customRules: [rules.noDeepNesting(3)],
    },
  });
}

/**
 * Performance tree for real-time scenarios
 */
export function createPerformanceTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  name: string
): SignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name,
    persistence: false,
    guardrails: {
      budgets: {
        maxUpdateTime: 8,
        maxRecomputations: 200,
      },
      hotPaths: { threshold: 50 },
      memoryLeaks: { enabled: false },
      reporting: { interval: 10000 },
    },
  });
}

/**
 * Form tree with validation rules
 */
export function createFormTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  formName: string
): SignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: `form-${formName}`,
    guardrails: {
      customRules: [
        rules.noDeepNesting(4),
        rules.maxPayloadSize(50),
        rules.noSensitiveData(),
      ],
    },
  });
}

/**
 * Cache tree with relaxed rules
 */
export function createCacheTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T
): SignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: 'cache',
    persistence: false,
    guardrails: {
      mode: 'silent',
      memoryLeaks: { enabled: false },
    },
    devtools: false,
  });
}

/**
 * Test tree with strict enforcement
 */
export function createTestTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  overrides?: Partial<GuardrailsConfig>
): SignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: 'test',
    env: 'test',
    guardrails: {
      mode: 'throw',
      budgets: {
        maxUpdateTime: 5,
        maxRecomputations: 50,
      },
      customRules: [rules.noFunctionsInState(), rules.noDeepNesting(4)],
      ...overrides,
    },
  });
}
