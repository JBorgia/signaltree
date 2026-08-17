/**
 * SignalTree Guardrails - Type Definitions
 * @packageDocumentation
 */

import type { ISignalTree, UpdateMetadata } from '@signaltree/core';

/**
 * Re-export of `UpdateMetadata` lifted to `@signaltree/core` in v9.3.
 *
 * NEW CODE: import directly from `@signaltree/core`. This re-export exists for
 * backwards compatibility with consumers that imported it from
 * `@signaltree/guardrails`. It will be removed in a future minor release.
 *
 * @deprecated Import `UpdateMetadata` from `@signaltree/core` instead.
 */
export type { UpdateMetadata };

/**
 * Eleven members were REMOVED from this file in 14.1.2:
 * `budgets.maxTreeDepth`, `budgets.alertThreshold`, `hotPaths.trackDownstream`,
 * `memory.trackUnread`, `analysis.forbidRootRead`, `analysis.forbidSliceRootRead`,
 * `analysis.maxDepsPerComputed`, `analysis.detectThrashing`,
 * `analysis.maxRerunsPerSecond`, and `RuleContext.recomputeCount` / `.isUnread`.
 *
 * None was ever read by any code in this workspace. They type-checked, read as
 * working monitoring config, and did nothing — the same silent-no-op class as
 * `suppression` (now implemented) and core's dead `TreeConfig` flags (now
 * removed). Nothing can regress: there was no behaviour to lose.
 *
 * They are deleted rather than implemented on purpose. Speculatively building
 * nine monitoring features is the mechanism that produced this set in the first
 * place; re-add any one of them together with its implementation and a test
 * when there is a caller who wants it. `tools/check-dead-type-surface.mjs`
 * fails the build if a replacement arrives without one.
 */
export interface GuardrailsConfig<T = Record<string, unknown>> {
  /** Behavior mode: warn (console), throw (errors), or silent (collect only) */
  mode?: 'warn' | 'throw' | 'silent';

  /**
   * Enable/disable guardrails.
   *
   * Omitted (default): guardrails run in dev builds only and are a no-op in
   * production. Explicitly set, this overrides the environment check —
   * `enabled: true` runs guardrails even in production builds (demos,
   * staging diagnostics), `enabled: false` disables them everywhere.
   */
  enabled?: boolean | (() => boolean);

  /** Change detection strategy */
  changeDetection?: {
    /**
     * Disable PathNotifier (force polling or subscription).
     *
     * The PathNotifier only fires for entity-collection writes (plus plain
     * leaf writes when devtools is attached) — for plain-object trees the
     * default strategy is change-blind. Set `true` to force polling there.
     */
    disablePathNotifier?: boolean;

    /**
     * Freeze each state snapshot, so an in-place mutation THROWS where it
     * happens instead of being noticed on a later poll.
     *
     * Off by default, because it makes dev behave differently from production —
     * the same reason NgRx ships `strictStateImmutability` opt-in.
     *
     * Everything else here detects an in-place mutation (`tree.$.rows().push(x)`,
     * which notifies nothing) up to one poll interval later, and infers its path
     * by diffing. Freezing turns that into a `TypeError` on the mutating line
     * with a real stack — strictly better information, and it enforces a
     * contract the library already documents: a `tree()` snapshot is read-only.
     *
     * With this on, per-container copying is skipped entirely: nothing can
     * mutate in place without throwing first, so there is nothing to compare
     * against, and guardrails stops paying for the copies.
     *
     * The catch, and the reason it is opt-in: the snapshot SHARES leaf values
     * with what you passed in. Freezing `tree.$.rows()` freezes the array you
     * handed to `.set()`. If your own code reuses and mutates that array, it
     * will now throw — which is the bug, but it is your call whether to find it
     * this way.
     */
    strictImmutability?: boolean;
  };

  /** Performance budget limits */
  budgets?: {
    /** Max milliseconds per update (default: 16) */
    maxUpdateTime?: number;
    /** Max memory in MB (default: 50) */
    maxMemory?: number;
  };

  /** Hot path analysis configuration */
  hotPaths?: {
    /** Enable hot path detection */
    enabled?: boolean;
    /** Updates/second to consider "hot" (default: 10) */
    threshold?: number;
    /** Track top N hot paths (default: 5) */
    topN?: number;
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
    /** Warn on parent replacement */
    warnParentReplace?: boolean;
    /** Min diff ratio to justify parent replace (default: 0.8) */
    minDiffForParentReplace?: number;
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

export interface GuardrailRule<T = Record<string, unknown>> {
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

export interface RuleContext<T = Record<string, unknown>> {
  /** Path to the value */
  path: string[];
  /** New value */
  value: unknown;
  /** Previous value */
  oldValue?: unknown;
  /** Update metadata */
  metadata?: UpdateMetadata;
  /** The tree instance */
  tree: ISignalTree<T>;
  /** Update duration in ms */
  duration?: number;
  /** Diff ratio (0-1) */
  diffRatio?: number;
  /** Downstream effects count */
  downstreamEffects?: number;
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
