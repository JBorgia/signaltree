import { Signal, signal } from '@angular/core';

/**
 * v6 DevTools Enhancer
 *
 * Contract: (config?) => <S>(tree: SignalTreeBase<S>) => SignalTreeBase<S> & DevToolsMethods
 */
import type {
  SignalTreeBase,
  DevToolsConfig,
  DevToolsMethods,
} from '../../lib/types';

// ============================================================================
// Types
// ============================================================================

export interface ModuleMetadata {
  name: string;
  methods: string[];
  addedAt: Date;
  lastActivity: Date;
  operationCount: number;
  averageExecutionTime: number;
  errorCount: number;
}

export interface ModularPerformanceMetrics {
  totalUpdates: number;
  moduleUpdates: Record<string, number>;
  modulePerformance: Record<string, number>;
  compositionChain: string[];
  signalGrowth: Record<string, number>;
  memoryDelta: Record<string, number>;
  moduleCacheStats: Record<string, { hits: number; misses: number }>;
}

export interface ModuleActivityTracker {
  trackMethodCall: (module: string, method: string, duration: number) => void;
  trackError: (module: string, error: Error, context?: string) => void;
  getModuleActivity: (module: string) => ModuleMetadata | undefined;
  getAllModules: () => ModuleMetadata[];
}

export interface CompositionLogger {
  logComposition: (modules: string[], action: 'with' | 'enhance') => void;
  logMethodExecution: (
    module: string,
    method: string,
    args: unknown[],
    result: unknown
  ) => void;
  logStateChange: (
    module: string,
    path: string,
    oldValue: unknown,
    newValue: unknown
  ) => void;
  logPerformanceWarning: (
    module: string,
    operation: string,
    duration: number,
    threshold: number
  ) => void;
  exportLogs: () => Array<{
    timestamp: Date;
    module: string;
    type: 'composition' | 'method' | 'state' | 'performance';
    data: unknown;
  }>;
}

export interface ModularDevToolsInterface {
  activityTracker: ModuleActivityTracker;
  logger: CompositionLogger;
  metrics: Signal<ModularPerformanceMetrics>;
  trackComposition: (modules: string[]) => void;
  startModuleProfiling: (module: string) => string;
  endModuleProfiling: (profileId: string) => void;
  connectDevTools: (treeName: string) => void;
  exportDebugSession: () => {
    metrics: ModularPerformanceMetrics;
    modules: ModuleMetadata[];
    logs: Array<unknown>;
    compositionHistory: Array<{ timestamp: Date; chain: string[] }>;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function createActivityTracker(): ModuleActivityTracker {
  const modules = new Map<string, ModuleMetadata>();

  return {
    trackMethodCall: (module: string, method: string, duration: number) => {
      const existing = modules.get(module);
      if (existing) {
        existing.lastActivity = new Date();
        existing.operationCount++;
        existing.averageExecutionTime =
          (existing.averageExecutionTime * (existing.operationCount - 1) +
            duration) /
          existing.operationCount;
      } else {
        modules.set(module, {
          name: module,
          methods: [method],
          addedAt: new Date(),
          lastActivity: new Date(),
          operationCount: 1,
          averageExecutionTime: duration,
          errorCount: 0,
        });
      }
    },

    trackError: (module: string, error: Error, context?: string) => {
      const existing = modules.get(module);
      if (existing) {
        existing.errorCount++;
      }
      console.error(
        `❌ [${module}] Error${context ? ` in ${context}` : ''}:`,
        error
      );
    },

    getModuleActivity: (module: string) => modules.get(module),

    getAllModules: () => Array.from(modules.values()),
  };
}

function createCompositionLogger(): CompositionLogger {
  const logs: Array<{
    timestamp: Date;
    module: string;
    type: 'composition' | 'method' | 'state' | 'performance';
    data: unknown;
  }> = [];

  const addLog = (
    module: string,
    type: 'composition' | 'method' | 'state' | 'performance',
    data: unknown
  ) => {
    logs.push({ timestamp: new Date(), module, type, data });
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
  };

  return {
    logComposition: (modules: string[], action: 'with' | 'enhance') => {
      addLog('core', 'composition', { modules, action });
      console.log(`🔗 Composition ${action}:`, modules.join(' → '));
    },

    logMethodExecution: (
      module: string,
      method: string,
      args: unknown[],
      result: unknown
    ) => {
      addLog(module, 'method', { method, args, result });
      console.debug(`🔧 [${module}] ${method}`, { args, result });
    },

    logStateChange: (
      module: string,
      path: string,
      oldValue: unknown,
      newValue: unknown
    ) => {
      addLog(module, 'state', { path, oldValue, newValue });
      console.debug(`📝 [${module}] State change at ${path}:`, {
        from: oldValue,
        to: newValue,
      });
    },

    logPerformanceWarning: (
      module: string,
      operation: string,
      duration: number,
      threshold: number
    ) => {
      addLog(module, 'performance', { operation, duration, threshold });
      console.warn(
        `⚠️ [${module}] Slow ${operation}: ${duration.toFixed(
          2
        )}ms (threshold: ${threshold}ms)`
      );
    },

    exportLogs: () => [...logs],
  };
}

function createNoopLogger(): CompositionLogger {
  return {
    logComposition: () => {
      /* noop */
    },
    logMethodExecution: () => {
      /* noop */
    },
    logStateChange: () => {
      /* noop */
    },
    logPerformanceWarning: () => {
      /* noop */
    },
    exportLogs: () => [],
  };
}

function createModularMetrics() {
  const metricsSignal = signal<ModularPerformanceMetrics>({
    totalUpdates: 0,
    moduleUpdates: {},
    modulePerformance: {},
    compositionChain: [],
    signalGrowth: {},
    memoryDelta: {},
    moduleCacheStats: {},
  });

  return {
    signal: metricsSignal.asReadonly(),
    updateMetrics: (updates: Partial<ModularPerformanceMetrics>) => {
      metricsSignal.update((current) => ({ ...current, ...updates }));
    },
    trackModuleUpdate: (module: string, duration: number) => {
      metricsSignal.update((current) => ({
        ...current,
        totalUpdates: current.totalUpdates + 1,
        moduleUpdates: {
          ...current.moduleUpdates,
          [module]: (current.moduleUpdates[module] || 0) + 1,
        },
        modulePerformance: {
          ...current.modulePerformance,
          [module]: duration,
        },
      }));
    },
  };
}

// ============================================================================
// Main Enhancer (v6 Pattern)
// ============================================================================

/**
 * Enhances a SignalTree with DevTools capabilities.
 *
 * @param config - DevTools configuration
 * @returns Polymorphic enhancer function
 */
export function withDevTools(
  config: DevToolsConfig = {}
): <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & DevToolsMethods {
  const {
    enabled = true,
    treeName = 'SignalTree',
    name,
    enableBrowserDevTools = true,
    enableLogging = true,
    performanceThreshold = 16,
  } = config;

  const displayName = name ?? treeName;

  return <Tree extends SignalTreeBase<any>>(tree: Tree): Tree & DevToolsMethods => {
    type S = Tree extends SignalTreeBase<infer U> ? U : unknown;
    // ========================================================================
    // Disabled path
    // ========================================================================
    if (!enabled) {
      const noopMethods: DevToolsMethods = {
        connectDevTools(): void {
          /* disabled */
        },
        disconnectDevTools(): void {
          /* disabled */
        },
      };
      return Object.assign(tree, noopMethods) as Tree & DevToolsMethods;
    }

    // ========================================================================
    // Enabled path
    // ========================================================================
    const activityTracker = createActivityTracker();
    const logger = enableLogging
      ? createCompositionLogger()
      : createNoopLogger();
    const metrics = createModularMetrics();

    const compositionHistory: Array<{ timestamp: Date; chain: string[] }> = [];
    const activeProfiles = new Map<
      string,
      { module: string; operation: string; startTime: number }
    >();

    // Browser DevTools integration
    let browserDevTools: {
      send: (action: string, state: unknown) => void;
    } | null = null;

    const initBrowserDevTools = (): void => {
      if (
        !enableBrowserDevTools ||
        typeof window === 'undefined' ||
        !('__REDUX_DEVTOOLS_EXTENSION__' in window)
      ) {
        return;
      }

      try {
        const devToolsExt = (window as Record<string, unknown>)[
          '__REDUX_DEVTOOLS_EXTENSION__'
        ] as {
          connect: (config: Record<string, unknown>) => {
            send: (action: string, state: unknown) => void;
          };
        };
        const connection = devToolsExt.connect({
          name: displayName,
          features: { dispatch: true, jump: true, skip: true },
        });
        browserDevTools = { send: connection.send };
        browserDevTools.send('@@INIT', tree());
        console.log(`🔗 Connected to Redux DevTools as "${displayName}"`);
      } catch (e) {
        console.warn('[SignalTree] Failed to connect to Redux DevTools:', e);
      }
    };

    // Store original tree call
    const originalTreeCall = (
      tree as unknown as {
        bind: (t: unknown) => (...args: unknown[]) => unknown;
      }
    ).bind(tree);

    // Create enhanced tree function with tracking
    const enhancedTree = function (
      this: SignalTreeBase<S>,
      ...args: unknown[]
    ): S | void {
      if (args.length === 0) {
        return originalTreeCall() as S;
      }

      const startTime = performance.now();

      // Execute update
      let result: void;
      if (args.length === 1) {
        const arg = args[0];
        if (typeof arg === 'function') {
          result = originalTreeCall(arg as (current: S) => S) as void;
        } else {
          result = originalTreeCall(arg as S) as void;
        }
      }

      const duration = performance.now() - startTime;
      const newState = originalTreeCall();

      metrics.trackModuleUpdate('core', duration);

      if (duration > performanceThreshold) {
        logger.logPerformanceWarning(
          'core',
          'update',
          duration,
          performanceThreshold
        );
      }

      if (browserDevTools) {
        browserDevTools.send('UPDATE', newState);
      }

      return result;
    } as unknown as SignalTreeBase<S>;

    // Copy properties from original tree
    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    Object.assign(enhancedTree, tree);

    if ('state' in tree) {
      Object.defineProperty(enhancedTree, 'state', {
        value: tree.state,
        enumerable: false,
        configurable: true,
      });
    }

    if ('$' in tree) {
      Object.defineProperty(enhancedTree, '$', {
        value: tree.$,
        enumerable: false,
        configurable: true,
      });
    }

    // DevTools interface
    const devToolsInterface: ModularDevToolsInterface = {
      activityTracker,
      logger,
      metrics: metrics.signal,

      trackComposition: (modules: string[]) => {
        compositionHistory.push({ timestamp: new Date(), chain: [...modules] });
        metrics.updateMetrics({ compositionChain: modules });
        logger.logComposition(modules, 'with');
      },

      startModuleProfiling: (module: string) => {
        const profileId = `${module}_${Date.now()}`;
        activeProfiles.set(profileId, {
          module,
          operation: 'profile',
          startTime: performance.now(),
        });
        return profileId;
      },

      endModuleProfiling: (profileId: string) => {
        const profile = activeProfiles.get(profileId);
        if (profile) {
          const duration = performance.now() - profile.startTime;
          activityTracker.trackMethodCall(
            profile.module,
            profile.operation,
            duration
          );
          activeProfiles.delete(profileId);
        }
      },

      connectDevTools: (name: string) => {
        if (browserDevTools) {
          browserDevTools.send('@@INIT', originalTreeCall());
          console.log(`🔗 Connected to Redux DevTools as "${name}"`);
        }
      },

      exportDebugSession: () => ({
        metrics: metrics.signal(),
        modules: activityTracker.getAllModules(),
        logs: logger.exportLogs(),
        compositionHistory: [...compositionHistory],
      }),
    };

    // Methods that match DevToolsMethods interface
    const methods: DevToolsMethods = {
      connectDevTools(): void {
        initBrowserDevTools();
      },
      disconnectDevTools(): void {
        browserDevTools = null;
      },
    };

    // Attach __devTools for advanced usage
    (enhancedTree as unknown as Record<string, unknown>)['__devTools'] =
      devToolsInterface;

    return Object.assign(enhancedTree, methods) as unknown as Tree & DevToolsMethods;
  };
}

// ============================================================================
// Convenience Helpers (v6 Pattern - no outer generic)
// ============================================================================

/**
 * Enable devtools with default settings
 */
export function enableDevTools(
  treeName = 'SignalTree'
): <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & DevToolsMethods {
  return withDevTools({ treeName, enabled: true });
}

/**
 * Full-featured devtools for intensive debugging
 */
export function withFullDevTools(
  treeName = 'SignalTree'
): <Tree extends SignalTreeBase<any>>(tree: Tree) => Tree & DevToolsMethods {
  return withDevTools({
    treeName,
    enabled: true,
    enableBrowserDevTools: true,
    enableLogging: true,
    performanceThreshold: 10,
  });
}

/**
 * Lightweight devtools for production
 */
export function withProductionDevTools(): <Tree extends SignalTreeBase<any>>(
  tree: Tree
) => Tree & DevToolsMethods {
  return withDevTools({
    enabled: true,
    enableBrowserDevTools: false,
    enableLogging: false,
    performanceThreshold: 50,
  });
}
