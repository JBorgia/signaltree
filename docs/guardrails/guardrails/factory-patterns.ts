// @ts-nocheck
/**
 * SignalTree Factory Patterns (Documentation Snapshot)
 * Convenient factories for creating SignalTree instances with guardrails
 * and environment-specific configuration
 */

// NOTE: This file is a docs-oriented snapshot to illustrate patterns.
// It’s not wired into a build in this repository.

// ============================================
// Angular-Specific Factory
// ============================================

/**
 * Angular factory for creating feature trees with dev-only guardrails
 * Uses Angular's environment detection
 */
export function createAngularFeatureTree<T extends Record<string, unknown>>(
  initial: T,
  options: {
    name: string;
    persistence?: boolean | SerializationOptions;
    guardrails?: boolean | GuardrailsConfig;
    devtools?: boolean;
    timeTravel?: boolean;
    batching?: boolean;
  } = { name: 'feature' }
): SignalTree<T> {
  const enhancers: any[] = [];
  
  if (options.batching !== false) {
    enhancers.push(withBatching());
  }
  
  if (options.persistence) {
    const persistenceConfig = typeof options.persistence === 'object' 
      ? options.persistence 
      : {
          key: `signaltree-${options.name}`,
          debounce: 1000,
          exclude: ['cache', 'temp', 'internal'],
        };
    enhancers.push(withSerialization(persistenceConfig));
  }
  
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    if (options.guardrails !== false) {
      // Provide sensible defaults for Angular apps
      enhancers.push(withGuardrails(typeof options.guardrails === 'object' ? options.guardrails : {}));
    }
    if (options.devtools !== false) {
      enhancers.push(withDevTools());
    }
    if (options.timeTravel) {
      enhancers.push(withTimeTravel());
    }
  }
  
  return signalTree(initial).with(...enhancers);
}

// ============================================
// Framework-Agnostic Factory
// ============================================

/**
 * Generic factory that uses environment variables for configuration
 */
export function createFeatureTree<T extends Record<string, unknown>>(
  initial: T,
  options: {
    name: string;
    env?: 'development' | 'test' | 'staging' | 'production';
    persistence?: boolean | SerializationOptions;
    guardrails?: boolean | GuardrailsConfig;
    devtools?: boolean;
    enhancers?: any[];
  } = { name: 'feature' }
): SignalTree<T> {
  const env = options.env || (typeof process !== 'undefined' ? process.env.NODE_ENV : undefined) || 'production';
  const isDev = env === 'development';
  const isTest = env === 'test';
  const isStaging = env === 'staging';
  
  const enhancers: any[] = [];
  enhancers.push(withBatching());
  
  if (options.persistence && env !== 'test') {
    const persistenceConfig = typeof options.persistence === 'object'
      ? options.persistence
      : { key: `signaltree-${options.name}`, debounce: 1000, exclude: ['cache', 'temp'] };
    enhancers.push(withSerialization(persistenceConfig));
  }
  
  if (isDev || isTest) {
    if (options.guardrails !== false) {
      enhancers.push(withGuardrails(typeof options.guardrails === 'object' ? options.guardrails : {}));
    }
    if (isDev && options.devtools !== false) {
      enhancers.push(withDevTools());
    }
  }
  
  if (isStaging && options.guardrails) {
    enhancers.push(withGuardrails({
      mode: 'silent',
      budgets: { maxUpdateTime: 50 },
      reporting: {
        customReporter: (report) => { /* wire to staging telemetry here */ },
      },
    }));
  }
  
  if (options.enhancers) {
    enhancers.push(...options.enhancers);
  }
  
  return signalTree(initial).with(...enhancers);
}

// ============================================
// Specialized Factories (Examples)
// ============================================

export function createAppShellTree<T extends Record<string, unknown>>(initial: T): SignalTree<T> {
  return createFeatureTree(initial, {
    name: 'app-shell',
    persistence: { key: 'app-shell', include: ['user', 'session', 'preferences'], debounce: 2000 },
    guardrails: {
      budgets: { maxUpdateTime: 4, maxMemory: 20 },
      hotPaths: { threshold: 5 },
      customRules: [ rules.noDeepNesting(3) ],
    },
  });
}

export function createPerformanceTree<T extends Record<string, unknown>>(initial: T, name: string): SignalTree<T> {
  return createFeatureTree(initial, {
    name,
    persistence: false,
    guardrails: {
      budgets: { maxUpdateTime: 8, maxRecomputations: 200 },
      hotPaths: { threshold: 50 },
      memoryLeaks: { enabled: false },
      reporting: { interval: 10000 },
    },
  });
}

export function createFormTree<T extends Record<string, unknown>>(initial: T, formName: string): SignalTree<T> {
  return createFeatureTree(initial, {
    name: `form-${formName}`,
    persistence: { key: `form-${formName}`, debounce: 500, ttl: 3600000 as any },
    guardrails: {
      customRules: [
        rules.noDeepNesting(4),
        rules.maxPayloadSize(50),
        {
          name: 'no-sensitive-in-persistence',
          test: (ctx) => {
            if (ctx.metadata?.source === 'serialization') {
              // Inspect ctx.path/value and redact or fail
            }
            return true;
          },
          message: 'Sensitive data should not be persisted',
          severity: 'error',
        },
      ],
    },
  });
}

export function createCacheTree<T extends Record<string, unknown>>(initial: T): SignalTree<T> {
  return createFeatureTree(initial, {
    name: 'cache',
    persistence: false,
    guardrails: { mode: 'silent', memoryLeaks: { enabled: false } },
    devtools: false,
  });
}

// ============================================
// Migration Helper
// ============================================

export function addGuardrailsToTree<T extends Record<string, unknown>>(
  existingTree: SignalTree<T>,
  config?: GuardrailsConfig
): SignalTree<T> {
  if ((existingTree as any).__guardrails) {
    console.warn('Tree already has guardrails');
    return existingTree;
  }
  return existingTree.with(withGuardrails(config));
}

// ============================================
// Type Exports (Docs Only)
// ============================================

export type { GuardrailsConfig, GuardrailsReport } from './guardrails-v1-implementation';

// External types referenced for illustration (not defined here):
// - SignalTree, withBatching, withSerialization, withDevTools, withTimeTravel, withGuardrails,
// - SerializationOptions, rules
