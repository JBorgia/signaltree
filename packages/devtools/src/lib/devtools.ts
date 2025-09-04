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
  logComposition: (modules: string[], action: 'with' | 'enhance') => void;
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
      // Return minimal devtools interface when disabled
      const createNoopInterface = () => ({
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
      });

      return Object.assign(tree, { __devTools: createNoopInterface() });
    }

    const activityTracker = createActivityTracker();
    const logger = enableLogging
      ? createCompositionLogger()
      : {
          logComposition: () => undefined,
          logMethodExecution: () => undefined,
          logStateChange: () => undefined,
          logPerformanceWarning: () => undefined,
          exportLogs: () => [],
        };
    const metrics = createModularMetrics();

    // Track composition history
    const compositionHistory: Array<{ timestamp: Date; chain: string[] }> = [];

    // Profiling state
    const activeProfiles = new Map<
      string,
      { module: string; operation: string; startTime: number }
    >();

    // Browser DevTools integration
    let browserDevTools: { send: (action: string, state: T) => void } | null =
      null;

    if (
      enableBrowserDevTools &&
      typeof window !== 'undefined' &&
      '__REDUX_DEVTOOLS_EXTENSION__' in window
    ) {
      const devToolsExt = (window as Record<string, unknown>)[
        '__REDUX_DEVTOOLS_EXTENSION__'
      ] as {
        connect: (config: Record<string, unknown>) => {
          send: (action: string, state: T) => void;
        };
      };
      const connection = devToolsExt.connect({
        name: treeName,
        features: { dispatch: true, jump: true, skip: true },
      });
      browserDevTools = { send: connection.send };
    }

    // Store the original callable tree function
    const originalTreeCall = tree.bind(tree);

    // Create enhanced tree function that includes devtools tracking
    const enhancedTree = function (
      this: SignalTree<T>,
      ...args: unknown[]
    ): T | void {
      if (args.length === 0) {
        // Get operation - call original directly (no tracking needed for reads)
        return originalTreeCall();
      } else {
        // Set or update operation - track with devtools
        const startTime = performance.now();

        // Execute the actual update using the original callable interface
        let result: void;
        if (args.length === 1) {
          const arg = args[0];
          if (typeof arg === 'function') {
            result = originalTreeCall(arg as (current: T) => T);
          } else {
            result = originalTreeCall(arg as T);
          }
        }

        const duration = performance.now() - startTime;
        const newState = originalTreeCall();

        // Track performance
        metrics.trackModuleUpdate('core', duration);

        if (duration > performanceThreshold) {
          logger.logPerformanceWarning(
            'core',
            'update',
            duration,
            performanceThreshold
          );
        }

        // Send to browser DevTools
        if (browserDevTools) {
          browserDevTools.send('UPDATE', newState);
        }

        return result;
      }
    } as SignalTree<T>;

    // Copy all properties and methods from original tree
    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    Object.assign(enhancedTree, tree);

    // Ensure state property is preserved
    if ('state' in tree) {
      Object.defineProperty(enhancedTree, 'state', {
        value: tree.state,
        enumerable: false,
        configurable: true,
      });
    }

    const devToolsInterface: ModularDevToolsInterface<T> = {
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

    return Object.assign(enhancedTree, { __devTools: devToolsInterface });
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
