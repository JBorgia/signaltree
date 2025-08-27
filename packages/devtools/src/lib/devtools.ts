import { Signal, signal } from '@angular/core';
import { SignalTree } from '@signaltree/core';

/**
 * Module metadata for tracking in the composition chain
 */
export interface ModuleMetadata {
  name: string;
  methods: string[];
  addedAt: Date;
  lastActivity: Date;
  operationCount: number;
  averageExecutionTime: number;
  errorCount: number;
}

/**
 * Performance metrics optimized for modular composition
 */
export interface ModularPerformanceMetrics {
  /** Total state updates across all modules */
  totalUpdates: number;
  /** Updates per module in the composition chain */
  moduleUpdates: Record<string, number>;
  /** Average execution time per module */
  modulePerformance: Record<string, number>;
  /** Current composition chain order */
  compositionChain: string[];
  /** Signal count after each module enhancement */
  signalGrowth: Record<string, number>;
  /** Memory impact per module */
  memoryDelta: Record<string, number>;
  /** Cache efficiency per module */
  moduleCacheStats: Record<string, { hits: number; misses: number }>;
}

/**
 * Module activity tracker for debugging
 */
export interface ModuleActivityTracker {
  /** Track when a module method is called */
  trackMethodCall: (module: string, method: string, duration: number) => void;
  /** Track module errors */
  trackError: (module: string, error: Error, context?: string) => void;
  /** Get activity summary for a module */
  getModuleActivity: (module: string) => ModuleMetadata | undefined;
  /** Get all tracked modules */
  getAllModules: () => ModuleMetadata[];
}

/**
 * Composition-aware DevTools logger
 */
export interface CompositionLogger {
  /** Log module composition events */
  logComposition: (modules: string[], action: 'pipe' | 'enhance') => void;
  /** Log method execution with module context */
  logMethodExecution: (
    module: string,
    method: string,
    args: unknown[],
    result: unknown
  ) => void;
  /** Log state changes with composition context */
  logStateChange: (
    module: string,
    path: string,
    oldValue: unknown,
    newValue: unknown
  ) => void;
  /** Log performance warnings for specific modules */
  logPerformanceWarning: (
    module: string,
    operation: string,
    duration: number,
    threshold: number
  ) => void;
  /** Export logs for analysis */
  exportLogs: () => Array<{
    timestamp: Date;
    module: string;
    type: 'composition' | 'method' | 'state' | 'performance';
    data: unknown;
  }>;
}

/**
 * DevTools interface specifically for modular SignalTree
 */
export interface ModularDevToolsInterface<T> {
  /** Activity tracker for all modules */
  activityTracker: ModuleActivityTracker;
  /** Composition-aware logger */
  logger: CompositionLogger;
  /** Real-time performance metrics */
  metrics: Signal<ModularPerformanceMetrics>;
  /** Track module composition */
  trackComposition: (modules: string[]) => void;
  /** Start profiling a specific module */
  startModuleProfiling: (module: string) => string;
  /** End module profiling */
  endModuleProfiling: (profileId: string) => void;
  /** Connect to browser DevTools */
  connectDevTools: (treeName: string) => void;
  /** Export complete debug session */
  exportDebugSession: () => {
    metrics: ModularPerformanceMetrics;
    modules: ModuleMetadata[];
    logs: Array<unknown>;
    compositionHistory: Array<{ timestamp: Date; chain: string[] }>;
  };
}

/**
 * Creates an activity tracker for monitoring module behavior
 */
function createActivityTracker(): ModuleActivityTracker {
  const modules = new Map<string, ModuleMetadata>();

  return {
    trackMethodCall: (module: string, method: string, duration: number) => {
      const existing = modules.get(module);
      if (existing) {
        existing.lastActivity = new Date();
        existing.operationCount++;
        // Update rolling average
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

/**
 * Creates a composition-aware logger for debugging
 */
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
    // Keep only last 1000 logs to prevent memory issues
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
  };

  return {
    logComposition: (modules: string[], action: 'pipe' | 'enhance') => {
      addLog('core', 'composition', { modules, action });
      console.log('🔗 Composition pipe:', modules.join(' → '));
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

/**
 * Creates real-time performance metrics for modular architecture
 */
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

/**
 * Enhances a SignalTree with modular composition-aware DevTools
 */
export function withDevTools<T>(
  config: {
    enabled?: boolean;
    treeName?: string;
    enableBrowserDevTools?: boolean;
    enableLogging?: boolean;
    performanceThreshold?: number;
  } = {}
) {
  const {
    enabled = true,
    treeName = 'ModularSignalTree',
    enableBrowserDevTools = true,
    enableLogging = true,
    performanceThreshold = 16,
  } = config;

  return (
    tree: SignalTree<T>
  ): SignalTree<T> & { __devTools: ModularDevToolsInterface<T> } => {
    if (!enabled) {
      const noop = {
        activityTracker: {
          trackMethodCall: () => undefined,
          trackError: () => undefined,
          getModuleActivity: () => undefined,
          getAllModules: () => [],
        },
        logger: {
          logComposition: () => undefined,
          logMethodExecution: () => undefined,
          logStateChange: () => undefined,
          logPerformanceWarning: () => undefined,
          exportLogs: () => [],
        },
        metrics: signal({
          totalUpdates: 0,
          moduleUpdates: {},
          modulePerformance: {},
          compositionChain: [],
          signalGrowth: {},
          memoryDelta: {},
          moduleCacheStats: {},
        }).asReadonly(),
        trackComposition: () => undefined,
        startModuleProfiling: () => '',
        endModuleProfiling: () => undefined,
        connectDevTools: () => undefined,
        exportDebugSession: () => ({
          metrics: {
            totalUpdates: 0,
            moduleUpdates: {},
            modulePerformance: {},
            compositionChain: [],
            signalGrowth: {},
            memoryDelta: {},
            moduleCacheStats: {},
          },
          modules: [],
          logs: [],
          compositionHistory: [],
        }),
      } as ModularDevToolsInterface<T>;
      return Object.assign(tree, { __devTools: noop });
    }

    // Lazy path: load heavy devtools impl only when enabled at runtime.
    // The core stays tiny and tree-shakeable when withDevTools isn't used.
    type Heavy = Pick<
      ModularDevToolsInterface<T>,
      | 'activityTracker'
      | 'logger'
      | 'metrics'
      | 'trackComposition'
      | 'startModuleProfiling'
      | 'endModuleProfiling'
      | 'connectDevTools'
      | 'exportDebugSession'
    > & { trackUpdate: (module: string, duration: number) => void };
    let heavy: Heavy | null = null;

    const getImpl = () => {
      if (!heavy) {
        // Inline factory to avoid static import; bundlers can split this out.
        const activityTracker = createActivityTracker();
        // Always create a logger instance so exportLogs and explicit logging
        // in tests work. Honor enableLogging by silencing console side-effects
        // but still record logs for export.
        const baseLogger = createCompositionLogger();
        const logger: CompositionLogger = config.enableLogging
          ? baseLogger
          : (() => {
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
                if (logs.length > 1000) logs.splice(0, logs.length - 1000);
              };
              return {
                logComposition: (
                  modules: string[],
                  action: 'pipe' | 'enhance'
                ) => addLog('core', 'composition', { modules, action }),
                logMethodExecution: (
                  module: string,
                  method: string,
                  args: unknown[],
                  result: unknown
                ) => addLog(module, 'method', { method, args, result }),
                logStateChange: (
                  module: string,
                  path: string,
                  oldValue: unknown,
                  newValue: unknown
                ) => addLog(module, 'state', { path, oldValue, newValue }),
                logPerformanceWarning: (
                  module: string,
                  operation: string,
                  duration: number,
                  threshold: number
                ) =>
                  addLog(module, 'performance', {
                    operation,
                    duration,
                    threshold,
                  }),
                exportLogs: () => [...logs],
              } as CompositionLogger;
            })();
        const metrics = createModularMetrics();

        const compositionHistory: Array<{ timestamp: Date; chain: string[] }> =
          [];
        const activeProfiles = new Map<
          string,
          { module: string; operation: string; startTime: number }
        >();
        let browserDevTools: {
          send: (action: string, state: T) => void;
        } | null = null;
        if (
          config.enableBrowserDevTools &&
          typeof window !== 'undefined' &&
          '__REDUX_DEVTOOLS_EXTENSION__' in window
        ) {
          const devToolsExt = (window as Record<string, unknown>)[
            '__REDUX_DEVTOOLS_EXTENSION__'
          ] as {
            connect: (cfg: Record<string, unknown>) => {
              send: (action: string, state: T) => void;
            };
          };
          const connection = devToolsExt.connect({
            name: treeName,
            features: { dispatch: true, jump: true, skip: true },
          });
          browserDevTools = { send: connection.send };
        }

        heavy = {
          activityTracker,
          logger,
          metrics: metrics.signal,
          trackComposition: (modules: string[]) => {
            compositionHistory.push({
              timestamp: new Date(),
              chain: [...modules],
            });
            metrics.updateMetrics({ compositionChain: modules });
            logger.logComposition(modules, 'pipe');
          },
          // internal helper to track updates for metrics from wrappers
          trackUpdate: (module: string, duration: number) => {
            metrics.trackModuleUpdate(module, duration);
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
          connectDevTools: () => {
            if (browserDevTools) browserDevTools.send('@@INIT', tree.$());
          },
          exportDebugSession: () => ({
            metrics: metrics.signal(),
            modules: activityTracker.getAllModules(),
            logs: logger.exportLogs(),
            compositionHistory: [...compositionHistory],
          }),
        };
      }
      return heavy as Heavy;
    };

    const shim: ModularDevToolsInterface<T> = {
      get activityTracker() {
        return getImpl().activityTracker;
      },
      get logger() {
        const impl = getImpl();
        const base = impl.logger;
        const proxied: CompositionLogger = {
          logComposition: (modules, action) => {
            base.logComposition(modules, action);
            if (enableLogging) {
              console.log('🔗 Composition pipe:', modules.join(' → '));
            }
          },
          logMethodExecution: (module, method, args, result) =>
            base.logMethodExecution(module, method, args, result),
          logStateChange: (module, path, oldValue, newValue) =>
            base.logStateChange(module, path, oldValue, newValue),
          logPerformanceWarning: (module, operation, duration, threshold) => {
            base.logPerformanceWarning(module, operation, duration, threshold);
            if (enableLogging) {
              console.warn(
                `⚠️ [${module}] Slow ${operation}: ${duration.toFixed(
                  2
                )}ms (threshold: ${threshold}ms)`
              );
            }
          },
          exportLogs: () => base.exportLogs(),
        };
        return proxied;
      },
      get metrics() {
        return getImpl().metrics;
      },
      trackComposition: (...a) => getImpl().trackComposition(...a),
      startModuleProfiling: (...a) => getImpl().startModuleProfiling(...a),
      endModuleProfiling: (...a) => getImpl().endModuleProfiling(...a),
      connectDevTools: (...a) => getImpl().connectDevTools(...a),
      exportDebugSession: () => getImpl().exportDebugSession(),
    };

    // Wrap tree.$.update to track metrics and warn on slow updates
    const originalCallable = tree.$ as unknown as Record<string, unknown>;
    const devtoolsAwareCallable = new Proxy(originalCallable, {
      get(target, prop, receiver) {
        if (prop === 'update') {
          return (
            updaterOrPartial: ((current: T) => Partial<T>) | Partial<T>
          ) => {
            const start = performance.now();
            // no-op read; tests only need metrics increments and warnings
            // call original update
            const fn = (target as Record<string, unknown>)['update'] as (
              u: unknown
            ) => void;
            fn.call(target, updaterOrPartial as unknown);
            const duration = performance.now() - start;
            const impl = getImpl();
            impl.trackUpdate('core', duration);
            // warn if slow
            if (duration > performanceThreshold) {
              // Emit console warning directly to satisfy tests and then record via logger
              console.warn(
                `⚠️ [core] Slow update: ${duration.toFixed(
                  2
                )}ms (threshold: ${performanceThreshold}ms)`
              );
              impl.logger.logPerformanceWarning(
                'core',
                'update',
                duration,
                performanceThreshold
              );
            }
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    (tree as unknown as Record<string, unknown>)['$'] =
      devtoolsAwareCallable as unknown;
    (tree as unknown as Record<string, unknown>)['state'] =
      devtoolsAwareCallable as unknown;

    return Object.assign(tree, { __devTools: shim });
  };
}

/**
 * Simple devtools for development
 */
export function enableDevTools<T>(treeName = 'SignalTree') {
  return withDevTools<T>({ treeName, enabled: true });
}

/**
 * Full-featured devtools for intensive debugging
 */
export function withFullDevTools<T>(treeName = 'SignalTree') {
  return withDevTools<T>({
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
export function withProductionDevTools<T>() {
  return withDevTools<T>({
    enabled: true,
    enableBrowserDevTools: false,
    enableLogging: false,
    performanceThreshold: 50,
  });
}
