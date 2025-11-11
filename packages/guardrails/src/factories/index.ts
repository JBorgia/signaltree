/**
 * Factory Patterns for SignalTree with Guardrails
 * @packageDocumentation
 */

import { withGuardrails } from '../lib/guardrails';
import { rules } from '../lib/rules';
import type { GuardrailsConfig } from '../lib/types';

declare const ngDevMode: boolean | undefined;
declare const process: any;

interface FeatureTreeOptions {
  name: string;
  env?: 'development' | 'test' | 'staging' | 'production';
  persistence?: boolean | any;
  guardrails?: boolean | GuardrailsConfig;
  devtools?: boolean;
  enhancers?: any[];
}

/**
 * Framework-agnostic factory for creating feature trees with guardrails
 */
export function createFeatureTree<T extends Record<string, unknown>>(
  signalTree: any,
  initial: T,
  options: FeatureTreeOptions
): any {
  const env = options.env || 
    (typeof process !== 'undefined' ? process.env?.NODE_ENV : undefined) ||
    'production';
  
  const isDev = env === 'development';
  const isTest = env === 'test';
  
  const enhancers: any[] = [];
  
  // Core enhancers would go here (batching, etc.)
  
  // Dev-only enhancers
  if (isDev || isTest) {
    if (options.guardrails !== false) {
      const guardrailsConfig = typeof options.guardrails === 'object' 
        ? options.guardrails 
        : {
            budgets: { maxUpdateTime: 16, maxRecomputations: 100 },
            hotPaths: { enabled: true, threshold: 10 },
            reporting: { console: true },
          };
      
      enhancers.push(withGuardrails(guardrailsConfig));
    }
  }
  
  // Custom enhancers
  if (options.enhancers) {
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
  signalTree: any,
  initial: T,
  options: Omit<FeatureTreeOptions, 'env'>
): any {
  const isDev = typeof ngDevMode !== 'undefined' && ngDevMode;
  
  return createFeatureTree(signalTree, initial, {
    ...options,
    env: isDev ? 'development' : 'production',
  });
}

/**
 * App shell tree with strict budgets
 */
export function createAppShellTree<T extends Record<string, unknown>>(
  signalTree: any,
  initial: T
): any {
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
  signalTree: any,
  initial: T,
  name: string
): any {
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
  signalTree: any,
  initial: T,
  formName: string
): any {
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
  signalTree: any,
  initial: T
): any {
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
  signalTree: any,
  initial: T,
  overrides?: Partial<GuardrailsConfig>
): any {
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
        rules.noFunctionsInState(),
        rules.noDeepNesting(4),
      ],
      ...overrides,
    },
  });
}
