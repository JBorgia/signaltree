import { Signal, signal } from '@angular/core';
import { SignalTree } from '@signaltree/core';

export type ModuleMetadata = {
  name: string;
  methods: string[];
  addedAt: Date;
  lastActivity: Date;
  operationCount: number;
  averageExecutionTime: number;
  errorCount: number;
};

export type ModularPerformanceMetrics = {
  totalUpdates: number;
  moduleUpdates: Record<string, number>;
  modulePerformance: Record<string, number>;
  compositionChain: string[];
  signalGrowth: Record<string, number>;
  memoryDelta: Record<string, number>;
  moduleCacheStats: Record<string, { hits: number; misses: number }>;
};

export type ModuleActivityTracker = {
  trackMethodCall: (module: string, method: string, duration: number) => void;
  trackError: (module: string, error: Error, context?: string) => void;
  getModuleActivity: (module: string) => ModuleMetadata | undefined;
  getAllModules: () => ModuleMetadata[];
};

export type CompositionLogger = {
  logComposition: (modules: string[], action: 'pipe' | 'enhance') => void;
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
};

export type ModularDevToolsInterface<T> = {
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
    lastState?: T;
  };
};

function createActivityTracker(): ModuleActivityTracker {
  let modules: Map<string, ModuleMetadata> | null = null;

  const ensureModules = () => {
    if (!modules) modules = new Map<string, ModuleMetadata>();
  };

  return {
    trackMethodCall: (module: string, method: string, duration: number) => {
      ensureModules();
      const m = modules as Map<string, ModuleMetadata>;
      const existing = m.get(module);
      if (existing) {
        existing.lastActivity = new Date();
        existing.operationCount++;
        existing.averageExecutionTime =
          (existing.averageExecutionTime * (existing.operationCount - 1) +
            duration) /
          existing.operationCount;
      } else {
        m.set(module, {
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
      ensureModules();
      const m = modules as Map<string, ModuleMetadata>;
      const existing = m.get(module);
      if (existing) {
        existing.errorCount++;
      }
      console.error(
        ` [${module}] Error${context ? ` in ${context}` : ''}:`,
        error
      );
    },

    getModuleActivity: (module: string) => modules?.get(module),

    getAllModules: () => (modules ? Array.from(modules.values()) : []),
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
    logComposition: (modules: string[], action: 'pipe' | 'enhance') => {
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

export async function attachDevTools<T>(
  tree: SignalTree<T>,
  config: {
    enabled?: boolean;
    treeName?: string;
    enableBrowserDevTools?: boolean;
    enableLogging?: boolean;
    performanceThreshold?: number;
  } = {}
): Promise<ModularDevToolsInterface<T>> {
  const {
    enabled = true,
    treeName = 'ModularSignalTree',
    enableBrowserDevTools = true,
    enableLogging = false,
    performanceThreshold = 16,
  } = config;

  if (!enabled) {
    // Return minimal interface
    return {
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

  const compositionHistory: Array<{ timestamp: Date; chain: string[] }> = [];

  const activeProfiles = new Map<
    string,
    { module: string; operation: string; startTime: number }
  >();

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

  type CallableState<S> = (() => S) & Record<PropertyKey, unknown>;

  const originalState = tree.$ as unknown as CallableState<T>;

  const maybeUpdate = originalState['update'];

  const originalUpdate =
    typeof maybeUpdate === 'function'
      ? (maybeUpdate as (u: unknown) => unknown).bind(originalState)
      : undefined;

  const stateProxy = new Proxy(originalState, {
    apply() {
      return originalState();
    },
    get(_target, prop) {
      if (prop === 'update') {
        return (updater: ((current: T) => Partial<T>) | Partial<T>) => {
          if (typeof console !== 'undefined') {
            console.log('[DevTools] Update method called');
          }
          const startTime =
            typeof performance !== 'undefined' && performance.now
              ? performance.now()
              : Date.now();

          const result = originalUpdate
            ? (originalUpdate as (u: unknown) => unknown)(updater)
            : undefined;

          const duration =
            typeof performance !== 'undefined' && performance.now
              ? performance.now() - startTime
              : Date.now() - startTime;

          const newState = originalState();

          try {
            metrics.trackModuleUpdate('core', duration);
          } catch (err) {
            console.debug('devtools: metrics.trackModuleUpdate failed', err);
          }

          if (duration > performanceThreshold) {
            try {
              logger.logPerformanceWarning(
                'core',
                'update',
                duration,
                performanceThreshold
              );
            } catch (err) {
              console.debug(
                'devtools: logger.logPerformanceWarning failed',
                err
              );
            }
          }

          if (browserDevTools) {
            try {
              browserDevTools.send('UPDATE', newState);
            } catch (err) {
              console.debug('devtools: browserDevTools.send failed', err);
            }
          }

          return result;
        };
      }

      const val = Reflect.get(originalState, prop);
      if (typeof val === 'function')
        return (val as (...a: unknown[]) => unknown).bind(originalState);
      return val;
    },
    has() {
      return true;
    },
    ownKeys() {
      return Reflect.ownKeys(originalState);
    },
    getOwnPropertyDescriptor(target, prop) {
      return Reflect.getOwnPropertyDescriptor(originalState, prop);
    },
  });

  try {
    (tree as unknown as { $?: unknown }).$ = stateProxy;
  } catch (assignErr) {
    console.debug('devtools: could not replace tree.$ with proxy', assignErr);
  }

  const devToolsInterface: ModularDevToolsInterface<T> = {
    activityTracker,
    logger,
    metrics: metrics.signal,

    trackComposition: (modules: string[]) => {
      compositionHistory.push({ timestamp: new Date(), chain: [...modules] });
      metrics.updateMetrics({ compositionChain: modules });
      logger.logComposition(modules, 'pipe');
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
        browserDevTools.send('@@INIT', tree.$());
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

  return devToolsInterface;
}
