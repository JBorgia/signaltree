import { Signal, signal } from '@angular/core';

import { copyTreeProperties } from '../utils/copy-tree-properties';
import { applyState, snapshotState } from '../../lib/utils';
import { getPathNotifier } from '../../lib/path-notifier';

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
  connectDevTools: () => void;
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

function createActivityTracker(options?: { enableConsole?: boolean }): ModuleActivityTracker {
  const modules = new Map<string, ModuleMetadata>();
  const enableConsole = options?.enableConsole === true;

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
      if (enableConsole) {
        console.error(
          `❌ [${module}] Error${context ? ` in ${context}` : ''}:`,
          error
        );
      }
    },

    getModuleActivity: (module: string) => modules.get(module),

    getAllModules: () => Array.from(modules.values()),
  };
}

function createCompositionLogger(options?: { enableConsole?: boolean }): CompositionLogger {
  const logs: Array<{
    timestamp: Date;
    module: string;
    type: 'composition' | 'method' | 'state' | 'performance';
    data: unknown;
  }> = [];

  const enableConsole = options?.enableConsole === true;

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
      if (enableConsole) {
        console.log(`🔗 Composition ${action}:`, modules.join(' → '));
      }
    },

    logMethodExecution: (
      module: string,
      method: string,
      args: unknown[],
      result: unknown
    ) => {
      addLog(module, 'method', { method, args, result });
      if (enableConsole) {
        console.debug(`🔧 [${module}] ${method}`, { args, result });
      }
    },

    logStateChange: (
      module: string,
      path: string,
      oldValue: unknown,
      newValue: unknown
    ) => {
      addLog(module, 'state', { path, oldValue, newValue });
      if (enableConsole) {
        console.debug(`📝 [${module}] State change at ${path}:`, {
          from: oldValue,
          to: newValue,
        });
      }
    },

    logPerformanceWarning: (
      module: string,
      operation: string,
      duration: number,
      threshold: number
    ) => {
      addLog(module, 'performance', { operation, duration, threshold });
      if (enableConsole) {
        console.warn(
          `⚠️ [${module}] Slow ${operation}: ${duration.toFixed(
            2
          )}ms (threshold: ${threshold}ms)`
        );
      }
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

function parseDevToolsState(state: unknown): unknown {
  if (typeof state === 'string') {
    try {
      return JSON.parse(state);
    } catch {
      return undefined;
    }
  }
  return state;
}

function buildDevToolsAction(
  type: string,
  payload?: unknown,
  meta?: DevToolsActionMeta
): DevToolsAction {
  return {
    type,
    ...(payload !== undefined && { payload }),
    ...(meta && { meta: meta }),
  };
}

const GLOBAL_GROUPS_KEY = '__SIGNALTREE_DEVTOOLS_GROUPS__';
const GLOBAL_MARKER_KEY = '__SIGNALTREE_DEVTOOLS_GLOBAL_MARKER__';

function getRegistryHost(): any {
  return typeof window !== 'undefined' ? window : globalThis;
}

function ensureGlobalMarker(): string {
  const host = getRegistryHost();
  if (!host[GLOBAL_MARKER_KEY]) {
    host[GLOBAL_MARKER_KEY] = `marker_${Math.random().toString(36).slice(2)}`;
  }
  return host[GLOBAL_MARKER_KEY];
}

interface DevToolsGroup {
  registerTree: (
    treeKey: string,
    tree: {
      readSnapshot: () => unknown;
      buildSerializedState: (state: unknown) => unknown;
      applyExternalState: (state: unknown) => void;
      formatPathFn: (path: string) => string;
      isPathAllowed: (path: string) => boolean;
      enableTimeTravel: boolean;
      maxDepth: number;
      maxArrayLength: number;
      maxStringLength: number;
      sendRateLimitMs: number;
    }
  ) => () => void;
  enqueue: (
    treeKey: string,
    pendingPaths: string[],
    action?: DevToolsAction,
    meta?: DevToolsActionMeta
  ) => void;
  connect: () => void;
}

function getGlobalDevToolsGroups(): Map<string, DevToolsGroup> {
  const host = getRegistryHost();
  if (!host[GLOBAL_GROUPS_KEY]) {
    host[GLOBAL_GROUPS_KEY] = new Map();
  }
  return host[GLOBAL_GROUPS_KEY];
}

const devToolsGroups = getGlobalDevToolsGroups();

const GLOBAL_CONNECTIONS_KEY = '__SIGNALTREE_DEVTOOLS_CONNECTIONS__';

interface DevToolsConnectionEntry {
  status: 'connecting' | 'connected';
  connection: any;
  tools: any;
  subscribed: boolean;
  unsubscribe: (() => void) | null;
  waiters: Set<(entry: DevToolsConnectionEntry) => void>;
}

function getGlobalDevToolsConnections(): Map<string, DevToolsConnectionEntry> {
  const host = getRegistryHost();
  ensureGlobalMarker();
  if (!host[GLOBAL_CONNECTIONS_KEY]) {
    host[GLOBAL_CONNECTIONS_KEY] = new Map();
  }
  return host[GLOBAL_CONNECTIONS_KEY];
}

const devToolsConnections = getGlobalDevToolsConnections();

function getOrCreateDevToolsGroup(
  groupId: string,
  displayName: string
): DevToolsGroup {
  if (devToolsGroups.has(groupId)) {
    return devToolsGroups.get(groupId)!;
  }

  const trees = new Map<
    string,
    {
      readSnapshot: () => unknown;
      buildSerializedState: (state: unknown) => unknown;
      applyExternalState: (state: unknown) => void;
      formatPathFn: (path: string) => string;
      isPathAllowed: (path: string) => boolean;
      enableTimeTravel: boolean;
      maxDepth: number;
      maxArrayLength: number;
      maxStringLength: number;
      sendRateLimitMs: number;
    }
  >();
  const lastSnapshots = new Map<string, unknown>();
  const lastSerialized = new Map<string, unknown>();
  const pendingPathsByTree = new Map<string, string[]>();

  let browserDevToolsConnection: any = null;
  let browserDevTools: any = null;
  let devToolsExtension: any = null;
  let unsubscribeDevTools: (() => void) | null = null;
  let isConnected = false;
  let isApplyingExternalState = false;

  let sendScheduled = false;
  let sendTimer: any = null;
  let lastSendAt = 0;
  let sendRateLimitMs = 0;

  let pendingAction: DevToolsAction | null = null;
  let pendingExplicitAction = false;
  let pendingSource: string | undefined;
  let pendingDuration: number | undefined;

  const sendAggregated = (actionType: string, payload: unknown) => {
    if (!browserDevTools) return;
    const aggregated = buildAggregatedState();
    browserDevTools.send(buildDevToolsAction(actionType, payload), aggregated);
  };

  const sendEmptyState = () => {
    try {
      sendAggregated('SignalTree/empty', {
        groupId,
      });
    } catch {
      // ignore
    }
    pendingPathsByTree.clear();
    lastSnapshots.clear();
    lastSerialized.clear();
  };


  const updateRateLimit = () => {
    sendRateLimitMs = 0;
    for (const tree of trees.values()) {
      if (typeof tree.sendRateLimitMs === 'number') {
        sendRateLimitMs = Math.max(sendRateLimitMs, tree.sendRateLimitMs);
      }
    }
  };

  const buildAggregatedState = () => {
    const aggregated: Record<string, unknown> = {};
    for (const [treeKey, tree] of trees) {
      const snapshot = tree.readSnapshot();
      const lastSnapshot = lastSnapshots.get(treeKey);
      
      let serialized: unknown;
      if (lastSnapshot === snapshot && lastSerialized.has(treeKey)) {
        serialized = lastSerialized.get(treeKey);
      } else {
        lastSnapshots.set(treeKey, snapshot);
        serialized = tree.buildSerializedState(snapshot);
        lastSerialized.set(treeKey, serialized);
      }
      
      aggregated[treeKey] = serialized;
    }
    return aggregated;
  };

  const sendInit = () => {
    if (!browserDevTools) return;
    const aggregated = buildAggregatedState();
    browserDevTools.send('@@INIT', aggregated);
  };

  const applyExternalState = (state: any) => {
    if (state === undefined || state === null) return;
    isApplyingExternalState = true;
    try {
      for (const [treeKey, tree] of trees) {
        if (!tree.enableTimeTravel) continue;
        const treeState = state?.[treeKey];
        if (treeState !== undefined) {
          tree.applyExternalState(treeState);
        }
      }
    } finally {
      isApplyingExternalState = false;
      for (const treeKey of trees.keys()) {
        lastSnapshots.delete(treeKey);
        pendingPathsByTree.delete(treeKey);
      }
    }
  };

  const handleDevToolsMessage = (message: any) => {
    if (!message || typeof message !== 'object') return;
    const msg = message as {
      type?: unknown;
      payload?: { type?: unknown; nextLiftedState?: unknown };
      state?: unknown;
    };

    const messageType = typeof msg.type === 'string' ? msg.type : undefined;

    // Redux DevTools sends { type: 'START' } when the panel is (re)opened.
    // Re-send current state so the instance becomes visible in the panel.
    if (messageType === 'START') {
      if (browserDevTools && trees.size > 0) {
        const elapsed = Date.now() - lastSendAt;
        if (elapsed < 500) return;
        const aggregated = buildAggregatedState();
        browserDevTools.send({ type: 'SignalTree/reconnect' }, aggregated);
        lastSendAt = Date.now();
      }
      return;
    }

    const anyTimeTravelEnabled = Array.from(trees.values()).some(
      (t) => t.enableTimeTravel
    );
    if (!anyTimeTravelEnabled) return;

    if (messageType !== 'DISPATCH') return;

    const actionType =
      msg.payload && typeof msg.payload.type === 'string'
        ? msg.payload.type
        : undefined;
    if (!actionType) return;

    if (actionType === 'JUMP_TO_STATE' || actionType === 'JUMP_TO_ACTION') {
      const nextState = parseDevToolsState(msg.state);
      applyExternalState(nextState);
      return;
    }

    if (actionType === 'ROLLBACK') {
      const nextState = parseDevToolsState(msg.state);
      applyExternalState(nextState);
      sendInit();
      return;
    }

    if (actionType === 'COMMIT') {
      sendInit();
      return;
    }

    if (actionType === 'IMPORT_STATE') {
      const lifted = msg.payload?.nextLiftedState as any;
      const computedStates = Array.isArray(lifted?.computedStates)
        ? lifted.computedStates
        : [];
      const indexRaw =
        typeof lifted?.currentStateIndex === 'number'
          ? lifted.currentStateIndex
          : computedStates.length - 1;
      const index = Math.max(0, Math.min(indexRaw, computedStates.length - 1));
      const entry = computedStates[index] as any;
      const nextState = parseDevToolsState(entry?.state);
      applyExternalState(nextState);
      sendInit();
    }
  };

  const initBrowserDevTools = () => {

    if (isConnected) return;

    if (
      typeof window === 'undefined' ||
      !('__REDUX_DEVTOOLS_EXTENSION__' in window)
    ) {
      return;
    }

    const waiters = new Set<(entry: DevToolsConnectionEntry) => void>();
    devToolsConnections.set(groupId, {
      status: 'connecting',
      connection: null,
      tools: null,
      subscribed: false,
      unsubscribe: null,
      waiters,
    });

    try {
      const devToolsExt = (window as any)['__REDUX_DEVTOOLS_EXTENSION__'];
      devToolsExtension = devToolsExt;
      const connection = devToolsExt.connect({
        name: displayName,
        instanceId: groupId,
        features: {
          dispatch: true,
          jump: true,
          skip: true,
        },
      });

      browserDevToolsConnection = connection;
      browserDevTools = {
        send: connection.send,
        subscribe: connection.subscribe,
      };

      if (browserDevTools.subscribe && !unsubscribeDevTools) {
        const maybeUnsubscribe = browserDevTools.subscribe(
          handleDevToolsMessage
        );
        if (typeof maybeUnsubscribe === 'function') {
          unsubscribeDevTools = maybeUnsubscribe;
        } else {
          unsubscribeDevTools = () => {
            browserDevTools?.subscribe?.(() => void 0);
          };
        }
      }

      const connEntry = devToolsConnections.get(groupId);
      if (connEntry) {
        connEntry.status = 'connected';
        connEntry.connection = browserDevToolsConnection;
        connEntry.tools = browserDevTools;
        connEntry.subscribed = !!browserDevTools?.subscribe;
        connEntry.unsubscribe = unsubscribeDevTools;
        for (const waiter of connEntry.waiters) {
          try {
            waiter(connEntry);
          } catch {
            // ignore
          }
        }
        connEntry.waiters.clear();
      }

      sendInit();
      isConnected = true;
    } catch (e: any) {
      devToolsConnections.delete(groupId);
      console.warn('[SignalTree] Failed to connect to Redux DevTools:', e);
    }
  };

  const flushSend = () => {
    sendScheduled = false;
    if (!browserDevTools || isApplyingExternalState) return;

    const aggregatedState: Record<string, unknown> = {};
    const allFormattedPaths: string[] = [];

    for (const [treeKey, tree] of trees) {
      const currentSnapshot = tree.readSnapshot();
      lastSnapshots.set(treeKey, currentSnapshot);
      const serialized = tree.buildSerializedState(currentSnapshot);
      lastSerialized.set(treeKey, serialized);
      aggregatedState[treeKey] = serialized;

      // Aggregated mode is driven by PathNotifier flushes (and explicit meta
      // events like `tree.update`). Avoid deep diffing entire trees here.
      const pendingRaw = pendingPathsByTree.get(treeKey) ?? [];
      const allowedRaw = pendingRaw.filter((p) => p && tree.isPathAllowed(p));
      if (allowedRaw.length > 0) {
        const formatted = Array.from(new Set(allowedRaw)).map((path) =>
          tree.formatPathFn(`${treeKey}.${path}`)
        );
        allFormattedPaths.push(...formatted);
      }
    }

    const hasMeta = pendingSource !== undefined || pendingDuration !== undefined;
    if (allFormattedPaths.length === 0 && !pendingExplicitAction && !hasMeta) {
      pendingAction = null;
      pendingExplicitAction = false;
      pendingSource = undefined;
      pendingDuration = undefined;
      pendingPathsByTree.clear();
      lastSendAt = Date.now();
      return;
    }

    const effectiveAction =
      pendingExplicitAction && pendingAction
        ? pendingAction
        : allFormattedPaths.length === 1
          ? buildDevToolsAction(
            `SignalTree/${allFormattedPaths[0]}`,
            allFormattedPaths[0]
          )
          : allFormattedPaths.length > 1
            ? buildDevToolsAction('SignalTree/update', allFormattedPaths)
            : buildDevToolsAction('SignalTree/update');

    const actionMeta: DevToolsActionMeta = {
      timestamp: Date.now(),
      ...(pendingSource && { source: pendingSource }),
      ...(pendingDuration !== undefined && {
        duration: pendingDuration,
        slow: pendingDuration > 16,
      }),
      ...(allFormattedPaths.length > 0 && { paths: allFormattedPaths }),
    };

    const actionToSend = buildDevToolsAction(
      effectiveAction?.type ?? 'SignalTree/update',
      effectiveAction?.payload,
      actionMeta
    );

    try {
      browserDevTools.send(actionToSend, aggregatedState);
    } catch {
      // ignore
    } finally {
      pendingAction = null;
      pendingExplicitAction = false;
      pendingSource = undefined;
      pendingDuration = undefined;
      pendingPathsByTree.clear();
      lastSendAt = Date.now();
    }
  };

  const scheduleSend = (action?: DevToolsAction, meta?: DevToolsActionMeta) => {
    if (isApplyingExternalState) return;

    if (action !== undefined) {
      if (!pendingExplicitAction && pendingAction == null) {
        pendingAction = action;
        pendingExplicitAction = true;
      } else {
        // If an explicit action was already pending, we might have merged/clobbered.
        // For simplicity, we reset to avoid confusing action chains.
        pendingAction = null;
        pendingExplicitAction = false;
      }
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

  const registerTree = (
    treeKey: string,
    tree: {
      readSnapshot: () => unknown;
      buildSerializedState: (state: unknown) => unknown;
      applyExternalState: (state: unknown) => void;
      formatPathFn: (path: string) => string;
      isPathAllowed: (path: string) => boolean;
      enableTimeTravel: boolean;
      maxDepth: number;
      maxArrayLength: number;
      maxStringLength: number;
      sendRateLimitMs: number;
    }
  ) => {
    const wasConnected = isConnected;
    trees.set(treeKey, tree);
    updateRateLimit();
    initBrowserDevTools();

    if (browserDevTools) {
      const snapshot = tree.readSnapshot();
      lastSnapshots.set(treeKey, snapshot);
      lastSerialized.set(treeKey, tree.buildSerializedState(snapshot));
      if (trees.size === 1 && !wasConnected) {
        sendInit();
      } else {
        sendAggregated('SignalTree/register', { treeKey });
      }
    }

    return () => {
      trees.delete(treeKey);
      pendingPathsByTree.delete(treeKey);
      lastSnapshots.delete(treeKey);
      lastSerialized.delete(treeKey);
      updateRateLimit();

      if (trees.size === 0) {
        // Last tree removed: reset DevTools instance and clean up globals.
        sendEmptyState();
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

        unsubscribeDevTools = null;
        browserDevToolsConnection = null;
        browserDevTools = null;
        devToolsExtension = null;
        isConnected = false;

        devToolsConnections.delete(groupId);
        devToolsGroups.delete(groupId);
        return;
      }

      if (browserDevTools) {
        sendAggregated('SignalTree/unregister', { treeKey });
      }
    };
  };

  const enqueue = (
    treeKey: string,
    pendingPaths: string[],
    action?: DevToolsAction,
    meta?: DevToolsActionMeta
  ) => {
    if (pendingPaths && pendingPaths.length > 0) {
      const existing = pendingPathsByTree.get(treeKey) ?? [];
      pendingPathsByTree.set(treeKey, [...existing, ...pendingPaths]);
    }
    scheduleSend(action, meta);
  };

  const group: DevToolsGroup = {
    registerTree,
    enqueue,
    connect() {
      initBrowserDevTools();
    },
  };

  devToolsGroups.set(groupId, group);
  return group;
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
    enableLogging = false,
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
    aggregatedReduxInstance,
  } = config;

  const displayName = name ?? treeName;
  const groupId = aggregatedReduxInstance?.id ?? displayName;
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
    const activityTracker = createActivityTracker({ enableConsole: enableLogging });
    const logger = enableLogging
      ? createCompositionLogger({ enableConsole: true })
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
    let devToolsExtension: any = null;
    let isConnected = false;
    let isApplyingExternalState = false;
    let unsubscribeDevTools: (() => void) | null = null;

    // PathNotifier subscriptions (batched mutation streaming)
    let pendingPaths: string[] = [];

    // Effect + send scheduling for leaf-signal updates
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

    let lastSerializedJson: string | undefined;

    const flushSend = (): void => {
      sendScheduled = false;
      if (!browserDevTools || isApplyingExternalState) return;

      const rawSnapshot = readSnapshot();
      const currentSnapshot = rawSnapshot ?? {};
      const sanitized = buildSerializedState(currentSnapshot);

      // Compare serialized JSON to detect actual state changes.
      // snapshotState()/unwrap() always creates new object references, so
      // reference-based comparisons (computeChangedPaths) produce false positives.
      // JSON comparison is stable and correctly detects no-change scenarios.
      let currentSerializedJson: string;
      try {
        currentSerializedJson = JSON.stringify(sanitized);
      } catch {
        currentSerializedJson = '';
      }

      const stateActuallyChanged =
        lastSerializedJson === undefined ||
        currentSerializedJson !== lastSerializedJson;

      const pendingAllowedPaths = pendingPaths.filter(
        (path) => path && isPathAllowed(path)
      );

      if (
        !stateActuallyChanged &&
        !pendingExplicitAction &&
        pendingAllowedPaths.length === 0
      ) {
        pendingAction = null;
        pendingExplicitAction = false;
        pendingSource = undefined;
        pendingDuration = undefined;
        pendingPaths = [];
        lastSnapshot = currentSnapshot;
        lastSerializedJson = currentSerializedJson;
        return;
      }

      // Compute changed paths for action naming (best-effort).
      // If PathNotifier already provided hints, avoid deep diffing the whole tree.
      const rawPathsForNaming =
        pendingAllowedPaths.length > 0
          ? Array.from(new Set(pendingAllowedPaths))
          : lastSnapshot === undefined
            ? []
            : computeChangedPaths(
                lastSnapshot,
                currentSnapshot,
                maxDepth,
                maxArrayLength
              ).filter((path) => path && isPathAllowed(path));

      const formattedPaths = rawPathsForNaming.map((path) => formatPathFn(path));

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
        lastSerializedJson = currentSerializedJson;
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

    const sendInit = (): void => {
      if (!browserDevTools) return;
      const rawSnapshot = readSnapshot() ?? {};
      const serialized = buildSerializedState(rawSnapshot);
      browserDevTools.send('@@INIT', serialized);
      lastSnapshot = rawSnapshot;
      try {
        lastSerializedJson = JSON.stringify(serialized);
      } catch {
        lastSerializedJson = undefined;
      }
      lastSendAt = Date.now();

      // Clear pending state as it's now part of the init snapshot
      pendingPaths = [];
      pendingAction = null;
      pendingExplicitAction = false;
      pendingSource = undefined;
      pendingDuration = undefined;
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
      if (!message || typeof message !== 'object') return;

      const msg = message as {
        type?: unknown;
        payload?: { type?: unknown; nextLiftedState?: unknown };
        state?: unknown;
      };

      const messageType = typeof msg.type === 'string' ? msg.type : undefined;

      // Redux DevTools sends { type: 'START' } when the panel is (re)opened.
      // Re-send current state so the instance becomes visible in the panel.
      if (messageType === 'START') {
        if (lastSnapshot === undefined) {
          // First time: send @@INIT to establish the instance
          sendInit();
        } else if (browserDevTools) {
          // Already initialized: re-send current state. Skip if we sent
          // recently (avoids spurious reconnect when another instance
          // connects/disconnects causing START to be broadcast).
          const elapsed = Date.now() - lastSendAt;
          if (elapsed < 500) return;

          const rawSnapshot = readSnapshot() ?? {};
          const serialized = buildSerializedState(rawSnapshot);
          browserDevTools.send({ type: 'SignalTree/reconnect' }, serialized);
          lastSnapshot = rawSnapshot;
          try {
            lastSerializedJson = JSON.stringify(serialized);
          } catch {
            lastSerializedJson = undefined;
          }
          lastSendAt = Date.now();
        }
        return;
      }

      if (!enableTimeTravel) return;

      if (messageType !== 'DISPATCH') return;

      const actionType =
        msg.payload && typeof msg.payload.type === 'string'
          ? msg.payload.type
          : undefined;
      if (!actionType) return;
      if (actionType === 'JUMP_TO_STATE' || actionType === 'JUMP_TO_ACTION') {
        const nextState = parseDevToolsState(msg.state);
        applyExternalState(nextState);
        return;
      }

      if (actionType === 'ROLLBACK') {
        const nextState = parseDevToolsState(msg.state);
        applyExternalState(nextState);
        sendInit();
        return;
      }

      if (actionType === 'COMMIT') {
        sendInit();
        return;
      }

      if (actionType === 'IMPORT_STATE') {
        const lifted = msg.payload?.nextLiftedState as any;
        const computedStates = Array.isArray(lifted?.computedStates)
          ? lifted.computedStates
          : [];
        const indexRaw =
          typeof lifted?.currentStateIndex === 'number'
            ? lifted.currentStateIndex
            : computedStates.length - 1;
        const index = Math.max(0, Math.min(indexRaw, computedStates.length - 1));
        const entry = computedStates[index] as any;
        const nextState = parseDevToolsState(entry?.state);
        applyExternalState(nextState);
        sendInit();
      }
    };

    // For aggregated mode: holds the unregister function returned by group.registerTree()
    let groupUnregister: (() => void) | null = null;

    const initBrowserDevTools = (): void => {
      if (aggregatedReduxInstance) {
        const group = getOrCreateDevToolsGroup(
          aggregatedReduxInstance.id,
          aggregatedReduxInstance.name ?? displayName
        );
        if (!groupUnregister) {
          groupUnregister = group.registerTree(treeName, {
            readSnapshot,
            buildSerializedState,
            applyExternalState,
            formatPathFn,
            isPathAllowed,
            enableTimeTravel,
            maxDepth,
            maxArrayLength,
            maxStringLength,
            sendRateLimitMs,
          });
        }
        return;
      }

      if (isConnected) return;
      if (
        !enableBrowserDevTools ||
        typeof window === 'undefined' ||
        !('__REDUX_DEVTOOLS_EXTENSION__' in window)
      ) {
        return;
      }

      const waiters = new Set<(entry: DevToolsConnectionEntry) => void>();
      devToolsConnections.set(groupId, {
        status: 'connecting',
        connection: null,
        tools: null,
        subscribed: false,
        unsubscribe: null,
        waiters,
      });

      try {
        const devToolsExt = (window as any)['__REDUX_DEVTOOLS_EXTENSION__'] as {
          connect: (config: Record<string, unknown>) => {
            send: (action: unknown, state: unknown) => void;
            subscribe?: (
              listener: (message: unknown) => void
            ) => void | (() => void);
            disconnect?: () => void;
            unsubscribe?: () => void;
          };
        };
        devToolsExtension = devToolsExt;
        const connection = devToolsExt.connect({
          name: displayName,
          instanceId: groupId,
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

        const connEntry = devToolsConnections.get(groupId);
        if (connEntry) {
          connEntry.status = 'connected';
          connEntry.connection = browserDevToolsConnection;
          connEntry.tools = browserDevTools;
          connEntry.subscribed = !!browserDevTools?.subscribe;
          connEntry.unsubscribe = unsubscribeDevTools;
          for (const waiter of connEntry.waiters) {
            try {
              waiter(connEntry);
            } catch {
              // ignore
            }
          }
          connEntry.waiters.clear();
        }

        sendInit();
        isConnected = true;
        if (enableLogging) {
          console.log(`🔗 Connected to Redux DevTools as "${displayName}"`);
        }
      } catch (e) {
        devToolsConnections.delete(groupId);
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
      originalTreeCall();

      metrics.trackModuleUpdate('core', duration);

      if (duration > performanceThreshold) {
        logger.logPerformanceWarning(
          'core',
          'update',
          duration,
          performanceThreshold
        );
      }

      if (aggregatedReduxInstance) {
        const group = devToolsGroups.get(aggregatedReduxInstance.id);
        if (group) {
          group.enqueue(treeName, [], undefined, {
            timestamp: Date.now(),
            source: 'tree.update',
            duration,
          });
        }
      } else if (browserDevTools) {
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
          metrics.trackModuleUpdate(profile.module, duration);
          activeProfiles.delete(profileId);
        }
      },
      connectDevTools: () => {
        initBrowserDevTools();
      },
      exportDebugSession: () => {
        return {
          metrics: metrics.signal(),
          modules: activityTracker.getAllModules(),
          logs: logger.exportLogs(),
          compositionHistory,
        };
      },
    };

    // PathNotifier is a global singleton, so in aggregated mode we try to
    // filter out events from other trees. In standalone mode we preserve the
    // historical behavior: accept all paths (ownership is ambiguous).
    const shouldFilterByOwnership = Boolean(aggregatedReduxInstance);
    const treeTopKeys = new Set<string>();
    const refreshTreeTopKeys = (): void => {
      treeTopKeys.clear();
      try {
        if ('$' in tree) {
          for (const key of Object.keys(tree.$ as Record<string, unknown>)) {
            treeTopKeys.add(key);
          }
        }
      } catch {
        // ignore
      }
    };

    // Always populate keys so we can intercept leaf signals. Ownership
    // filtering is only applied in aggregated mode.
    refreshTreeTopKeys();

    const isPathOwnedByTree = (path: string): boolean => {
      if (!shouldFilterByOwnership) return true;
      if (treeTopKeys.size === 0) return true;
      const root = path.split('.')[0];
      if (treeTopKeys.has(root)) return true;

      // If new keys were added after initialization, refresh once.
      refreshTreeTopKeys();
      return treeTopKeys.has(root);
    };

    // Intercept plain signal .set()/.update() on tree.$ to emit PathNotifier
    // notifications. Entity collections already notify via their own internals,
    // but plain Angular signals (counter, flags, etc.) do not.
    const notifier = getPathNotifier();
    const restoreInterceptors: Array<() => void> = [];
    try {
      if ('$' in tree) {
        const treeNode = tree.$ as Record<string, unknown>;
        for (const key of treeTopKeys) {
          const sig = treeNode[key];
          // Only wrap plain writable signals (functions with .set and .update)
          // Skip entity collections (which have .add, .remove, etc. and already
          // notify PathNotifier internally)
          if (
            typeof sig === 'function' &&
            'set' in sig &&
            'update' in sig &&
            typeof (sig as any).set === 'function' &&
            typeof (sig as any).update === 'function' &&
            !('add' in sig) &&
            !('remove' in sig)
          ) {
            const original = sig as any;
            const originalSet = original.set.bind(original);
            const originalUpdate = original.update.bind(original);

            restoreInterceptors.push(() => {
              original.set = originalSet;
              original.update = originalUpdate;
            });

            original.set = (value: unknown) => {
              const prev = original();
              originalSet(value);
              const next = original();
              if (next !== prev) {
                notifier.notify(key, next, prev);
              }
            };

            original.update = (updater: (v: unknown) => unknown) => {
              const prev = original();
              originalUpdate(updater);
              const next = original();
              if (next !== prev) {
                notifier.notify(key, next, prev);
              }
            };
          }
        }
      }
    } catch {
      // Ignore errors during signal interception
    }

    // PathNotifier subscription: collect path hints for action naming.
    let unsubscribePathNotifier: (() => void) | null = null;
    let unsubscribePathFlush: (() => void) | null = null;

    unsubscribePathNotifier = notifier.subscribe('**', (_value, _prev, path) => {
      if (isApplyingExternalState) return;
      if (!isPathOwnedByTree(path)) return;
      if (!isPathAllowed(path)) return;
      pendingPaths.push(path);
    });

    // PathNotifier flush handler. For aggregated mode this triggers group sends.
    // For standalone mode this is a fallback when Angular effect() is unavailable
    // (e.g. tree created outside injection context). When effect() IS available,
    // flushSend's no-change guard prevents duplicate sends.
    unsubscribePathFlush = notifier.onFlush(() => {
      if (isApplyingExternalState) return;
      if (pendingPaths.length === 0) return;

      if (aggregatedReduxInstance) {
        const group = devToolsGroups.get(aggregatedReduxInstance.id);
        if (group) {
          group.enqueue(treeName, pendingPaths, undefined, {
            timestamp: Date.now(),
            source: 'path-notifier',
          });
          pendingPaths = [];
        }
      } else {
        if (!browserDevTools) {
          pendingPaths = [];
          return;
        }
        scheduleSend(undefined, { source: 'path-notifier' });
      }
    });

    // Capture leaf signal updates (e.g. $.count.set()) by tracking the full
    // unwrapped state via Angular effect(). This is the primary mechanism for
    // standalone mode — it observes direct signal writes and triggers sends.
    // pendingPaths collected above are consumed by flushSend for action naming.
    // PathNotifier flush is the sole mechanism for detecting leaf-level changes
    // and triggering sends to Redux DevTools (both standalone and aggregated).
    // Angular effect() was removed because:
    // 1. tree.$  may contain computed signals (entity collections) that produce
    //    new object references on every read, causing infinite effect re-runs.
    // 2. originalTreeCall() does not reliably create signal dependencies when
    //    the tree is wrapped by enhancers like batching().
    // 3. PathNotifier reliably captures all mutations via the signalTree internals.

    // Always return the enhanced tree with DevTools methods (only those required by DevToolsMethods)
    const result = Object.assign(enhancedTree, {
      __devTools: devToolsInterface,
      connectDevTools: devToolsInterface.connectDevTools,
      exportDebugSession: devToolsInterface.exportDebugSession,
      disconnectDevTools: () => {
        // Unsubscribe from PathNotifier
        if (unsubscribePathNotifier) {
          unsubscribePathNotifier();
          unsubscribePathNotifier = null;
        }
        if (unsubscribePathFlush) {
          unsubscribePathFlush();
          unsubscribePathFlush = null;
        }

        // Restore any intercepted signal methods
        for (const restore of restoreInterceptors) {
          try {
            restore();
          } catch {
            // ignore
          }
        }

        if (aggregatedReduxInstance) {
          // Unregister from the shared group
          if (groupUnregister) {
            groupUnregister();
            groupUnregister = null;
          }
        } else {
          // Standalone: reset devtools to empty state, clearing action history.
          // connection.init() sends an INIT message which resets the lifted state
          // to a single @@INIT action with the provided (empty) state.
          if (browserDevToolsConnection) {
            try {
              (browserDevToolsConnection as any).init({});
            } catch {
              // ignore
            }
          }
          try { unsubscribeDevTools?.(); } catch { /* ignore */ }
          try { browserDevToolsConnection?.unsubscribe?.(); } catch { /* ignore */ }
          try { browserDevToolsConnection?.disconnect?.(); } catch { /* ignore */ }
          browserDevToolsConnection = null;
          browserDevTools = null;
          devToolsExtension = null;
          isConnected = false;
          unsubscribeDevTools = null;
          devToolsConnections.delete(groupId);
        }

        // Reset pending state
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
        lastSerializedJson = undefined;
      },
    }) as ISignalTree<T> & DevToolsMethods;

    // Auto-connect to DevTools on creation
    if (enableBrowserDevTools) {
      initBrowserDevTools();
    }

    return result;
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
