import { getPathNotifier } from '@signaltree/core';
import { deepEqual } from '@signaltree/shared';

/**
 * SignalTree Guardrails Enhancer v1.1
 * Development-only performance monitoring and anti-pattern detection
 * @packageDocumentation
 */
import type { SignalTreeBase as SignalTree, Enhancer } from '@signaltree/core';
import type {
  GuardrailsConfig,
  GuardrailsAPI,
  GuardrailsReport,
  RuntimeStats,
  GuardrailIssue,
  HotPath,
  UpdateMetadata,
  RuleContext,
  BudgetStatus,
  BudgetItem,
  GuardrailRule,
} from './types';

// Dev environment detection
declare const __DEV__: boolean | undefined;
declare const ngDevMode: boolean | undefined;
declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

type EnabledOption = boolean | (() => boolean);

function isFunction<T extends (...args: never[]) => unknown>(
  value: unknown
): value is T {
  return typeof value === 'function';
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveEnabledFlag(option?: EnabledOption): boolean {
  if (option === undefined) {
    return true;
  }
  if (isFunction<() => boolean>(option)) {
    try {
      return option();
    } catch {
      return true;
    }
  }
  return option;
}

function tryStructuredClone<T>(value: T): T {
  const cloneFn = (
    globalThis as typeof globalThis & {
      structuredClone?: <U>(input: U) => U;
    }
  ).structuredClone;

  if (isFunction(cloneFn)) {
    try {
      return cloneFn(value);
    } catch {
      // Fall through to return original value.
    }
  }

  try {
    // Fallback to JSON-based deep clone for plain objects.
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // As a last resort, return the original reference.
    return value;
  }
}

function isDevEnvironment(): boolean {
  if (__DEV__ !== undefined) return __DEV__;
  if (process?.env?.['NODE_ENV'] === 'production') return false;
  if (ngDevMode != null) return Boolean(ngDevMode);
  return true;
}

interface UpdateDetail {
  path: string;
  segments: string[];
  newValue: unknown;
  oldValue: unknown;
}

interface PendingUpdate {
  action: string;
  startTime: number;
  metadata?: UpdateMetadata;
  details: UpdateDetail[];
}

interface GuardrailsContext<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  tree: SignalTree<T>;
  config: GuardrailsConfig<T>;
  stats: RuntimeStats;
  issues: GuardrailIssue[];
  hotPaths: HotPath[];
  currentUpdate: PendingUpdate | null;
  suppressed: boolean;
  timings: number[];
  hotPathData: Map<
    string,
    { count: number; lastUpdate: number; durations: number[] }
  >;
  issueMap: Map<string, GuardrailIssue>;
  signalUsage: Map<string, { updates: number; lastSeen: number }>;
  pathRecomputations: Map<string, number>;
  memoryHistory: Array<{ timestamp: number; count: number }>;
  recomputationLog: number[];
  pollingIntervalId?: ReturnType<typeof setInterval>;
  previousState?: T;
  disposed: boolean;
}

const MAX_TIMING_SAMPLES = 1000;
const RECOMPUTATION_WINDOW_MS = 1000;
const POLLING_INTERVAL_MS = 50; // Fast polling for dev-time monitoring

/**
 * Creates a guardrails enhancer for dev-only monitoring
 * Uses reactive subscription when in Angular context (zero polling),
 * falls back to polling-based detection in non-Angular environments (tests)
 */
export function withGuardrails(
  config: GuardrailsConfig<any> = {}
): <S extends Record<string, unknown>>(
  tree: SignalTree<S>
) => SignalTree<S> & { __guardrails?: GuardrailsAPI } {
  return function <S extends Record<string, unknown>>(
    tree: SignalTree<S>
  ): SignalTree<S> & { __guardrails?: GuardrailsAPI } {
    const enabled = resolveEnabledFlag(config.enabled);
    if (!isDevEnvironment() || !enabled) {
      return tree as SignalTree<S> & { __guardrails?: GuardrailsAPI };
    }

    const stats = createRuntimeStats();
    const context = {
      tree,
      config: config as GuardrailsConfig<S>,
      stats,
      issues: [],
      hotPaths: [],
      currentUpdate: null,
      suppressed: false,
      timings: [],
      hotPathData: new Map(),
      issueMap: new Map(),
      signalUsage: new Map(),
      pathRecomputations: new Map(),
      memoryHistory: [],
      recomputationLog: [],
      previousState: tryStructuredClone(tree()),
      disposed: false,
    } as GuardrailsContext<S>;
    // Wire up dev hooks for memoization recomputation tracking
    (tree as unknown as Record<string, unknown>)['__devHooks'] = {
      onRecompute: (path: string, count: number) => {
        if (!context.disposed && !context.suppressed) {
          recordRecomputations(path, context, count, Date.now());

          // Check budget violations
          const maxRecomputations = config.budgets?.maxRecomputations;

          if (
            maxRecomputations &&
            context.stats.recomputationCount > maxRecomputations
          ) {
            addIssue(context, {
              type: 'budget',
              severity: 'error',
              message: `Recomputation budget exceeded: ${context.stats.recomputationCount} > ${maxRecomputations}`,
              path,
              count: 1,
            });
          }
        }
      },
    };

    // Try reactive subscription first (zero polling in Angular production)
    // Fall back to polling for non-Angular environments (tests)
    const stopChangeDetection = startChangeDetection(context);

    const stopMonitoring = startMonitoring(context);

    const teardown = () => {
      if (context.disposed) return;
      context.disposed = true;
      stopChangeDetection();
      stopMonitoring();
    };

    const originalDestroy = tree.destroy?.bind(tree);
    tree.destroy = () => {
      teardown();
      if (originalDestroy) {
        originalDestroy();
      }
    };

    (tree as unknown as Record<string, unknown>)['__guardrails'] = createAPI(
      context,
      teardown
    );

    return tree as SignalTree<S> & { __guardrails?: GuardrailsAPI };
  };
}

/**
 * Start change detection - tries PathNotifier first, then reactive subscription, finally polling
 */
function startChangeDetection<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): () => void {
  // Strategy 1: Try PathNotifier for event-driven detection (zero polling, precise paths)
  if (!context.config.changeDetection?.disablePathNotifier) {
    try {
      const pathNotifier = getPathNotifier();
      if (pathNotifier) {
        const unsubscribe = pathNotifier.subscribe(
          '**',
          (value: unknown, prev: unknown, path: string) => {
            handlePathNotifierChange(context, path, value, prev);
          }
        );
        // Success! Using PathNotifier - no polling, precise path tracking
        return unsubscribe;
      }
    } catch {
      // PathNotifier failed or not available, fall through to next strategy
    }
  }

  // Strategy 2: Try reactive subscription (zero polling, but needs state diffing)
  try {
    // `subscribe` may be provided by an enhancer (effects) or be absent.
    // Treat it as optional and call if present to avoid TS errors during build.
    const maybeSubscribe = (
      context.tree as unknown as { subscribe?: (fn: () => void) => () => void }
    ).subscribe;
    if (typeof maybeSubscribe === 'function') {
      const unsubscribe = maybeSubscribe.call(context.tree, () => {
        handleStateChange(context);
      });
      return unsubscribe;
    }
  } catch {
    // subscribe() failed or is not available - fall back to polling
  }

  // Strategy 3: Fall back to polling (last resort)
  return startPollingChangeDetection(context);
}

/**
 * Handle a path-specific change from PathNotifier (most efficient method)
 * This is called directly by PathNotifier with precise path information,
 * avoiding the need for JSON diffing.
 */
function handlePathNotifierChange<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  path: string,
  newValue: unknown,
  oldValue: unknown
): void {
  if (context.disposed || context.suppressed) return;

  const startTime = performance.now();
  const timestamp = Date.now();

  const detail: UpdateDetail = {
    path,
    segments: path.split('.'),
    oldValue,
    newValue,
  };

  // Analyze the change
  analyzePreUpdate(context, detail, {});

  const duration = performance.now() - startTime;
  const diffRatio = calculateDiffRatio(oldValue, newValue);
  analyzePostUpdate(context, detail, duration, diffRatio, true);
  trackHotPath(context, path, duration);
  trackSignalUsage(context, path, timestamp);

  // Update timing stats
  updateTimingStats(context, duration);
  updateSignalStats(context, timestamp);

  // Update previous state snapshot for compatibility with other methods
  context.previousState = tryStructuredClone(context.tree());
}

/**
 * Handle a state change (called by either subscription or polling)
 */
function handleStateChange<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): void {
  if (context.disposed || context.suppressed) return;

  const currentState = context.tree();
  const previousState = context.previousState;

  if (!previousState) {
    context.previousState = tryStructuredClone(currentState);
    return;
  }

  // Compare states to detect changes using deep equality
  const equal = deepEqual(currentState, previousState);

  if (!equal) {
    const startTime = performance.now();
    const timestamp = Date.now();

    // Detect which paths changed
    const changedPaths = detectChangedPaths(previousState, currentState);

    for (const path of changedPaths) {
      const detail: UpdateDetail = {
        path,
        segments: path.split('.'),
        oldValue: getValueAtPath(previousState, path.split('.')),
        newValue: getValueAtPath(currentState, path.split('.')),
      };

      // Analyze the change
      analyzePreUpdate(context, detail, {});

      const duration = performance.now() - startTime;
      const diffRatio = calculateDiffRatio(detail.oldValue, detail.newValue);
      analyzePostUpdate(context, detail, duration, diffRatio, true);
      trackHotPath(context, path, duration);
      trackSignalUsage(context, path, timestamp);
    }

    // Update timing stats
    const totalDuration = performance.now() - startTime;
    updateTimingStats(context, totalDuration);
    updateSignalStats(context, timestamp);

    // Store new state for next comparison
    context.previousState = tryStructuredClone(currentState);
  }
}

/**
 * Start polling-based change detection for guardrails monitoring
 * Used as fallback when reactive subscription is not available
 */
function startPollingChangeDetection<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): () => void {
  const pollForChanges = () => {
    handleStateChange(context);
  };

  // Start polling
  context.pollingIntervalId = setInterval(pollForChanges, POLLING_INTERVAL_MS);

  // Return cleanup function
  return () => {
    if (context.pollingIntervalId) {
      clearInterval(context.pollingIntervalId);
      context.pollingIntervalId = undefined;
    }
  };
}

/**
 * Detect paths that changed between two state objects
 */
function detectChangedPaths<T extends Record<string, unknown>>(
  oldState: T,
  newState: T,
  prefix = ''
): string[] {
  const changes: string[] = [];

  const allKeys = new Set([
    ...Object.keys(oldState || {}),
    ...Object.keys(newState || {}),
  ]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = (oldState as Record<string, unknown>)?.[key];
    const newVal = (newState as Record<string, unknown>)?.[key];

    if (oldVal === newVal) continue;

    if (
      isObjectLike(oldVal) &&
      isObjectLike(newVal) &&
      !Array.isArray(oldVal) &&
      !Array.isArray(newVal)
    ) {
      // Recursively check nested objects
      changes.push(
        ...detectChangedPaths(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          path
        )
      );
    } else {
      // Primitive or array changed
      changes.push(path);
    }
  }

  return changes;
}

function createRuntimeStats(): RuntimeStats {
  return {
    updateCount: 0,
    totalUpdateTime: 0,
    avgUpdateTime: 0,
    p50UpdateTime: 0,
    p95UpdateTime: 0,
    p99UpdateTime: 0,
    maxUpdateTime: 0,
    recomputationCount: 0,
    recomputationsPerSecond: 0,
    signalCount: 0,
    signalRetention: 0,
    unreadSignalCount: 0,
    memoryGrowthRate: 0,
    hotPathCount: 0,
    violationCount: 0,
  };
}

function updatePercentiles<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): void {
  if (context.timings.length === 0) return;

  const sorted = [...context.timings].sort((a, b) => a - b);
  context.stats.p50UpdateTime = sorted[Math.floor(sorted.length * 0.5)] || 0;
  context.stats.p95UpdateTime = sorted[Math.floor(sorted.length * 0.95)] || 0;
  context.stats.p99UpdateTime = sorted[Math.floor(sorted.length * 0.99)] || 0;
}

function calculateDiffRatio(oldValue: unknown, newValue: unknown): number {
  if (!isComparableRecord(oldValue) || !isComparableRecord(newValue)) {
    return Object.is(oldValue, newValue) ? 0 : 1;
  }
  if (oldValue === newValue) return 0;

  const oldKeys = new Set(Object.keys(oldValue));
  const newKeys = new Set(Object.keys(newValue));
  const allKeys = new Set([...oldKeys, ...newKeys]);

  let changed = 0;
  for (const key of allKeys) {
    if (
      !oldKeys.has(key) ||
      !newKeys.has(key) ||
      oldValue[key] !== newValue[key]
    ) {
      changed++;
    }
  }

  return allKeys.size === 0 ? 0 : changed / allKeys.size;
}

function analyzePreUpdate<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  detail: UpdateDetail,
  metadata?: UpdateMetadata
): void {
  if (!context.config.customRules) return;

  for (const rule of context.config.customRules) {
    evaluateRule(context, rule, {
      path: detail.segments,
      value: detail.newValue,
      oldValue: detail.oldValue,
      metadata,
      tree: context.tree,
      stats: context.stats,
    });
  }
}

function analyzePostUpdate<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  detail: UpdateDetail,
  duration: number,
  diffRatio: number,
  isPrimary: boolean
): void {
  if (
    isPrimary &&
    context.config.budgets?.maxUpdateTime &&
    duration > context.config.budgets.maxUpdateTime
  ) {
    addIssue(context, {
      type: 'budget',
      severity: 'error',
      message: `Update took ${duration.toFixed(2)}ms (budget: ${
        context.config.budgets.maxUpdateTime
      }ms)`,
      path: detail.path,
      count: 1,
    });
  }

  const minDiff = context.config.analysis?.minDiffForParentReplace ?? 0.8;
  if (context.config.analysis?.warnParentReplace && diffRatio > minDiff) {
    addIssue(context, {
      type: 'analysis',
      severity: 'warning',
      message: `High diff ratio (${(diffRatio * 100).toFixed(
        0
      )}%) - consider scoped updates`,
      path: detail.path,
      count: 1,
      diffRatio,
    });
  }
}

function trackHotPath<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  path: string,
  duration: number
): void {
  if (!context.config.hotPaths?.enabled) return;

  const pathKey = Array.isArray(path) ? path.join('.') : path;
  const now = Date.now();
  const windowMs = context.config.hotPaths.windowMs || 1000;

  let data = context.hotPathData.get(pathKey);
  if (!data) {
    data = { count: 0, lastUpdate: now, durations: [] };
    context.hotPathData.set(pathKey, data);
  }

  // Reset if outside window
  if (now - data.lastUpdate > windowMs) {
    data.count = 0;
    data.durations = [];
  }

  data.count++;
  data.durations.push(duration);
  data.lastUpdate = now;

  // Check threshold
  const threshold = context.config.hotPaths.threshold || 10;
  const updatesPerSecond = (data.count / windowMs) * 1000;

  if (updatesPerSecond > threshold) {
    const sorted = [...data.durations].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const avg =
      data.durations.reduce((sum, d) => sum + d, 0) / data.durations.length;

    updateHotPath(context, {
      path: pathKey,
      updatesPerSecond,
      heatScore: Math.min(100, (updatesPerSecond / threshold) * 50),
      downstreamEffects: 0, // Would need dev hooks
      avgDuration: avg,
      p95Duration: p95,
    });
  }
}

function trackSignalUsage<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  path: string,
  timestamp: number
): void {
  const key = Array.isArray(path) ? path.join('.') : path;
  const entry = context.signalUsage.get(key) ?? {
    updates: 0,
    lastSeen: timestamp,
  };
  entry.updates += 1;
  entry.lastSeen = timestamp;
  context.signalUsage.set(key, entry);
}

function updateSignalStats<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  timestamp: number
): void {
  const retentionWindow = context.config.memoryLeaks?.checkInterval ?? 5000;
  const historyWindow = Math.max(retentionWindow, 1000);

  const signalCount = context.signalUsage.size;
  context.stats.signalCount = signalCount;

  const staleCount = [...context.signalUsage.values()].filter(
    (entry) => timestamp - entry.lastSeen > retentionWindow
  ).length;
  context.stats.signalRetention = staleCount;
  context.stats.unreadSignalCount = 0;

  context.memoryHistory.push({ timestamp, count: signalCount });
  context.memoryHistory = context.memoryHistory.filter(
    (entry) => timestamp - entry.timestamp <= historyWindow
  );

  const baseline = context.memoryHistory[0]?.count ?? signalCount;
  const growth =
    baseline === 0 ? 0 : (signalCount - baseline) / Math.max(1, baseline);
  context.stats.memoryGrowthRate = growth;
}

function recordRecomputations<T extends Record<string, unknown>>(
  path: string,
  context: GuardrailsContext<T>,
  count: number,
  timestamp: number
): void {
  // Track per-path recomputations
  const currentPathCount = context.pathRecomputations.get(path) ?? 0;
  context.pathRecomputations.set(path, currentPathCount + count);

  if (count > 0) {
    context.stats.recomputationCount += count;
    for (let i = 0; i < count; i++) {
      context.recomputationLog.push(timestamp);
    }
  }

  if (context.recomputationLog.length) {
    context.recomputationLog = context.recomputationLog.filter(
      (value) => timestamp - value <= RECOMPUTATION_WINDOW_MS
    );
  }

  context.stats.recomputationsPerSecond = context.recomputationLog.length;
}

function updateHotPath<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  hotPath: HotPath
): void {
  const existing = context.hotPaths.find((h) => h.path === hotPath.path);
  if (existing) {
    Object.assign(existing, hotPath);
  } else {
    context.hotPaths.push(hotPath);
    const topN = context.config.hotPaths?.topN || 5;
    if (context.hotPaths.length > topN) {
      context.hotPaths.sort((a, b) => b.heatScore - a.heatScore);
      context.hotPaths.length = topN;
    }
  }
  context.stats.hotPathCount = context.hotPaths.length;
}

function evaluateRule<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  rule: GuardrailRule<T>,
  ruleContext: RuleContext<T>
): void {
  const handleFailure = () => {
    const message =
      typeof rule.message === 'function'
        ? rule.message(ruleContext)
        : rule.message;

    addIssue(context, {
      type: 'rule',
      severity: rule.severity || 'warning',
      message,
      path: ruleContext.path.join('.'),
      count: 1,
      metadata: { rule: rule.name },
    });
  };

  try {
    const result = rule.test(ruleContext);
    if (result instanceof Promise) {
      result
        .then((outcome) => {
          if (!outcome) {
            handleFailure();
          }
        })
        .catch((error) => {
          console.warn(`[Guardrails] Rule ${rule.name} rejected:`, error);
        });
      return;
    }

    if (!result) {
      handleFailure();
    }
  } catch (error) {
    // Rule threw, log but don't halt
    console.warn(`[Guardrails] Rule ${rule.name} threw error:`, error);
  }
}

function addIssue<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  issue: GuardrailIssue
): void {
  if (context.suppressed) return;

  // Aggregate similar issues
  if (context.config.reporting?.aggregateWarnings !== false) {
    const key = `${issue.type}:${issue.path}:${issue.message}`;
    const existing = context.issueMap.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    context.issueMap.set(key, issue);
  } else {
    // When aggregation is disabled, add each issue with a unique key
    const key = `${issue.type}:${issue.path}:${
      issue.message
    }:${Date.now()}:${Math.random()}`;
    context.issueMap.set(key, issue);
  }

  if (context.config.mode === 'throw') {
    throw new Error(`[Guardrails] ${issue.message}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function shouldSuppressUpdate<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  metadata?: UpdateMetadata
): boolean {
  if (context.suppressed) return true;
  if (!metadata) return false;

  if (
    metadata.suppressGuardrails &&
    context.config.suppression?.respectMetadata !== false
  ) {
    return true;
  }

  const autoSuppress = new Set<string>(
    context.config.suppression?.autoSuppress ?? []
  );

  return [metadata.intent, metadata.source].some(
    (value) => isString(value) && autoSuppress.has(value)
  );
}

function startMonitoring<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): () => void {
  const interval = setInterval(() => {
    if (context.disposed) {
      clearInterval(interval);
      return;
    }
    checkMemory(context);
    maybeReport(context);
  }, context.config.reporting?.interval || 5000);

  return () => clearInterval(interval);
}

function checkMemory<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): void {
  if (!context.config.memoryLeaks?.enabled) return;

  const now = Date.now();
  const retentionWindow = context.config.memoryLeaks?.checkInterval ?? 5000;
  const retentionThreshold =
    context.config.memoryLeaks?.retentionThreshold ?? 100;
  const growthThreshold = context.config.memoryLeaks?.growthRate ?? 0.2;

  const staleCount = [...context.signalUsage.values()].filter(
    (entry) => now - entry.lastSeen > retentionWindow
  ).length;
  context.stats.signalRetention = staleCount;

  const exceedsRetention = context.stats.signalRetention > retentionThreshold;
  const exceedsGrowth = context.stats.memoryGrowthRate > growthThreshold;

  if (exceedsRetention || exceedsGrowth) {
    addIssue(context, {
      type: 'memory',
      severity: 'warning',
      message: `Potential memory leak detected (signals: ${
        context.stats.signalCount
      }, growth ${(context.stats.memoryGrowthRate * 100).toFixed(1)}%)`,
      path: 'root',
      count: 1,
      metadata: {
        signalCount: context.stats.signalCount,
        growth: context.stats.memoryGrowthRate,
      },
    });
  }
}

function maybeReport<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): void {
  if (context.config.reporting?.console === false) return;

  const report = generateReport(context);

  if (context.config.reporting?.customReporter) {
    context.config.reporting.customReporter(report);
  }

  if (context.config.reporting?.console && context.issues.length > 0) {
    reportToConsole(report, context.config.reporting.console === 'verbose');
  }

  // Clear issues after reporting
  context.issues = [];
  context.issueMap.clear();
}

function reportToConsole(report: GuardrailsReport, verbose: boolean): void {
  console.group('[Guardrails] Performance Report');
  logIssues(report.issues);
  logHotPaths(report.hotPaths);
  if (verbose) {
    logVerboseStats(report);
  }
  console.groupEnd();
}

function logIssues(issues: GuardrailIssue[]): void {
  if (issues.length === 0) return;
  console.warn(`${issues.length} issues detected:`);
  for (const issue of issues) {
    const prefix = getSeverityPrefix(issue.severity);
    const countSuffix = issue.count > 1 ? ` (x${issue.count})` : '';
    const message = `${prefix} [${issue.type}] ${issue.message}${countSuffix}`;
    console.log(`  ${message}`);
  }
}

function logHotPaths(hotPaths: HotPath[]): void {
  if (hotPaths.length === 0) return;
  console.log(`\nHot Paths (${hotPaths.length}):`);
  for (const hp of hotPaths) {
    const entry = `  🔥 ${hp.path}: ${hp.updatesPerSecond.toFixed(
      1
    )}/s (heat: ${hp.heatScore.toFixed(0)})`;
    console.log(entry);
  }
}

function logVerboseStats(report: GuardrailsReport): void {
  console.log('\nStats:', report.stats);
  console.log('Budgets:', report.budgets);
}

function getSeverityPrefix(severity: GuardrailIssue['severity']): string {
  if (severity === 'error') return '❌';
  if (severity === 'warning') return '⚠️';
  return 'ℹ️';
}

function generateReport<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): GuardrailsReport {
  const memoryCurrent = context.stats.signalCount;
  const memoryLimit = context.config.budgets?.maxMemory ?? 50;
  const recomputationCurrent = context.stats.recomputationsPerSecond;
  const recomputationLimit = context.config.budgets?.maxRecomputations ?? 100;

  const budgets: BudgetStatus = {
    updateTime: createBudgetItem(
      context.stats.avgUpdateTime,
      context.config.budgets?.maxUpdateTime || 16
    ),
    memory: createBudgetItem(memoryCurrent, memoryLimit),
    recomputations: createBudgetItem(recomputationCurrent, recomputationLimit),
  };

  return {
    timestamp: Date.now(),
    treeId: context.config.treeId,
    issues: Array.from(context.issueMap.values()),
    hotPaths: context.hotPaths,
    budgets,
    stats: context.stats,
    recommendations: generateRecommendations(context),
  };
}

function createBudgetItem(current: number, limit: number): BudgetItem {
  if (limit <= 0) {
    return {
      current,
      limit,
      usage: 0,
      status: 'ok',
    };
  }

  const usage = (current / limit) * 100;
  const threshold = 80;
  let status: BudgetItem['status'];
  if (usage > 100) {
    status = 'exceeded';
  } else if (usage > threshold) {
    status = 'warning';
  } else {
    status = 'ok';
  }
  return {
    current,
    limit,
    usage,
    status,
  };
}

function generateRecommendations<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>
): string[] {
  const recommendations: string[] = [];

  if (context.hotPaths.length > 0) {
    recommendations.push(
      'Consider batching or debouncing updates to hot paths'
    );
  }

  if (context.stats.avgUpdateTime > 10) {
    recommendations.push('Average update time is high - review update logic');
  }

  return recommendations;
}

function createAPI<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  teardown: () => void
): GuardrailsAPI {
  return {
    getReport: () => generateReport(context),
    getStats: () => context.stats,
    suppress: (fn: () => void) => {
      const was = context.suppressed;
      context.suppressed = true;
      try {
        fn();
      } finally {
        context.suppressed = was;
      }
    },
    dispose: () => {
      teardown();
      const finalReport = generateReport(context);
      if (context.config.reporting?.console !== false) {
        console.log('[Guardrails] Final report on disposal:', finalReport);
      }
      if (context.config.reporting?.customReporter) {
        context.config.reporting.customReporter(finalReport);
      }
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function extractMetadata(payload: unknown): UpdateMetadata | undefined {
  if (!isObjectLike(payload)) return undefined;
  const candidate = (payload as Record<string, unknown>)['metadata'];
  return isObjectLike(candidate) ? (candidate as UpdateMetadata) : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function collectUpdateDetails(
  payload: unknown,
  stateSnapshot: unknown
): UpdateDetail[] {
  const details: UpdateDetail[] = [];

  const visit = (value: unknown, segments: string[], currentState: unknown) => {
    const path = segments.length ? segments.join('.') : 'root';
    const oldValue = captureValue(currentState);

    if (isObjectLike(value)) {
      details.push({
        path,
        segments: [...segments],
        newValue: value,
        oldValue,
      });
      for (const [key, child] of Object.entries(value)) {
        visit(
          child,
          [...segments, key],
          isObjectLike(currentState)
            ? (currentState as Record<string, unknown>)[key]
            : undefined
        );
      }
      return;
    }

    details.push({ path, segments: [...segments], newValue: value, oldValue });
  };

  if (isObjectLike(payload)) {
    visit(payload, [], stateSnapshot);
  } else {
    details.push({
      path: 'root',
      segments: [],
      newValue: payload,
      oldValue: captureValue(stateSnapshot),
    });
  }

  if (details.length === 0) {
    details.push({
      path: 'root',
      segments: [],
      newValue: payload,
      oldValue: captureValue(stateSnapshot),
    });
  }

  return details;
}

function getValueAtPath(source: unknown, segments: string[]): unknown {
  let current = source;
  for (const segment of segments) {
    if (!isObjectLike(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function captureValue<T>(value: T): T {
  return tryStructuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function updateTimingStats<T extends Record<string, unknown>>(
  context: GuardrailsContext<T>,
  duration: number
): void {
  context.timings.push(duration);
  if (context.timings.length > MAX_TIMING_SAMPLES) {
    context.timings.shift();
  }

  context.stats.updateCount++;
  context.stats.totalUpdateTime += duration;
  context.stats.avgUpdateTime =
    context.stats.totalUpdateTime / context.stats.updateCount;
  context.stats.maxUpdateTime = Math.max(context.stats.maxUpdateTime, duration);

  updatePercentiles(context);
}

function isComparableRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}
