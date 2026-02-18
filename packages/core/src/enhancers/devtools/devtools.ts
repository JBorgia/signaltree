import { effect as angularEffect, Signal, signal } from '@angular/core';

import { copyTreeProperties } from '../utils/copy-tree-properties';
import { getPathNotifier } from '../../lib/path-notifier';
import { applyState, snapshotState } from '../../lib/utils';

/**
 * v6 DevTools Enhancer
 *
 * Contract: (config?) => <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods
 */
import type {
  ISignalTree,
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

type DevToolsActionMeta = {
  timestamp: number;
  source?: string;
  duration?: number;
  slow?: boolean;
  paths?: string[];
  txId?: string;
};

type DevToolsAction = {
  type: string;
  payload?: unknown;
  meta?: DevToolsActionMeta;
};

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

function toArray(value?: string[] | string): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function matchesPattern(pattern: string, path: string): boolean {
  if (pattern === '**') return true;
  if (pattern === path) return true;

  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return path.startsWith(prefix + '.');
  }

  return false;
}

function defaultFormatPath(path: string): string {
  const segments = path.split('.');
  let formatted = '';
  for (const segment of segments) {
    if (!segment) continue;
    if (/^\d+$/.test(segment)) {
      formatted += `[${segment}]`;
    } else {
      formatted += formatted ? `.${segment}` : segment;
    }
  }
  return formatted || path;
}

function computeChangedPaths(
  prev: unknown,
  next: unknown,
  maxDepth: number,
  maxArrayLength: number,
  path = '',
  depth = 0,
  output: string[] = []
): string[] {
  if (prev === next) return output;

  if (depth >= maxDepth) {
    if (path) output.push(path);
    return output;
  }

  if (prev === null || next === null || prev === undefined || next === undefined) {
    if (path) output.push(path);
    return output;
  }

  const prevType = typeof prev;
  const nextType = typeof next;
  if (prevType !== 'object' || nextType !== 'object') {
    if (path) output.push(path);
    return output;
  }

  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) {
      if (path) output.push(path);
      return output;
    }
    if (prev.length > maxArrayLength) {
      if (path) output.push(path);
      return output;
    }
    for (let i = 0; i < prev.length; i += 1) {
      computeChangedPaths(
        prev[i],
        next[i],
        maxDepth,
        maxArrayLength,
        path ? `${path}.${i}` : `${i}`,
        depth + 1,
        output
      );
    }
    return output;
  }

  const prevObj = prev as Record<string, unknown>;
  const nextObj = next as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(prevObj), ...Object.keys(nextObj)]);
  if (keys.size === 0) {
    if (path) output.push(path);
    return output;
  }

  for (const key of keys) {
    computeChangedPaths(
      prevObj[key],
      nextObj[key],
      maxDepth,
      maxArrayLength,
      path ? `${path}.${key}` : key,
      depth + 1,
      output
    );
  }

  return output;
}

function sanitizeState(
  value: unknown,
  options: {
    maxDepth: number;
    maxArrayLength: number;
    maxStringLength: number;
  },
  depth = 0,
  seen = new WeakSet<object>()
): unknown {
  const { maxDepth, maxArrayLength, maxStringLength } = options;

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (value.length > maxStringLength) {
      return `${value.slice(0, maxStringLength)}…`;
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return `${value.toString()}n`;
  if (typeof value === 'symbol') return String(value);
  if (typeof value === 'function') return undefined;

  if (depth >= maxDepth) return '[MaxDepth]';

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);

    if (value instanceof Map) {
      const entries = Array.from(value.entries()).slice(0, maxArrayLength);
      return entries.map(([k, v]) => [
        sanitizeState(k, options, depth + 1, seen),
        sanitizeState(v, options, depth + 1, seen),
      ]);
    }

    if (value instanceof Set) {
      const values = Array.from(value.values()).slice(0, maxArrayLength);
      return values.map((v) => sanitizeState(v, options, depth + 1, seen));
    }

    if (Array.isArray(value)) {
      const list = value.slice(0, maxArrayLength);
      return list.map((item) => sanitizeState(item, options, depth + 1, seen));
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === 'function') continue;
      result[key] = sanitizeState(val, options, depth + 1, seen);
    }
    return result;
  }

  return value;
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

export function devTools(
  config: DevToolsConfig = {}
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  const {
    enabled = true,
    treeName = 'SignalTree',
    name,
    enableBrowserDevTools = true,
    enableTimeTravel = true,
    enableLogging = true,
    performanceThreshold = 16,
    includePaths,
    excludePaths,
    formatPath,
    rateLimitMs,
    maxSendsPerSecond,
    maxDepth = 10,
    maxArrayLength = 50,
    maxStringLength = 2000,
    serialize,
  } = config;

  const displayName = name ?? treeName;
  const pathInclude = toArray(includePaths);
  const pathExclude = toArray(excludePaths);
  const sendRateLimitMs =
    maxSendsPerSecond && maxSendsPerSecond > 0
      ? Math.ceil(1000 / maxSendsPerSecond)
      : rateLimitMs ?? 0;
  const formatPathFn = formatPath ?? defaultFormatPath;

  return <T>(tree: ISignalTree<T>): ISignalTree<T> & DevToolsMethods => {
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
      return Object.assign(tree, noopMethods) as unknown as ISignalTree<T> &
        DevToolsMethods;
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
    const compositionChain: string[] = [];
    const trackComposition = (modules: string[]): void => {
      compositionHistory.push({ timestamp: new Date(), chain: [...modules] });
      metrics.updateMetrics({ compositionChain: modules });
      logger.logComposition(modules, 'with');
    };
    const activeProfiles = new Map<
      string,
      { module: string; operation: string; startTime: number }
    >();

    // Browser DevTools integration
    let browserDevToolsConnection: {
      send: (action: unknown, state: unknown) => void;
      subscribe?: (
        listener: (message: unknown) => void
      ) => void | (() => void);
      disconnect?: () => void;
      unsubscribe?: () => void;
    } | null = null;
    let browserDevTools: {
      send: (action: unknown, state: unknown) => void;
      subscribe?: (
        listener: (message: unknown) => void
      ) => void | (() => void);
    } | null = null;
    let isConnected = false;
    let isApplyingExternalState = false;
    let unsubscribeDevTools: (() => void) | null = null;

    // PathNotifier subscriptions (batched mutation streaming)
    let unsubscribeNotifier: (() => void) | null = null;
    let unsubscribeFlush: (() => void) | null = null;
    let pendingPaths: string[] = [];

    // Effect + send scheduling for leaf-signal updates
    let effectRef: { destroy: () => void } | null = null;
    let effectPrimed = false;
    let sendScheduled = false;
    let pendingAction: DevToolsAction | null = null;
    let pendingExplicitAction = false;
    let pendingSource: string | undefined;
    let pendingDuration: number | undefined;
    let lastSnapshot: unknown = undefined;
    let lastSendAt = 0;
    let sendTimer: ReturnType<typeof setTimeout> | null = null;

    const isPathAllowed = (path: string): boolean => {
      if (pathInclude.length > 0) {
        const matched = pathInclude.some((pattern) =>
          matchesPattern(pattern, path)
        );
        if (!matched) return false;
      }
      if (pathExclude.length > 0) {
        const blocked = pathExclude.some((pattern) =>
          matchesPattern(pattern, path)
        );
        if (blocked) return false;
      }
      return true;
    };

    const readSnapshot = (): unknown => {
      try {
        if ('$' in tree) {
          return snapshotState((tree as ISignalTree<T>).$ as any);
        }
      } catch {
        // fall back to tree call
      }
      return originalTreeCall();
    };

    const buildSerializedState = (rawState: unknown): unknown => {
      if (serialize) {
        try {
          return serialize(rawState);
        } catch {
          // fall through to safe sanitization
        }
      }
      return sanitizeState(rawState, {
        maxDepth,
        maxArrayLength,
        maxStringLength,
      });
    };

    const buildAction = (
      type: string,
      payload?: unknown,
      meta?: Partial<DevToolsActionMeta>
    ): DevToolsAction => ({
      type,
      ...(payload !== undefined && { payload }),
      ...(meta && { meta: meta as DevToolsActionMeta }),
    });

    const flushSend = (): void => {
      sendScheduled = false;
      if (!browserDevTools || isApplyingExternalState) return;

      const rawSnapshot = readSnapshot();
      const currentSnapshot = rawSnapshot ?? {};
      const sanitized = buildSerializedState(currentSnapshot);

      const defaultPaths =
        lastSnapshot === undefined
          ? []
          : computeChangedPaths(
              lastSnapshot,
              currentSnapshot,
              maxDepth,
              maxArrayLength
            );

      const mergedPaths = Array.from(
        new Set([
          ...pendingPaths,
          ...defaultPaths.filter((path) => path && isPathAllowed(path)),
        ])
      );
      const formattedPaths = mergedPaths.map((path) => formatPathFn(path));

      if (
        pathInclude.length > 0 &&
        formattedPaths.length === 0 &&
        !pendingExplicitAction
      ) {
        pendingAction = null;
        pendingExplicitAction = false;
        pendingSource = undefined;
        pendingDuration = undefined;
        pendingPaths = [];
        lastSnapshot = currentSnapshot;
        return;
      }

      const effectiveAction = pendingExplicitAction
        ? pendingAction
        : formattedPaths.length === 1
        ? buildAction(`SignalTree/${formattedPaths[0]}`, formattedPaths[0])
        : formattedPaths.length > 1
        ? buildAction('SignalTree/update', formattedPaths)
        : buildAction('SignalTree/update');

      const actionMeta: DevToolsActionMeta = {
        timestamp: Date.now(),
        ...(pendingSource && { source: pendingSource }),
        ...(pendingDuration !== undefined && {
          duration: pendingDuration,
          slow: pendingDuration > performanceThreshold,
        }),
        ...(formattedPaths.length > 0 && { paths: formattedPaths }),
      };

      const actionToSend = buildAction(
        effectiveAction?.type ?? 'SignalTree/update',
        effectiveAction?.payload,
        actionMeta
      );

      try {
        browserDevTools.send(actionToSend, sanitized);
      } catch {
        // Ignore send failures
      } finally {
        pendingAction = null;
        pendingExplicitAction = false;
        pendingSource = undefined;
        pendingDuration = undefined;
        pendingPaths = [];
        lastSnapshot = currentSnapshot;
        lastSendAt = Date.now();
      }
    };

    const scheduleSend = (
      action?: DevToolsAction,
      meta?: Partial<DevToolsActionMeta>
    ): void => {
      if (isApplyingExternalState) return;
      if (action !== undefined) {
        pendingAction = action;
        pendingExplicitAction = true;
      }
      if (meta?.source) {
        if (!pendingSource) {
          pendingSource = meta.source;
        } else if (pendingSource !== meta.source) {
          pendingSource = 'mixed';
        }
      }
      if (meta?.duration !== undefined) {
        pendingDuration =
          pendingDuration === undefined
            ? meta.duration
            : Math.max(pendingDuration, meta.duration);
      }

      if (!browserDevTools) return;
      if (sendScheduled) return;
      sendScheduled = true;

      queueMicrotask(() => {
        if (!browserDevTools) {
          sendScheduled = false;
          return;
        }

        const now = Date.now();
        const waitMs = Math.max(0, sendRateLimitMs - (now - lastSendAt));
        if (waitMs > 0) {
          if (sendTimer) return;
          sendTimer = setTimeout(() => {
            sendTimer = null;
            flushSend();
          }, waitMs);
          return;
        }

        flushSend();
      });
    };

    const parseDevToolsState = (state: unknown): unknown => {
      if (typeof state === 'string') {
        try {
          return JSON.parse(state);
        } catch {
          return undefined;
        }
      }
      return state;
    };

    const applyExternalState = (state: unknown): void => {
      if (state === undefined || state === null) return;
      isApplyingExternalState = true;
      try {
        if ('$' in tree) {
          applyState((tree as ISignalTree<T>).$ as any, state as T);
        } else {
          originalTreeCall(state as T);
        }
      } finally {
        isApplyingExternalState = false;
        lastSnapshot = readSnapshot();
        pendingPaths = [];
      }
    };

    const handleDevToolsMessage = (message: unknown): void => {
      if (!enableTimeTravel) return;
      if (!message || typeof message !== 'object') return;

      const msg = message as {
        type?: string;
        payload?: { type?: string; nextLiftedState?: any };
        state?: unknown;
      };

      if (msg.type !== 'DISPATCH' || !msg.payload?.type) return;

      const actionType = msg.payload.type;
      if (actionType === 'JUMP_TO_STATE' || actionType === 'JUMP_TO_ACTION') {
        const nextState = parseDevToolsState(msg.state);
        applyExternalState(nextState);
        return;
      }

      if (actionType === 'ROLLBACK') {
        const nextState = parseDevToolsState(msg.state);
        applyExternalState(nextState);
        if (browserDevTools) {
          const rawSnapshot = readSnapshot();
          const sanitized = buildSerializedState(rawSnapshot);
          browserDevTools.send('@@INIT', sanitized);
        }
        return;
      }

      if (actionType === 'COMMIT') {
        if (browserDevTools) {
          const rawSnapshot = readSnapshot();
          const sanitized = buildSerializedState(rawSnapshot);
          browserDevTools.send('@@INIT', sanitized);
        }
        return;
      }

      if (actionType === 'IMPORT_STATE') {
        const lifted = msg.payload.nextLiftedState;
        const computedStates = lifted?.computedStates ?? [];
        const index = lifted?.currentStateIndex ?? computedStates.length - 1;
        const entry = computedStates[index];
        const nextState = parseDevToolsState(entry?.state);
        applyExternalState(nextState);
        if (browserDevTools) {
          const rawSnapshot = readSnapshot();
          const sanitized = buildSerializedState(rawSnapshot);
          browserDevTools.send('@@INIT', sanitized);
        }
      }
    };

    const initBrowserDevTools = (): void => {
      if (isConnected) return;
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
            send: (action: unknown, state: unknown) => void;
            subscribe?: (
              listener: (message: unknown) => void
            ) => void | (() => void);
            disconnect?: () => void;
            unsubscribe?: () => void;
          };
        };
        const connection = devToolsExt.connect({
          name: displayName,
          features: { dispatch: true, jump: true, skip: true },
        });
        browserDevToolsConnection = connection;
        browserDevTools = {
          send: connection.send,
          subscribe: connection.subscribe,
        };
        if (browserDevTools.subscribe && !unsubscribeDevTools) {
          const maybeUnsubscribe = browserDevTools.subscribe(handleDevToolsMessage);
          if (typeof maybeUnsubscribe === 'function') {
            unsubscribeDevTools = maybeUnsubscribe;
          } else {
            unsubscribeDevTools = () => {
              // Some Redux DevTools implementations don't expose an unsubscribe;
              // overwrite handler by no-op as a best-effort fallback.
              browserDevTools?.subscribe?.(() => void 0);
            };
          }
        }

        const rawSnapshot = readSnapshot();
        const sanitized = buildSerializedState(rawSnapshot);
        browserDevTools.send('@@INIT', sanitized);
        lastSnapshot = rawSnapshot;
        isConnected = true;
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
      this: ISignalTree<T>,
      ...args: unknown[]
    ): T | void {
      if (args.length === 0) {
        return originalTreeCall() as T;
      }

      const startTime = performance.now();

      // Execute update
      let result: void;
      if (args.length === 1) {
        const arg = args[0];
        if (typeof arg === 'function') {
          result = originalTreeCall(arg as (current: T) => T) as void;
        } else {
          result = originalTreeCall(arg as T) as void;
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
        scheduleSend(undefined, {
          source: 'tree.update',
          duration,
        });
      }

      return result;
    } as unknown as ISignalTree<T>;

    // Copy properties from original tree using utility that handles non-enumerable properties
    Object.setPrototypeOf(enhancedTree, Object.getPrototypeOf(tree));
    copyTreeProperties(tree as object, enhancedTree as object);

    // Define new .with() method that passes enhancedTree (not the original tree)
    // to subsequent enhancers. This is critical for preserving the enhancer chain.
    Object.defineProperty(enhancedTree, 'with', {
      value: function <R>(enhancer: (tree: ISignalTree<T>) => R): R {
        if (typeof enhancer !== 'function') {
          throw new Error('Enhancer must be a function');
        }

        const enhancerName = enhancer.name || 'anonymousEnhancer';
        compositionChain.push(enhancerName);
        trackComposition([...compositionChain]);
        scheduleSend(
          buildAction('SignalTree/with', {
            enhancer: enhancerName,
            chain: [...compositionChain],
          }),
          { source: 'composition' }
        );

        return enhancer(enhancedTree as ISignalTree<T>) as R;
      },
      writable: false,
      enumerable: false,
      configurable: true,
    });

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

      trackComposition,

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
        if (!browserDevTools || !isConnected) {
          initBrowserDevTools();
        }
        if (browserDevTools) {
          const rawSnapshot = readSnapshot();
          const sanitized = buildSerializedState(rawSnapshot);
          browserDevTools.send('@@INIT', sanitized);
          lastSnapshot = rawSnapshot;
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
        // Best-effort cleanup to avoid duplicate updates across recreated stores.
        try {
          unsubscribeDevTools?.();
        } catch {
          // ignore
        }
        try {
          browserDevToolsConnection?.unsubscribe?.();
        } catch {
          // ignore
        }
        try {
          browserDevToolsConnection?.disconnect?.();
        } catch {
          // ignore
        }

        browserDevTools = null;
        browserDevToolsConnection = null;
        isConnected = false;

        if (unsubscribeNotifier) {
          unsubscribeNotifier();
          unsubscribeNotifier = null;
        }
        if (unsubscribeFlush) {
          unsubscribeFlush();
          unsubscribeFlush = null;
        }
        unsubscribeDevTools = null;
        if (effectRef) {
          effectRef.destroy();
          effectRef = null;
        }
        if (sendTimer) {
          clearTimeout(sendTimer);
          sendTimer = null;
        }
        pendingPaths = [];
        sendScheduled = false;
        pendingAction = null;
        pendingExplicitAction = false;
        pendingSource = undefined;
        pendingDuration = undefined;
        lastSnapshot = undefined;
      },
    };

    // Attach __devTools for advanced usage
    (enhancedTree as unknown as Record<string, unknown>)['__devTools'] =
      devToolsInterface;

    // Auto-connect on enhancer application (docs expectation), and stream
    // notifications from PathNotifier flushes as DevTools actions.
    try {
      initBrowserDevTools();

      const notifier = getPathNotifier();
      unsubscribeNotifier = notifier.subscribe('**', (_value, _prev, path) => {
        if (!isPathAllowed(path)) return;
        pendingPaths.push(path);
      });

      unsubscribeFlush = notifier.onFlush(() => {
        if (!browserDevTools) {
          pendingPaths = [];
          return;
        }

        if (pendingPaths.length === 0) return;
        scheduleSend(undefined, { source: 'path-notifier' });
      });

      // Capture leaf signal updates (e.g. $.count.set()) by tracking the full
      // unwrapped state. This effect is the only way to observe direct signal
      // writes that bypass the callable tree wrapper.
      effectRef = angularEffect(() => {
        // Establish dependencies on all signals in the tree
        void originalTreeCall();

        // Skip the first run (INIT already sent)
        if (!effectPrimed) {
          effectPrimed = true;
          return;
        }

        scheduleSend(undefined, { source: 'signal' });
      });
    } catch {
      // Ignore devtools integration errors
    }

    return Object.assign(enhancedTree, methods) as unknown as ISignalTree<T> &
      DevToolsMethods;
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
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return devTools({ treeName, enabled: true });
}

/**
 * Full-featured devtools for intensive debugging
 */
export function fullDevTools(
  treeName = 'SignalTree'
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & DevToolsMethods {
  return devTools({
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
export function productionDevTools(): <T>(
  tree: ISignalTree<T>
) => ISignalTree<T> & DevToolsMethods {
  return devTools({
    enabled: true,
    enableBrowserDevTools: false,
    enableLogging: false,
    performanceThreshold: 50,
  });
}

/**
 * @deprecated Use `devTools()` as the primary enhancer. This legacy
 * `withDevTools` factory will be removed in a future major release.
 */
export const withDevTools = Object.assign(devTools, {
  production: productionDevTools,
  full: fullDevTools,
  enable: enableDevTools,
});
