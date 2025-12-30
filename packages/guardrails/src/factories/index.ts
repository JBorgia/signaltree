import { rules, withGuardrails } from '../noop';

import type { ISignalTree, TreeConfig, Enhancer } from '@signaltree/core';

import type { GuardrailsConfig, GuardrailRule } from '../lib/types';
declare const ngDevMode: boolean | undefined;

interface GlobalProcess {
  env?: Record<string, string | undefined>;
}

declare const process: GlobalProcess | undefined;

type SignalTreeFactory<T extends Record<string, unknown>> = (
  initial: T,
  config?: TreeConfig
) => ISignalTree<T>;

// Polymorphic enhancer signature compatible with v6 `Enhancer<TAdded>`
// (kept here for reference if needed by future local typings)

interface FeatureTreeOptions<T extends Record<string, unknown>> {
  name: string;
  env?: 'development' | 'test' | 'staging' | 'production';
  persistence?: boolean | Record<string, unknown>;
  guardrails?: boolean | GuardrailsConfig<T>;
  devtools?: boolean;
  enhancers?: Enhancer<unknown>[];
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
): ISignalTree<T> {
  const env = options.env ?? process?.env?.['NODE_ENV'] ?? 'production';

  const isDev = env === 'development';
  const isTest = env === 'test';

  const enhancers: Enhancer<unknown>[] = [];

  if (isDev || isTest) {
    const guardrailsConfig = resolveGuardrailsConfig<T>(options.guardrails);
    if (guardrailsConfig) {
      // `withGuardrails` returns a monomorphic enhancer; cast to `Enhancer<unknown>`
      // so factories can accept it uniformly. This is safe because the factory
      // doesn't depend on the added methods and `.with()` will correctly type
      // the resulting tree for callers.
      enhancers.push(
        withGuardrails(guardrailsConfig) as unknown as Enhancer<unknown>
      );
    }
  }

  if (options.enhancers?.length) {
    enhancers.push(...options.enhancers);
  }

  const tree = signalTree(initial);
  // Apply enhancers in an `unknown` local to avoid leaking temporary
  // `SignalTree<unknown>` inference into the typed `SignalTree<T>`.
  // The factory API remains strongly typed for callers; this cast only
  // affects internal sequencing of enhancers.
  let enhanced: unknown = tree;
  for (const enhancer of enhancers) {
    enhanced = (enhanced as any).with(enhancer);
  }

  return enhanced as ISignalTree<T>;
}

/**
 * Angular-specific factory
 */
export function createAngularFeatureTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  options: Omit<FeatureTreeOptions<T>, 'env'>
): ISignalTree<T> {
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
): ISignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: 'app-shell',
    guardrails: {
      budgets: {
        maxUpdateTime: 4,
        maxMemory: 20,
      },
      hotPaths: { threshold: 5 },
      customRules: [rules.noDeepNesting(3) as unknown as GuardrailRule<T>],
    } as GuardrailsConfig<T>,
  });
}

/**
 * Performance tree for real-time scenarios
 */
export function createPerformanceTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  name: string
): ISignalTree<T> {
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
): ISignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: `form-${formName}`,
    guardrails: {
      customRules: [
        rules.noDeepNesting(4) as unknown as GuardrailRule<T>,
        rules.maxPayloadSize(50) as unknown as GuardrailRule<T>,
        rules.noSensitiveData() as unknown as GuardrailRule<T>,
      ],
    } as GuardrailsConfig<T>,
  });
}

/**
 * Cache tree with relaxed rules
 */
export function createCacheTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T
): ISignalTree<T> {
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
  overrides?: Partial<GuardrailsConfig<T>>
): ISignalTree<T> {
  return createFeatureTree(signalTree, initial, {
    name: 'test',
    env: 'test',
    guardrails: {
      mode: 'throw',
      budgets: {
        maxUpdateTime: 5,
        maxRecomputations: 50,
      },
      customRules: [
        rules.noFunctionsInState() as unknown as GuardrailRule<T>,
        rules.noDeepNesting(4) as unknown as GuardrailRule<T>,
      ],
      ...(overrides as unknown as Partial<GuardrailsConfig<T>>),
    } as GuardrailsConfig<T>,
  });
}
