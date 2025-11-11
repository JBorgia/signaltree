/**
 * SignalTree Guardrails Enhancer v1.1
 * Development-only performance monitoring and anti-pattern detection
 * @packageDocumentation
 */

import type { Middleware, SignalTree } from '@signaltree/core';

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

function isDevEnvironment(): boolean {
  if (__DEV__ !== undefined) return __DEV__;
  if (process !== undefined && process.env?.['NODE_ENV'] === 'production')
    return false;
  if (ngDevMode !== undefined) return ngDevMode;
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

interface GuardrailsContext<T = unknown> {
  tree: SignalTree<T>;
  config: GuardrailsConfig;
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
  middlewareId?: string;
  disposed: boolean;
}

const MAX_TIMING_SAMPLES = 1000;

/**
 * Creates a guardrails enhancer for dev-only monitoring
 */
export function withGuardrails<T extends Record<string, unknown>>(
  config: GuardrailsConfig = {}
): (tree: SignalTree<T>) => SignalTree<T> {
  return (tree: SignalTree<T>) => {
    const enabled =
      typeof config.enabled === 'function'
        ? config.enabled()
        : config.enabled !== false;

    if (!isDevEnvironment() || !enabled) {
      return tree;
    }

    if (
      typeof tree.addTap !== 'function' ||
      typeof tree.removeTap !== 'function'
    ) {
      console.warn(
        '[Guardrails] Tree does not expose middleware hooks; guardrails disabled.'
      );
      return tree;
    }

    const stats = createRuntimeStats();
    const context: GuardrailsContext<T> = {
      tree,
      config,
      stats,
      issues: [],
      hotPaths: [],
      currentUpdate: null,
      suppressed: false,
      timings: [],
      hotPathData: new Map(),
      issueMap: new Map(),
      disposed: false,
    };

    const middlewareId = `guardrails:${config.treeId ?? 'tree'}:${Math.random()
      .toString(36)
      .slice(2)}`;
    context.middlewareId = middlewareId;

    const middleware = createGuardrailsMiddleware(context);
    tree.addTap(middleware);

    const stopMonitoring = startMonitoring(context);

    const teardown = () => {
      if (context.disposed) return;
      context.disposed = true;
      stopMonitoring();
      try {
        tree.removeTap(middlewareId);
      } catch {
        // ignore if removal fails
      }
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

    return tree;
  };
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

function createGuardrailsMiddleware<T>(
  context: GuardrailsContext<T>
): Middleware<T> {
  return {
    id: context.middlewareId ?? 'guardrails',
    before: (action: string, payload: unknown, state: T): boolean => {
      if (context.suppressed) {
        context.currentUpdate = null;
        return !context.disposed;
      }

      const metadata = extractMetadata(payload);
      if (shouldSuppressUpdate(context, metadata)) {
        context.currentUpdate = null;
        return !context.disposed;
      }

      const details = collectUpdateDetails(payload, state);
      context.currentUpdate = {
        action,
        startTime: performance.now(),
        metadata,
        details,
      };

      for (const detail of details) {
        analyzePreUpdate(context, detail, metadata);
      }

      return !context.disposed;
    },
    after: (
      _action: string,
      _payload: unknown,
      _previousState: T,
      newState: T
    ): void => {
      const pending = context.currentUpdate;
      if (!pending) return;

      const duration = Math.max(0, performance.now() - pending.startTime);
      updateTimingStats(context, duration);

      for (const [index, detail] of pending.details.entries()) {
        const latest = getValueAtPath(newState, detail.segments);
        const diffRatio = calculateDiffRatio(detail.oldValue, latest);
        analyzePostUpdate(context, detail, duration, diffRatio, index === 0);
        trackHotPath(context, detail.path, duration);
      }

      context.currentUpdate = null;
    },
  };
}

function updatePercentiles(context: GuardrailsContext): void {
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

function analyzePreUpdate<T>(
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

function analyzePostUpdate(
  context: GuardrailsContext,
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

function trackHotPath(
  context: GuardrailsContext,
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

function updateHotPath(context: GuardrailsContext, hotPath: HotPath): void {
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

function evaluateRule(
  context: GuardrailsContext,
  rule: GuardrailRule,
  ruleContext: RuleContext
): void {
  try {
    const result = rule.test(ruleContext);
    if (result instanceof Promise) {
      result.catch(() => {
        // Async rule failed, don't halt
      });
    } else if (!result) {
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
    }
  } catch (error) {
    // Rule threw, log but don't halt
    console.warn(`[Guardrails] Rule ${rule.name} threw error:`, error);
  }
}

function addIssue(context: GuardrailsContext, issue: GuardrailIssue): void {
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
  }

  context.issues.push(issue);
  context.stats.violationCount++;

  // Throw mode
  if (context.config.mode === 'throw') {
    throw new Error(`[Guardrails] ${issue.message}`);
  }
}

function shouldSuppressUpdate(
  context: GuardrailsContext,
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

  const autoSuppress = context.config.suppression?.autoSuppress || [];
  if (
    metadata.intent &&
    autoSuppress.includes(metadata.intent as (typeof autoSuppress)[number])
  ) {
    return true;
  }
  if (
    metadata.source &&
    autoSuppress.includes(metadata.source as (typeof autoSuppress)[number])
  ) {
    return true;
  }

  return false;
}

function startMonitoring(context: GuardrailsContext): () => void {
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

function checkMemory(context: GuardrailsContext): void {
  if (!context.config.memoryLeaks?.enabled) return;

  // Memory checks would go here
  // Would need access to signal count, unread signals, etc.
}

function maybeReport(context: GuardrailsContext): void {
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

function generateReport(context: GuardrailsContext): GuardrailsReport {
  const budgets: BudgetStatus = {
    updateTime: createBudgetItem(
      context.stats.avgUpdateTime,
      context.config.budgets?.maxUpdateTime || 16
    ),
    memory: createBudgetItem(0, context.config.budgets?.maxMemory || 50),
    recomputations: createBudgetItem(
      context.stats.recomputationsPerSecond,
      context.config.budgets?.maxRecomputations || 100
    ),
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
  const usage = limit > 0 ? (current / limit) * 100 : 0;
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

function generateRecommendations(context: GuardrailsContext): string[] {
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

function createAPI(
  context: GuardrailsContext,
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

function extractMetadata(payload: unknown): UpdateMetadata | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const candidate = (payload as Record<string, unknown>)['metadata'];
  if (candidate && typeof candidate === 'object') {
    return candidate as UpdateMetadata;
  }
  return undefined;
}

function collectUpdateDetails(
  payload: unknown,
  stateSnapshot: unknown
): UpdateDetail[] {
  const details: UpdateDetail[] = [];

  const visit = (value: unknown, segments: string[], currentState: unknown) => {
    const path = segments.length ? segments.join('.') : 'root';
    const oldValue = captureValue(currentState);

    if (isPlainObject(value)) {
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
          currentState
            ? (currentState as Record<string, unknown>)[key]
            : undefined
        );
      }
      return;
    }

    details.push({ path, segments: [...segments], newValue: value, oldValue });
  };

  if (isPlainObject(payload)) {
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
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function captureValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through
    }
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function updateTimingStats(context: GuardrailsContext, duration: number): void {
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
