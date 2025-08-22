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
// The actual heavy implementation has been moved to `devtools.impl.ts`.
// Here we provide a tiny shim that attaches a no-op/minimal devtools
// interface synchronously so consumers get a stable API. If `enabled` is
// truthy we'll asynchronously load the full implementation and replace the
// interface on the tree when ready. This keeps the main bundle small while
// preserving the original public API.

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
    enableLogging = false,
    performanceThreshold = 16,
  } = config;

  return (
    tree: SignalTree<T>
  ): SignalTree<T> & { __devTools: ModularDevToolsInterface<T> } => {
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

    // Attach the noop interface synchronously so callers can read `.__devTools`
    // immediately. If enabled, attempt to load the full impl in the
    // background and replace the interface when ready.
    Object.assign(tree, { __devTools: createNoopInterface() });

    if (enabled) {
      // Fire-and-forget: load heavy impl asynchronously.
      (async () => {
        try {
          const mod = await import('./devtools.impl');
          const real = await mod.attachDevTools(tree, {
            enabled,
            treeName,
            enableBrowserDevTools,
            enableLogging,
            performanceThreshold,
          });
          Object.assign(tree, { __devTools: real });
        } catch (err) {
          console.debug('devtools: failed to load implementation', err);
        }
      })();
    }

    return tree as SignalTree<T> & { __devTools: ModularDevToolsInterface<T> };
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
