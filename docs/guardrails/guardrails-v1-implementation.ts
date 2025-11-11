/**
 * SignalTree Guardrails Enhancer v1.0
 * Framework-agnostic, dev-only performance monitoring and anti-pattern detection
 * 
 * @packageDocumentation
 */

import type { 
  Enhancer, 
  SignalTree, 
  Middleware,
  EnhancerMetadata 
} from '@signaltree/core';
import { parsePath, matchPath } from '@signaltree/shared';

// ============================================
// Core Types
// ============================================

export interface GuardrailsConfig {
  mode?: 'warn' | 'throw' | 'silent';
  enabled?: boolean | (() => boolean);
  
  // Performance Budgets - Quantifiable Standards
  budgets?: {
    maxUpdateTime?: number;        // ms per update (default: 16)
    maxMemory?: number;            // MB total (default: 50)
    maxRecomputations?: number;    // per second (default: 100)
    maxTreeDepth?: number;         // nesting levels (default: 10)
    alertThreshold?: number;       // % of budget before warning (default: 0.8)
  };
  
  // Hot Path Analysis - Actionable Focus
  hotPaths?: {
    enabled?: boolean;
    threshold?: number;             // updates/sec to consider "hot" (default: 10)
    topN?: number;                 // track top N hot paths (default: 5)
    trackDownstream?: boolean;     // track cascade effects (default: true)
    windowMs?: number;             // time window for rate calculation (default: 1000)
  };
  
  // Memory Leak Detection - Critical Issue Prevention
  memoryLeaks?: {
    enabled?: boolean;
    checkInterval?: number;         // ms between checks (default: 5000)
    retentionThreshold?: number;   // max signals before warning (default: 100)
    growthRate?: number;           // % growth to trigger warning (default: 0.2)
    trackUnread?: boolean;         // track signals never read (default: true)
  };
  
  // Custom Rules - Team Flexibility
  customRules?: GuardrailRule[];
  
  // Intent-Aware Suppression
  suppression?: {
    autoSuppress?: ('hydrate' | 'reset' | 'bulk' | 'migration' | 'time-travel' | 'serialization')[];
    respectMetadata?: boolean;     // honor suppressGuardrails in metadata (default: true)
  };
  
  // Read/Write Analysis
  analysis?: {
    forbidRootRead?: boolean;
    forbidSliceRootRead?: boolean | string[];
    maxDepsPerComputed?: number;
    warnParentReplace?: boolean;
    minDiffForParentReplace?: number;  // min % change to justify
    detectThrashing?: boolean;
    maxRerunsPerSecond?: number;
  };
  
  // Reporting
  reporting?: {
    interval?: number;              // ms between reports (default: 5000)
    console?: boolean | 'verbose';
    customReporter?: (report: GuardrailsReport) => void;
    aggregateWarnings?: boolean;   // group similar warnings (default: true)
  };
}

export interface UpdateMetadata {
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  suppressGuardrails?: boolean;
  timestamp?: number;
  correlationId?: string;
  [key: string]: unknown;  // Allow enhancer-specific metadata
}

export interface GuardrailRule {
  name: string;
  description?: string;
  test: (context: RuleContext) => boolean | Promise<boolean>;
  message: string | ((context: RuleContext) => string);
  severity?: 'error' | 'warning' | 'info';
  fix?: (context: RuleContext) => void;
  tags?: string[];  // For filtering/grouping
}

export interface RuleContext {
  path: string[];
  value: unknown;
  oldValue?: unknown;
  operation: 'read' | 'write' | 'compute' | 'effect';
  metadata?: UpdateMetadata;
  tree: SignalTree<unknown>;
  stats: RuntimeStats;
}

export interface RuntimeStats {
  // Performance
  updateCount: number;
  totalUpdateTime: number;
  recomputationCount: number;
  lastRecomputationWindow: number[];
  
  // Memory
  signalCount: number;
  signalGrowthRate: number;
  retainedPaths: Map<string, SignalInfo>;
  
  // Hot paths
  pathUpdateFrequency: Map<string, number[]>;
  pathUpdateTimes: Map<string, number[]>;
  pathDependencies: Map<string, Set<string>>;
  downstreamEffects: Map<string, number>;
  
  // Issues
  violations: GuardrailIssue[];
}

interface SignalInfo {
  createdAt: number;
  lastRead: number;
  lastWrite: number;
  readCount: number;
  writeCount: number;
  isDisposed: boolean;
}

export interface GuardrailIssue {
  type: 'budget' | 'hot-path' | 'memory' | 'rule' | 'analysis';
  severity: 'error' | 'warning' | 'info';
  path?: string;
  message: string;
  context?: Record<string, unknown>;
  fix?: () => void;
  timestamp: number;
  count?: number;  // For aggregated warnings
}

export interface HotPath {
  path: string;
  updatesPerSecond: number;
  averageUpdateTime: number;
  percentile95Time: number;
  downstreamEffects: number;
  dependentPaths: string[];
  heatScore: number;  // 0-100
}

export interface BudgetStatus {
  updateTime: BudgetItem;
  memory: BudgetItem;
  recomputations: BudgetItem;
  treeDepth: BudgetItem;
}

interface BudgetItem {
  current: number;
  budget: number;
  status: 'ok' | 'warning' | 'exceeded';
  trend?: 'stable' | 'increasing' | 'decreasing';
}

export interface GuardrailsReport {
  timestamp: number;
  duration: number;  // Time window covered
  issues: GuardrailIssue[];
  hotPaths: HotPath[];
  budgetStatus: BudgetStatus;
  recommendations: string[];
  stats: Partial<RuntimeStats>;
}

// ============================================
// Dev Detection (Framework-Agnostic)
// ============================================

declare const __DEV__: boolean | undefined;

function isDevEnvironment(): boolean {
  // Check various dev indicators
  if (typeof __DEV__ !== 'undefined') return __DEV__;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') return true;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return true;
  
  // Default to false for safety (no dev code in prod)
  return false;
}

// ============================================
// Main Enhancer Implementation
// ============================================

export function withGuardrails<T extends Record<string, unknown>>(
  config: GuardrailsConfig = {}
): Enhancer<T, T & GuardrailsEnhanced> {
  // Early exit for production
  if (!isDevEnvironment()) {
    return (tree: T) => tree as T & GuardrailsEnhanced;
  }
  
  // Check if explicitly disabled
  const enabled = typeof config.enabled === 'function' 
    ? config.enabled() 
    : config.enabled !== false;
    
  if (!enabled) {
    return (tree: T) => tree as T & GuardrailsEnhanced;
  }
  
  return (tree: T): T & GuardrailsEnhanced => {
    const stats = createRuntimeStats();
    const context = createGuardrailsContext(config, stats);
    
    // Create middleware for intercepting updates
    const middleware = createGuardrailsMiddleware(context);
    
    // Apply middleware to tree (assuming tree has a way to add middleware)
    const enhancedTree = applyMiddleware(tree, middleware);
    
    // Set up dev tracing hooks if available
    setupDevTracingHooks(enhancedTree, context);
    
    // Start monitoring loops
    const cleanup = startMonitoring(context);
    
    // Add guardrails API
    const guardrailsAPI: GuardrailsAPI = {
      getReport: () => generateReport(context),
      getStats: () => ({ ...stats }),
      reset: () => resetStats(stats),
      suppress: (fn) => suppressGuardrails(context, fn),
      scoped: (intent, fn) => scopedExecution(context, intent, fn),
      dispose: cleanup,
    };
    
    (enhancedTree as any).__guardrails = guardrailsAPI;
    
    return enhancedTree as T & GuardrailsEnhanced;
  };
}

// ============================================
// Middleware Implementation
// ============================================

function createGuardrailsMiddleware(context: GuardrailsContext): Middleware {
  return {
    pre: (update) => {
      const startTime = performance.now();
      context.currentUpdate = {
        startTime,
        path: update.path,
        metadata: update.metadata,
      };
      
      // Check if suppressed
      if (shouldSuppressUpdate(context, update.metadata)) {
        context.currentUpdate.suppressed = true;
        return update;
      }
      
      // Pre-update analysis
      analyzePreUpdate(context, update);
      
      return update;
    },
    
    post: (update, result) => {
      if (!context.currentUpdate || context.currentUpdate.suppressed) {
        return result;
      }
      
      const duration = performance.now() - context.currentUpdate.startTime;
      
      // Track update metrics
      trackUpdateMetrics(context, update.path, duration);
      
      // Post-update analysis
      analyzePostUpdate(context, update, result, duration);
      
      // Check budgets
      checkBudgets(context, duration);
      
      // Evaluate custom rules
      evaluateRules(context, {
        path: parsePath(update.path),
        value: result,
        oldValue: update.oldValue,
        operation: 'write',
        metadata: update.metadata,
        tree: update.tree,
        stats: context.stats,
      });
      
      context.currentUpdate = null;
      return result;
    },
  };
}

// ============================================
// Dev Tracing Hooks
// ============================================

function setupDevTracingHooks(tree: any, context: GuardrailsContext): void {
  // If the tree exposes dev hooks, use them
  if (tree.__devHooks) {
    const hooks = tree.__devHooks;
    
    // Track reads for dependency analysis
    if (hooks.onRead) {
      const originalOnRead = hooks.onRead;
      hooks.onRead = (path: string) => {
        trackRead(context, path);
        return originalOnRead?.(path);
      };
    }
    
    // Track computations for recomputation counting
    if (hooks.onComputeStart && hooks.onComputeEnd) {
      const originalStart = hooks.onComputeStart;
      const originalEnd = hooks.onComputeEnd;
      
      hooks.onComputeStart = (id: string) => {
        context.computeStack.push({ id, startTime: performance.now() });
        return originalStart?.(id);
      };
      
      hooks.onComputeEnd = (id: string) => {
        const compute = context.computeStack.pop();
        if (compute) {
          trackRecomputation(context, id, performance.now() - compute.startTime);
        }
        return originalEnd?.(id);
      };
    }
  }
}

// ============================================
// Monitoring Loops
// ============================================

function startMonitoring(context: GuardrailsContext): () => void {
  const intervals: number[] = [];
  
  // Reporting interval
  if (context.config.reporting?.interval) {
    intervals.push(
      setInterval(() => {
        const report = generateReport(context);
        reportIssues(report, context.config.reporting);
        
        // Clear old violations after reporting
        context.stats.violations = context.stats.violations.filter(
          v => Date.now() - v.timestamp < context.config.reporting!.interval! * 2
        );
      }, context.config.reporting.interval) as unknown as number
    );
  }
  
  // Memory leak detection
  if (context.config.memoryLeaks?.enabled) {
    intervals.push(
      setInterval(() => {
        checkMemoryLeaks(context);
      }, context.config.memoryLeaks.checkInterval || 5000) as unknown as number
    );
  }
  
  // Return cleanup function
  return () => {
    intervals.forEach(clearInterval);
    context.disposed = true;
  };
}

// ============================================
// Analysis Functions
// ============================================

function analyzePreUpdate(context: GuardrailsContext, update: any): void {
  const config = context.config.analysis;
  if (!config) return;
  
  const path = parsePath(update.path);
  
  // Check for root read
  if (config.forbidRootRead && path.length === 0) {
    addViolation(context, {
      type: 'analysis',
      severity: 'warning',
      path: update.path,
      message: 'Reading from root is discouraged (causes broad recomputation)',
      timestamp: Date.now(),
    });
  }
  
  // Check for slice root read
  if (config.forbidSliceRootRead) {
    const slices = Array.isArray(config.forbidSliceRootRead) 
      ? config.forbidSliceRootRead 
      : ['ui', 'cache', 'temp'];
      
    if (path.length === 1 && slices.includes(path[0])) {
      addViolation(context, {
        type: 'analysis',
        severity: 'warning',
        path: update.path,
        message: `Reading from ${path[0]} root is discouraged`,
        timestamp: Date.now(),
      });
    }
  }
}

function analyzePostUpdate(context: GuardrailsContext, update: any, result: any, duration: number): void {
  const config = context.config.analysis;
  if (!config) return;
  
  // Check for parent replacement
  if (config.warnParentReplace && update.oldValue && typeof update.oldValue === 'object') {
    const changeRatio = calculateChangeRatio(update.oldValue, result);
    const threshold = config.minDiffForParentReplace || 0.3;
    
    if (changeRatio < threshold) {
      addViolation(context, {
        type: 'analysis',
        severity: 'warning',
        path: update.path,
        message: `Parent replacement with only ${Math.round(changeRatio * 100)}% changes. Consider leaf updates.`,
        context: { changeRatio, threshold },
        timestamp: Date.now(),
      });
    }
  }
}

// ============================================
// Hot Path Analysis
// ============================================

function trackUpdateMetrics(context: GuardrailsContext, path: string, duration: number): void {
  const stats = context.stats;
  const config = context.config.hotPaths;
  
  if (!config?.enabled) return;
  
  const now = Date.now();
  const windowMs = config.windowMs || 1000;
  
  // Track update frequency
  let frequency = stats.pathUpdateFrequency.get(path) || [];
  frequency = frequency.filter(t => now - t < windowMs);
  frequency.push(now);
  stats.pathUpdateFrequency.set(path, frequency);
  
  // Track update times
  let times = stats.pathUpdateTimes.get(path) || [];
  times.push(duration);
  if (times.length > 100) times.shift();  // Keep last 100
  stats.pathUpdateTimes.set(path, times);
  
  // Check if hot path
  const updatesPerSecond = frequency.length * (1000 / windowMs);
  if (updatesPerSecond >= (config.threshold || 10)) {
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)] || avgTime;
    
    addHotPath(context, {
      path,
      updatesPerSecond,
      averageUpdateTime: avgTime,
      percentile95Time: p95Time,
      downstreamEffects: stats.downstreamEffects.get(path) || 0,
      dependentPaths: Array.from(stats.pathDependencies.get(path) || []),
      heatScore: Math.min(100, (updatesPerSecond / 10) * 50 + (avgTime / 16) * 50),
    });
  }
}

// ============================================
// Memory Leak Detection
// ============================================

function checkMemoryLeaks(context: GuardrailsContext): void {
  const config = context.config.memoryLeaks;
  const stats = context.stats;
  
  if (!config) return;
  
  const now = Date.now();
  
  // Check retention threshold
  if (stats.signalCount > (config.retentionThreshold || 100)) {
    addViolation(context, {
      type: 'memory',
      severity: 'warning',
      message: `High signal retention: ${stats.signalCount} signals (threshold: ${config.retentionThreshold})`,
      context: { signalCount: stats.signalCount },
      timestamp: now,
    });
  }
  
  // Check growth rate
  if (stats.signalGrowthRate > (config.growthRate || 0.2)) {
    addViolation(context, {
      type: 'memory',
      severity: 'warning',
      message: `Signal count growing rapidly: ${Math.round(stats.signalGrowthRate * 100)}% increase`,
      context: { growthRate: stats.signalGrowthRate },
      timestamp: now,
    });
  }
  
  // Check for unread signals
  if (config.trackUnread) {
    const unreadSignals = Array.from(stats.retainedPaths.entries())
      .filter(([_, info]) => info.readCount === 0 && now - info.createdAt > 10000);
      
    if (unreadSignals.length > 0) {
      addViolation(context, {
        type: 'memory',
        severity: 'info',
        message: `${unreadSignals.length} signals created but never read`,
        context: { paths: unreadSignals.slice(0, 5).map(([p]) => p) },
        timestamp: now,
      });
    }
  }
}

// ============================================
// Budget Checking
// ============================================

function checkBudgets(context: GuardrailsContext, updateDuration: number): void {
  const config = context.config.budgets;
  const stats = context.stats;
  
  if (!config) return;
  
  const threshold = config.alertThreshold || 0.8;
  
  // Update time budget
  if (config.maxUpdateTime) {
    const status = updateDuration > config.maxUpdateTime ? 'exceeded' :
                   updateDuration > config.maxUpdateTime * threshold ? 'warning' : 'ok';
    
    if (status !== 'ok') {
      addViolation(context, {
        type: 'budget',
        severity: status === 'exceeded' ? 'error' : 'warning',
        message: `Update took ${updateDuration.toFixed(2)}ms (budget: ${config.maxUpdateTime}ms)`,
        context: { duration: updateDuration, budget: config.maxUpdateTime },
        timestamp: Date.now(),
      });
    }
  }
  
  // Recomputation budget
  if (config.maxRecomputations) {
    const recentRecomputations = stats.lastRecomputationWindow.filter(
      t => Date.now() - t < 1000
    ).length;
    
    const status = recentRecomputations > config.maxRecomputations ? 'exceeded' :
                   recentRecomputations > config.maxRecomputations * threshold ? 'warning' : 'ok';
    
    if (status !== 'ok') {
      addViolation(context, {
        type: 'budget',
        severity: status === 'exceeded' ? 'error' : 'warning',
        message: `${recentRecomputations} recomputations/sec (budget: ${config.maxRecomputations})`,
        context: { count: recentRecomputations, budget: config.maxRecomputations },
        timestamp: Date.now(),
      });
    }
  }
}

// ============================================
// Custom Rules Evaluation
// ============================================

async function evaluateRules(context: GuardrailsContext, ruleContext: RuleContext): Promise<void> {
  const rules = context.config.customRules || [];
  
  for (const rule of rules) {
    try {
      const passed = await rule.test(ruleContext);
      
      if (!passed) {
        const message = typeof rule.message === 'function' 
          ? rule.message(ruleContext)
          : rule.message;
        
        addViolation(context, {
          type: 'rule',
          severity: rule.severity || 'warning',
          path: ruleContext.path.join('.'),
          message: `[${rule.name}] ${message}`,
          context: { rule: rule.name },
          fix: rule.fix ? () => rule.fix!(ruleContext) : undefined,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error(`Guardrails rule '${rule.name}' failed:`, error);
    }
  }
}

// ============================================
// Helper Functions
// ============================================

function createRuntimeStats(): RuntimeStats {
  return {
    updateCount: 0,
    totalUpdateTime: 0,
    recomputationCount: 0,
    lastRecomputationWindow: [],
    signalCount: 0,
    signalGrowthRate: 0,
    retainedPaths: new Map(),
    pathUpdateFrequency: new Map(),
    pathUpdateTimes: new Map(),
    pathDependencies: new Map(),
    downstreamEffects: new Map(),
    violations: [],
  };
}

function createGuardrailsContext(config: GuardrailsConfig, stats: RuntimeStats): GuardrailsContext {
  return {
    config,
    stats,
    currentUpdate: null,
    computeStack: [],
    hotPaths: [],
    disposed: false,
  };
}

function resetStats(stats: RuntimeStats): void {
  stats.updateCount = 0;
  stats.totalUpdateTime = 0;
  stats.recomputationCount = 0;
  stats.lastRecomputationWindow = [];
  stats.pathUpdateFrequency.clear();
  stats.pathUpdateTimes.clear();
  stats.violations = [];
}

function shouldSuppressUpdate(context: GuardrailsContext, metadata?: UpdateMetadata): boolean {
  if (!metadata) return false;
  
  // Explicit suppression
  if (metadata.suppressGuardrails && context.config.suppression?.respectMetadata !== false) {
    return true;
  }
  
  // Auto-suppress certain intents
  const autoSuppress = context.config.suppression?.autoSuppress || [];
  if (metadata.intent && autoSuppress.includes(metadata.intent as any)) {
    return true;
  }
  
  if (metadata.source && autoSuppress.includes(metadata.source as any)) {
    return true;
  }
  
  return false;
}

function suppressGuardrails(context: GuardrailsContext, fn: () => void): void {
  const originalMode = context.config.mode;
  context.config.mode = 'silent';
  try {
    fn();
  } finally {
    context.config.mode = originalMode;
  }
}

function scopedExecution(
  context: GuardrailsContext, 
  intent: UpdateMetadata['intent'], 
  fn: () => void
): void {
  const previousUpdate = context.currentUpdate;
  context.currentUpdate = {
    startTime: performance.now(),
    path: '',
    metadata: { intent, suppressGuardrails: true },
    suppressed: true,
  };
  
  try {
    fn();
  } finally {
    context.currentUpdate = previousUpdate;
  }
}

function trackRead(context: GuardrailsContext, path: string): void {
  const info = context.stats.retainedPaths.get(path);
  if (info) {
    info.readCount++;
    info.lastRead = Date.now();
  }
}

function trackRecomputation(context: GuardrailsContext, id: string, duration: number): void {
  context.stats.recomputationCount++;
  context.stats.lastRecomputationWindow.push(Date.now());
  
  // Clean old entries
  const now = Date.now();
  context.stats.lastRecomputationWindow = context.stats.lastRecomputationWindow.filter(
    t => now - t < 5000
  );
}

function addViolation(context: GuardrailsContext, violation: GuardrailIssue): void {
  // Aggregate similar violations
  if (context.config.reporting?.aggregateWarnings) {
    const existing = context.stats.violations.find(
      v => v.type === violation.type && 
           v.path === violation.path && 
           v.message === violation.message
    );
    
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.timestamp = violation.timestamp;
      return;
    }
  }
  
  context.stats.violations.push(violation);
  
  // Throw if mode is 'throw'
  if (context.config.mode === 'throw' && violation.severity === 'error') {
    throw new Error(`Guardrails violation: ${violation.message}`);
  }
}

function addHotPath(context: GuardrailsContext, hotPath: HotPath): void {
  const existing = context.hotPaths.findIndex(h => h.path === hotPath.path);
  if (existing >= 0) {
    context.hotPaths[existing] = hotPath;
  } else {
    context.hotPaths.push(hotPath);
  }
  
  // Keep only top N
  const topN = context.config.hotPaths?.topN || 5;
  context.hotPaths.sort((a, b) => b.heatScore - a.heatScore);
  context.hotPaths = context.hotPaths.slice(0, topN);
}

function calculateChangeRatio(oldValue: any, newValue: any): number {
  // Simple implementation - can be enhanced
  const oldKeys = Object.keys(oldValue);
  const newKeys = Object.keys(newValue);
  
  let changes = 0;
  for (const key of oldKeys) {
    if (oldValue[key] !== newValue[key]) changes++;
  }
  for (const key of newKeys) {
    if (!(key in oldValue)) changes++;
  }
  
  return changes / Math.max(oldKeys.length, newKeys.length);
}

function generateReport(context: GuardrailsContext): GuardrailsReport {
  const stats = context.stats;
  const now = Date.now();
  
  return {
    timestamp: now,
    duration: context.config.reporting?.interval || 5000,
    issues: [...stats.violations],
    hotPaths: [...context.hotPaths],
    budgetStatus: {
      updateTime: { current: 0, budget: 16, status: 'ok', trend: 'stable' },
      memory: { current: 0, budget: 50, status: 'ok', trend: 'stable' },
      recomputations: { current: stats.recomputationCount, budget: 100, status: 'ok', trend: 'stable' },
      treeDepth: { current: 0, budget: 10, status: 'ok', trend: 'stable' },
    },
    recommendations: generateRecommendations(context),
    stats: {
      updateCount: stats.updateCount,
      totalUpdateTime: stats.totalUpdateTime,
      recomputationCount: stats.recomputationCount,
      signalCount: stats.signalCount,
    },
  };
}

function generateRecommendations(context: GuardrailsContext): string[] {
  const recommendations: string[] = [];
  const stats = context.stats;
  
  if (context.hotPaths.length > 3) {
    recommendations.push('Multiple hot paths detected. Consider batching updates or using memoization.');
  }
  
  if (stats.signalGrowthRate > 0.1) {
    recommendations.push('Signal count growing. Check for memory leaks or unnecessary signal creation.');
  }
  
  const avgUpdateTime = stats.totalUpdateTime / Math.max(stats.updateCount, 1);
  if (avgUpdateTime > 8) {
    recommendations.push('Average update time high. Profile and optimize heavy computations.');
  }
  
  return recommendations;
}

function reportIssues(report: GuardrailsReport, reporting?: GuardrailsConfig['reporting']): void {
  if (!reporting || reporting.console === false) return;
  
  if (report.issues.length === 0 && reporting.console !== 'verbose') return;
  
  console.group('🛡️ SignalTree Guardrails Report');
  
  if (report.issues.length > 0) {
    console.group(`Issues (${report.issues.length})`);
    console.table(report.issues.map(i => ({
      type: i.type,
      severity: i.severity,
      path: i.path,
      message: i.message,
      count: i.count,
    })));
    console.groupEnd();
  }
  
  if (report.hotPaths.length > 0) {
    console.group(`Hot Paths (${report.hotPaths.length})`);
    console.table(report.hotPaths.map(h => ({
      path: h.path,
      'updates/sec': h.updatesPerSecond.toFixed(1),
      'avg time': `${h.averageUpdateTime.toFixed(2)}ms`,
      'p95 time': `${h.percentile95Time.toFixed(2)}ms`,
      'heat': `${h.heatScore.toFixed(0)}%`,
    })));
    console.groupEnd();
  }
  
  if (report.recommendations.length > 0) {
    console.group('Recommendations');
    report.recommendations.forEach(r => console.log(`• ${r}`));
    console.groupEnd();
  }
  
  console.groupEnd();
  
  if (reporting.customReporter) {
    reporting.customReporter(report);
  }
}

// Stub for applying middleware (would be provided by SignalTree core)
function applyMiddleware(tree: any, middleware: Middleware): any {
  // This would be replaced with actual SignalTree middleware application
  // For now, return tree as-is
  return tree;
}

// ============================================
// Internal Types
// ============================================

interface GuardrailsContext {
  config: GuardrailsConfig;
  stats: RuntimeStats;
  currentUpdate: CurrentUpdate | null;
  computeStack: ComputeInfo[];
  hotPaths: HotPath[];
  disposed: boolean;
}

interface CurrentUpdate {
  startTime: number;
  path: string;
  metadata?: UpdateMetadata;
  suppressed?: boolean;
}

interface ComputeInfo {
  id: string;
  startTime: number;
}

interface GuardrailsAPI {
  getReport(): GuardrailsReport;
  getStats(): RuntimeStats;
  reset(): void;
  suppress(fn: () => void): void;
  scoped(intent: UpdateMetadata['intent'], fn: () => void): void;
  dispose(): void;
}

export interface GuardrailsEnhanced {
  __guardrails: GuardrailsAPI;
}

// ============================================
// Export Metadata
// ============================================

export const guardrailsMetadata: EnhancerMetadata = {
  id: 'guardrails',
  name: 'Development Guardrails',
  description: 'Dev-only performance monitoring and anti-pattern detection',
  version: '1.0.0',
  dependencies: [],
  sideEffects: false,
  devOnly: true,
};

// ============================================
// Prebuilt Rules
// ============================================

export const rules = {
  noDeepNesting: (maxDepth = 5): GuardrailRule => ({
    name: 'no-deep-nesting',
    description: `Prevents nesting deeper than ${maxDepth} levels`,
    test: (ctx) => ctx.path.length <= maxDepth,
    message: (ctx) => `Path too deep: ${ctx.path.join('.')} (${ctx.path.length} levels, max: ${maxDepth})`,
    severity: 'warning',
  }),
  
  noFunctionsInState: (): GuardrailRule => ({
    name: 'no-functions',
    description: 'Functions break serialization',
    test: (ctx) => typeof ctx.value !== 'function',
    message: 'Functions cannot be stored in state (breaks serialization)',
    severity: 'error',
  }),
  
  noCacheInPersistence: (): GuardrailRule => ({
    name: 'no-cache-persistence',
    description: 'Prevent cache from being persisted',
    test: (ctx) => {
      if (ctx.path[0] === 'cache' && ctx.metadata?.source === 'serialization') {
        return false;
      }
      return true;
    },
    message: 'Cache should not be persisted',
    severity: 'warning',
  }),
  
  maxPayloadSize: (maxKB = 100): GuardrailRule => ({
    name: 'max-payload-size',
    description: `Limit payload size to ${maxKB}KB`,
    test: (ctx) => {
      const size = JSON.stringify(ctx.value).length / 1024;
      return size <= maxKB;
    },
    message: (ctx) => {
      const size = JSON.stringify(ctx.value).length / 1024;
      return `Payload too large: ${size.toFixed(2)}KB (max: ${maxKB}KB)`;
    },
    severity: 'warning',
  }),
};
