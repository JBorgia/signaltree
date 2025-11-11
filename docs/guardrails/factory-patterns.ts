/**
 * SignalTree Factory Patterns
 * Convenient factories for creating SignalTree instances with guardrails
 * and environment-specific configuration
 */

import { signalTree, type SignalTree } from '@signaltree/core';
import { 
  withBatching, 
  withDevTools, 
  withSerialization,
  withTimeTravel,
  withEntities,
  type SerializationOptions 
} from '@signaltree/core/enhancers';
import { withGuardrails, rules, type GuardrailsConfig } from './guardrails-v1-implementation';

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
  
  // Always-on enhancers
  if (options.batching !== false) {
    enhancers.push(withBatching());
  }
  
  // Conditional persistence
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
  
  // Development-only enhancers (Angular way)
  if (typeof ngDevMode !== 'undefined' && ngDevMode) {
    // Guardrails with sensible defaults for Angular apps
    if (options.guardrails !== false) {
      const guardrailsConfig: GuardrailsConfig = typeof options.guardrails === 'object'
        ? options.guardrails
        : {
            mode: 'warn',
            budgets: {
              maxUpdateTime: 16,    // 60fps
              maxMemory: 50,
              maxRecomputations: 100,
              alertThreshold: 0.8,
            },
            hotPaths: {
              enabled: true,
              threshold: 10,
              topN: 5,
            },
            memoryLeaks: {
              enabled: true,
              checkInterval: 5000,
              retentionThreshold: 100,
            },
            customRules: [
              rules.noDeepNesting(5),
              rules.noFunctionsInState(),
              rules.maxPayloadSize(100),
            ],
            suppression: {
              autoSuppress: ['hydrate', 'reset', 'serialization', 'time-travel'],
              respectMetadata: true,
            },
            reporting: {
              console: true,
              interval: 5000,
              aggregateWarnings: true,
            },
          };
      
      enhancers.push(withGuardrails(guardrailsConfig));
    }
    
    // DevTools
    if (options.devtools !== false) {
      enhancers.push(withDevTools({
        name: `SignalTree: ${options.name}`,
        exclude: ['cache', 'temp'],
        maxDepth: 10,
      }));
    }
    
    // Time travel
    if (options.timeTravel) {
      enhancers.push(withTimeTravel({
        maxHistory: 50,
        exclude: ['cache'],
      }));
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
  // Detect environment
  const env = options.env || 
    (typeof process !== 'undefined' ? process.env.NODE_ENV : undefined) ||
    'production';
  
  const isDev = env === 'development';
  const isTest = env === 'test';
  const isStaging = env === 'staging';
  
  const enhancers: any[] = [];
  
  // Core enhancers
  enhancers.push(withBatching());
  
  // Persistence
  if (options.persistence && env !== 'test') {
    const persistenceConfig = typeof options.persistence === 'object'
      ? options.persistence
      : {
          key: `signaltree-${options.name}`,
          debounce: 1000,
          exclude: ['cache', 'temp'],
        };
    enhancers.push(withSerialization(persistenceConfig));
  }
  
  // Development/test enhancers
  if (isDev || isTest) {
    // Guardrails with environment-specific config
    if (options.guardrails !== false) {
      const guardrailsConfig: GuardrailsConfig = {
        ...(typeof options.guardrails === 'object' ? options.guardrails : {}),
        mode: isTest ? 'throw' : 'warn',
        enabled: true,
      };
      
      enhancers.push(withGuardrails(guardrailsConfig));
    }
    
    // DevTools (not in tests)
    if (isDev && options.devtools !== false) {
      enhancers.push(withDevTools({
        name: `SignalTree: ${options.name}`,
      }));
    }
  }
  
  // Staging gets lightweight guardrails
  if (isStaging && options.guardrails) {
    enhancers.push(withGuardrails({
      mode: 'silent',
      budgets: { maxUpdateTime: 50 },
      reporting: {
        customReporter: (report) => {
          // Send to monitoring service
          console.log('Staging metrics:', report.stats);
        },
      },
    }));
  }
  
  // Custom enhancers
  if (options.enhancers) {
    enhancers.push(...options.enhancers);
  }
  
  return signalTree(initial).with(...enhancers);
}

// ============================================
// Specialized Factories
// ============================================

/**
 * Factory for app shell state (minimal, global)
 */
export function createAppShellTree<T extends Record<string, unknown>>(
  initial: T
): SignalTree<T> {
  return createFeatureTree(initial, {
    name: 'app-shell',
    persistence: {
      key: 'app-shell',
      include: ['user', 'session', 'preferences'],
      debounce: 2000,
    },
    guardrails: {
      budgets: {
        maxUpdateTime: 4,  // Strict for shell
        maxMemory: 20,
      },
      hotPaths: {
        threshold: 5,  // Low threshold
      },
      customRules: [
        rules.noDeepNesting(3),  // Shallow structure
      ],
    },
  });
}

/**
 * Factory for high-performance feature trees (charts, real-time)
 */
export function createPerformanceTree<T extends Record<string, unknown>>(
  initial: T,
  name: string
): SignalTree<T> {
  return createFeatureTree(initial, {
    name,
    persistence: false,  // No persistence for performance
    guardrails: {
      budgets: {
        maxUpdateTime: 8,     // Stricter budget
        maxRecomputations: 200,  // Higher threshold
      },
      hotPaths: {
        threshold: 50,  // Much higher for real-time
      },
      memoryLeaks: {
        enabled: false,  // Performance over leak detection
      },
      reporting: {
        interval: 10000,  // Less frequent reporting
      },
    },
  });
}

/**
 * Factory for form state trees
 */
export function createFormTree<T extends Record<string, unknown>>(
  initial: T,
  formName: string
): SignalTree<T> {
  return createFeatureTree(initial, {
    name: `form-${formName}`,
    persistence: {
      key: `form-${formName}`,
      debounce: 500,  // Faster for forms
      ttl: 3600000,   // 1 hour TTL
    },
    guardrails: {
      customRules: [
        rules.noDeepNesting(4),
        rules.maxPayloadSize(50),  // Forms shouldn't be huge
        {
          name: 'no-sensitive-in-persistence',
          test: (ctx) => {
            if (ctx.metadata?.source === 'serialization') {
              const sensitive = ['password', 'ssn', 'creditCard'];
              const str = JSON.stringify(ctx.value).toLowerCase();
              return !sensitive.some(term => str.includes(term));
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

/**
 * Factory for cache/temporary state (no persistence, relaxed rules)
 */
export function createCacheTree<T extends Record<string, unknown>>(
  initial: T
): SignalTree<T> {
  return createFeatureTree(initial, {
    name: 'cache',
    persistence: false,
    guardrails: {
      mode: 'silent',  // Don't warn for cache
      memoryLeaks: {
        enabled: false,  // Cache is expected to grow
      },
    },
    devtools: false,  // Don't clutter devtools
  });
}

// ============================================
// Testing Factory
// ============================================

/**
 * Factory for tests with strict guardrails
 */
export function createTestTree<T extends Record<string, unknown>>(
  initial: T,
  overrides?: Partial<GuardrailsConfig>
): SignalTree<T> {
  return signalTree(initial).with(
    withGuardrails({
      mode: 'throw',  // Fail tests on violations
      budgets: {
        maxUpdateTime: 5,
        maxRecomputations: 50,
      },
      customRules: [
        rules.noFunctionsInState(),
        rules.noDeepNesting(4),
      ],
      ...overrides,
    })
  );
}

// ============================================
// Usage Examples
// ============================================

/*
// Angular Component
@Component({...})
export class DashboardComponent {
  private state = createAngularFeatureTree(
    {
      charts: [],
      filters: {},
      cache: {},
    },
    {
      name: 'dashboard',
      persistence: true,
      guardrails: true,
      devtools: true,
    }
  );
}

// React Component
function Dashboard() {
  const [state] = useState(() => 
    createFeatureTree(
      { charts: [], filters: {} },
      { 
        name: 'dashboard',
        env: process.env.NODE_ENV,
      }
    )
  );
}

// Vue Component
export default {
  setup() {
    const state = createFeatureTree(
      { data: {} },
      { 
        name: 'feature',
        env: import.meta.env.MODE,
      }
    );
  }
}

// Tests
describe('Feature', () => {
  it('should handle updates', () => {
    const tree = createTestTree({ count: 0 });
    tree.$.count.set(1);  // Will throw if violates budgets
  });
});
*/

// ============================================
// Migration Helper
// ============================================

/**
 * Migrate existing SignalTree to use guardrails
 */
export function addGuardrailsToTree<T extends Record<string, unknown>>(
  existingTree: SignalTree<T>,
  config?: GuardrailsConfig
): SignalTree<T> {
  // Check if already has guardrails
  if ((existingTree as any).__guardrails) {
    console.warn('Tree already has guardrails');
    return existingTree;
  }
  
  // Add guardrails enhancer
  return existingTree.with(withGuardrails(config));
}

// ============================================
// Type Exports
// ============================================

export type { GuardrailsConfig, GuardrailsReport } from './guardrails-v1-implementation';
