import { guardrails as realGuardrails } from '../lib/guardrails';
import { rules as realRules } from '../lib/rules';
import { guardrails as noopGuardrails, rules as noopRules } from '../noop';

import type { ISignalTree, TreeConfig, Enhancer } from '@signaltree/core';

import type { GuardrailsConfig, GuardrailRule } from '../lib/types';
declare const ngDevMode: boolean | undefined;

// The factories used to import '../noop' statically, which made every
// factory-created tree's guardrails INERT even in development — the second
// root cause behind the site-audit "guardrails dead" finding (RFC 0004 §8).
// Pick at build/run time instead: Angular prod builds define ngDevMode=false,
// so bundlers fold this to the noop and DCE the real implementation; dev
// builds get functional guardrails. This also lets the "./factories" export
// serve ONE artifact under both conditions (the old production mapping
// pointed at noop.js, which doesn't export the factory names at all).
const __DEV__ = typeof ngDevMode === 'undefined' || ngDevMode;
const guardrails = __DEV__ ? realGuardrails : noopGuardrails;
const rules = __DEV__ ? realRules : noopRules;

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
    budgets: { maxUpdateTime: 16 },
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
      // `guardrails` returns a monomorphic enhancer; cast to `Enhancer<unknown>`
      // so factories can accept it uniformly. This is safe because the factory
      // doesn't depend on the added methods and `.with()` will correctly type
      // the resulting tree for callers.
      enhancers.push(
        guardrails(guardrailsConfig) as unknown as Enhancer<unknown>
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
export function createGuardedFormTree<T extends Record<string, unknown>>(
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

let warnedCreateFormTree = false;

/**
 * @deprecated Renamed to {@link createGuardedFormTree} — this name collides
 * with `createFormTree` from `@signaltree/ng-forms` (the established
 * form-tree factory), so importing both packages forced call-site aliasing.
 * The behavior is identical; only the name changed (matching the sibling
 * `create*Tree` factories here). Removal in the next major.
 */
export function createFormTree<T extends Record<string, unknown>>(
  signalTree: SignalTreeFactory<T>,
  initial: T,
  formName: string
): ISignalTree<T> {
  if (
    (typeof ngDevMode === 'undefined' || ngDevMode) &&
    !warnedCreateFormTree
  ) {
    warnedCreateFormTree = true;
    console.warn(
      '[SignalTree] guardrails: createFormTree is deprecated — use ' +
        'createGuardedFormTree. (Renamed to avoid colliding with ' +
        "@signaltree/ng-forms' createFormTree.)"
    );
  }
  return createGuardedFormTree(signalTree, initial, formName);
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
      },
      customRules: [
        rules.noFunctionsInState() as unknown as GuardrailRule<T>,
        rules.noDeepNesting(4) as unknown as GuardrailRule<T>,
      ],
      ...(overrides as unknown as Partial<GuardrailsConfig<T>>),
    } as GuardrailsConfig<T>,
  });
}
