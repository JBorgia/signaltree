/**
 * SignalTree Guardrails - Type Definitions
 * @packageDocumentation
 */

import type { SignalTree } from '@signaltree/core';

export interface GuardrailsConfig<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  /** Behavior mode: warn (console), throw (errors), or silent (collect only) */
  mode?: 'warn' | 'throw' | 'silent';

  /** Enable/disable guardrails */
  enabled?: boolean | (() => boolean);

  /** Change detection strategy */
  changeDetection?: {
    /** Disable PathNotifier (force polling or subscription) */
    disablePathNotifier?: boolean;
  };

  /** Performance budget limits */
  budgets?: {
    /** Max milliseconds per update (default: 16) */
    maxUpdateTime?: number;
    /** Max memory in MB (default: 50) */
    maxMemory?: number;
    /** Max recomputations per second (default: 100) */
    maxRecomputations?: number;
    /** Max tree nesting depth (default: 10) */
    maxTreeDepth?: number;
    /** Alert when % of budget used (default: 0.8) */
    alertThreshold?: number;
  };

  /** Hot path analysis configuration */
  hotPaths?: {
    /** Enable hot path detection */
    enabled?: boolean;
    /** Updates/second to consider "hot" (default: 10) */
    threshold?: number;
    /** Track top N hot paths (default: 5) */
    topN?: number;
    /** Track downstream effects */
    trackDownstream?: boolean;
    /** Time window for rate calculation in ms (default: 1000) */
    windowMs?: number;
  };

  /** Memory leak detection */
  memoryLeaks?: {
    /** Enable memory leak detection */
    enabled?: boolean;
    /** Check interval in ms (default: 5000) */
    checkInterval?: number;
    /** Max signals before warning (default: 100) */
    retentionThreshold?: number;
    /** Growth rate % to trigger warning (default: 0.2) */
    growthRate?: number;
    /** Track signals never read */
    trackUnread?: boolean;
  };

  /** Custom rules */
  customRules?: GuardrailRule<T>[];

  /** Intent-aware suppression */
  suppression?: {
    /** Auto-suppress for these intents */
    autoSuppress?: Array<
      | 'hydrate'
      | 'reset'
      | 'bulk'
      | 'migration'
      | 'time-travel'
      | 'serialization'
    >;
    /** Honor suppressGuardrails metadata flag */
    respectMetadata?: boolean;
  };

  /** Read/write analysis */
  analysis?: {
    /** Forbid reading entire tree root */
    forbidRootRead?: boolean;
    /** Forbid reading slice roots */
    forbidSliceRootRead?: boolean | string[];
    /** Max dependencies per computed */
    maxDepsPerComputed?: number;
    /** Warn on parent replacement */
    warnParentReplace?: boolean;
    /** Min diff ratio to justify parent replace (default: 0.8) */
    minDiffForParentReplace?: number;
    /** Detect thrashing */
    detectThrashing?: boolean;
    /** Max reruns per second before thrashing */
    maxRerunsPerSecond?: number;
  };

  /** Reporting configuration */
  reporting?: {
    /** Report interval in ms (default: 5000) */
    interval?: number;
    /** Console output: false, true, or 'verbose' */
    console?: boolean | 'verbose';
    /** Custom reporter function */
    customReporter?: (report: GuardrailsReport) => void;
    /** Aggregate similar warnings */
    aggregateWarnings?: boolean;
    /** Max issues per report */
    maxIssuesPerReport?: number;
  };

  /** Tree identifier for multi-tree scenarios */
  treeId?: string;
}

export interface UpdateMetadata {
  /** Intent of the update */
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  /** Source of the update */
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  /** Suppress guardrails for this update */
  suppressGuardrails?: boolean;
  /** Timestamp */
  timestamp?: number;
  /** Correlation ID for related updates */
  correlationId?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

export interface GuardrailRule<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  /** Rule name */
  name: string;
  /** Description */
  description?: string;
  /** Test function */
  test: (context: RuleContext<T>) => boolean | Promise<boolean>;
  /** Error message or message function */
  message: string | ((context: RuleContext<T>) => string);
  /** Severity level */
  severity?: 'error' | 'warning' | 'info';
  /** Optional fix function */
  fix?: (context: RuleContext<T>) => void;
  /** Tags for filtering/grouping */
  tags?: string[];
}

export interface RuleContext<
  T extends Record<string, unknown> = Record<string, unknown>
> {
  /** Path to the value */
  path: string[];
  /** New value */
  value: unknown;
  /** Previous value */
  oldValue?: unknown;
  /** Update metadata */
  metadata?: UpdateMetadata;
  /** The tree instance */
  tree: SignalTree<T>;
  /** Update duration in ms */
  duration?: number;
  /** Diff ratio (0-1) */
  diffRatio?: number;
  /** Recomputation count */
  recomputeCount?: number;
  /** Downstream effects count */
  downstreamEffects?: number;
  /** Is signal unread */
  isUnread?: boolean;
  /** Runtime statistics */
  stats: RuntimeStats;
}

export interface RuntimeStats {
  /** Total update count */
  updateCount: number;
  /** Total update time in ms */
  totalUpdateTime: number;
  /** Average update time in ms */
  avgUpdateTime: number;
  /** P50 update time in ms */
  p50UpdateTime: number;
  /** P95 update time in ms */
  p95UpdateTime: number;
  /** P99 update time in ms */
  p99UpdateTime: number;
  /** Max update time in ms */
  maxUpdateTime: number;

  /** Total recomputation count */
  recomputationCount: number;
  /** Recomputations per second */
  recomputationsPerSecond: number;

  /** Total signal count */
  signalCount: number;
  /** Signal retention */
  signalRetention: number;
  /** Unread signal count */
  unreadSignalCount: number;

  /** Memory growth rate */
  memoryGrowthRate: number;

  /** Hot path count */
  hotPathCount: number;
  /** Violation count */
  violationCount: number;
}

export interface GuardrailIssue {
  /** Issue type */
  type: 'budget' | 'hot-path' | 'memory' | 'rule' | 'analysis';
  /** Severity */
  severity: 'error' | 'warning' | 'info';
  /** Message */
  message: string;
  /** Path */
  path?: string;
  /** Occurrence count */
  count: number;
  /** Diff ratio if applicable */
  diffRatio?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface HotPath {
  /** Path */
  path: string;
  /** Updates per second */
  updatesPerSecond: number;
  /** Heat score (0-100) */
  heatScore: number;
  /** Downstream effects count */
  downstreamEffects: number;
  /** Average duration in ms */
  avgDuration: number;
  /** P95 duration in ms */
  p95Duration: number;
}

export interface BudgetStatus {
  /** Update time budget */
  updateTime: BudgetItem;
  /** Memory budget */
  memory: BudgetItem;
  /** Recomputation budget */
  recomputations: BudgetItem;
}

export interface BudgetItem {
  /** Current value */
  current: number;
  /** Budget limit */
  limit: number;
  /** Usage percentage */
  usage: number;
  /** Status */
  status: 'ok' | 'warning' | 'exceeded';
}

export interface GuardrailsReport {
  /** Report timestamp */
  timestamp: number;
  /** Tree ID if configured */
  treeId?: string;
  /** Issues detected */
  issues: GuardrailIssue[];
  /** Hot paths */
  hotPaths: HotPath[];
  /** Budget status */
  budgets: BudgetStatus;
  /** Runtime statistics */
  stats: RuntimeStats;
  /** Recommendations */
  recommendations: string[];
}

export interface GuardrailsAPI {
  /** Get current report */
  getReport(): GuardrailsReport;
  /** Get runtime stats */
  getStats(): RuntimeStats;
  /** Suppress guardrails during function execution */
  suppress(fn: () => void): void;
  /** Dispose and cleanup */
  dispose(): void;
}
