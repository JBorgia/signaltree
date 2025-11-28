/**
 * DiffEngine - Efficient change detection for tree updates
 * @packageDocumentation
 */

import type { Path } from './path-index';

/**
 * Type of change detected
 */
export enum ChangeType {
  ADD = 'add',
  UPDATE = 'update',
  DELETE = 'delete',
  REPLACE = 'replace',
}

/**
 * A detected change
 */
export interface Change {
  /** Type of change */
  type: ChangeType;

  /** Path to the changed value */
  path: Path;

  /** New value */
  value?: unknown;

  /** Old value (for updates/deletes) */
  oldValue?: unknown;
}

/**
 * Diff result
 */
export interface Diff {
  /** List of changes */
  changes: Change[];

  /** Whether any changes were detected */
  hasChanges: boolean;

  /** Optional instrumentation metrics when enabled */
  instrumentation?: {
    elementComparisons: number;
    prefixFastPathHits: number;
    wholeArrayReplaceHits: number;
    traversals: number;
    suffixFastPathHits: number;
    segmentSkips: number;
    samplesTaken: number;
  };
}

/**
 * Configuration for diff operation
 */
export interface DiffOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;

  /** Whether to detect deletions */
  detectDeletions?: boolean;

  /** Whether to ignore array order */
  ignoreArrayOrder?: boolean;

  /** Custom equality function */
  equalityFn?: (a: unknown, b: unknown) => boolean;

  /** Optional key validator for security (e.g., to prevent prototype pollution) */
  keyValidator?: (key: string) => boolean;

  /** Enable instrumentation for diff performance analysis */
  instrumentation?: boolean;
}

/**
 * Internal resolved options with required fields
 */
type ResolvedDiffOptions = Required<Omit<DiffOptions, 'keyValidator'>> & {
  keyValidator?: (key: string) => boolean;
};

/**
 * DiffEngine
 *
 * Efficiently detects changes between two objects to minimize unnecessary updates.
 *
 * Features:
 * - Deep object comparison
 * - Circular reference detection
 * - Configurable equality checking
 * - Array diffing (ordered and unordered)
 * - Path tracking for precise updates
 *
 * @example
 * ```ts
 * const engine = new DiffEngine();
 *
 * const current = { user: { name: 'Alice', age: 30 } };
 * const updates = { user: { name: 'Alice', age: 31 } };
 *
 * const diff = engine.diff(current, updates);
 *
 * console.log(diff.changes);
 * // [{ type: 'update', path: ['user', 'age'], value: 31, oldValue: 30 }]
 * ```
 */
export class DiffEngine {
  private defaultOptions: ResolvedDiffOptions = {
    maxDepth: 100,
    detectDeletions: false,
    ignoreArrayOrder: false,
    equalityFn: (a, b) => a === b,
    keyValidator: undefined,
    instrumentation: false,
  };

  /**
   * Diff two objects and return changes
   *
   * @param current - Current state
   * @param updates - Updated state
   * @param options - Diff options
   * @returns Diff result with all changes
   */
  diff(current: unknown, updates: unknown, options: DiffOptions = {}): Diff {
    const opts = { ...this.defaultOptions, ...options };
    const changes: Change[] = [];
    const visited = new WeakSet();
    const metrics = {
      elementComparisons: 0,
      prefixFastPathHits: 0,
      wholeArrayReplaceHits: 0,
      traversals: 0,
      suffixFastPathHits: 0,
      segmentSkips: 0,
      samplesTaken: 0,
    };
    this.traverse(current, updates, [], changes, visited, opts, 0, metrics);

    return {
      changes,
      hasChanges: changes.length > 0,
      instrumentation: opts.instrumentation ? metrics : undefined,
    };
  }

  /**
   * Traverse and compare objects recursively
   */
  private traverse(
    curr: unknown,
    upd: unknown,
    path: Path,
    changes: Change[],
    visited: WeakSet<object>,
    opts: ResolvedDiffOptions,
    depth: number,
    metrics: {
      elementComparisons: number;
      prefixFastPathHits: number;
      wholeArrayReplaceHits: number;
      traversals: number;
    }
  ): void {
    if (opts.instrumentation) metrics.traversals++;
    // Depth limit
    if (depth > opts.maxDepth) {
      return;
    }

    // Fast path: identical reference (common in unchanged subtrees after batching)
    if (curr === upd) {
      return; // No change anywhere below
    }

    // Handle primitives
    if (typeof upd !== 'object' || upd === null) {
      if (!opts.equalityFn(curr, upd)) {
        changes.push({
          type: curr === undefined ? ChangeType.ADD : ChangeType.UPDATE,
          path: [...path],
          value: upd,
          oldValue: curr,
        });
      }
      return;
    }

    // Circular reference detection
    if (visited.has(upd)) {
      return;
    }
    visited.add(upd);

    // Handle arrays
    if (Array.isArray(upd)) {
      this.diffArrays(curr, upd, path, changes, visited, opts, depth, metrics);
      return;
    }

    // Handle objects
    if (!curr || typeof curr !== 'object' || Array.isArray(curr)) {
      // Type mismatch - replace entire subtree
      changes.push({
        type: ChangeType.REPLACE,
        path: [...path],
        value: upd,
        oldValue: curr,
      });
      return;
    }

    // Diff object properties
    const currObj = curr as Record<string, unknown>;
    const updObj = upd as Record<string, unknown>;

    for (const key in updObj) {
      if (Object.prototype.hasOwnProperty.call(updObj, key)) {
        // Validate key for security (e.g., prevent prototype pollution)
        if (opts.keyValidator && !opts.keyValidator(key)) {
          // Skip dangerous keys silently
          continue;
        }

        this.traverse(
          currObj[key],
          updObj[key],
          [...path, key],
          changes,
          visited,
          opts,
          depth + 1,
          metrics
        );
      }
    }

    // Check for deletions if enabled
    if (opts.detectDeletions) {
      for (const key in currObj) {
        if (
          Object.prototype.hasOwnProperty.call(currObj, key) &&
          !(key in updObj)
        ) {
          changes.push({
            type: ChangeType.DELETE,
            path: [...path, key],
            oldValue: currObj[key],
          });
        }
      }
    }
  }

  /**
   * Diff arrays
   */
  private diffArrays(
    curr: unknown,
    upd: unknown[],
    path: Path,
    changes: Change[],
    visited: WeakSet<object>,
    opts: ResolvedDiffOptions,
    depth: number,
    metrics: {
      elementComparisons: number;
      prefixFastPathHits: number;
      wholeArrayReplaceHits: number;
      traversals: number;
    }
  ): void {
    if (!Array.isArray(curr)) {
      // Not an array - replace
      changes.push({
        type: ChangeType.REPLACE,
        path: [...path],
        value: upd,
        oldValue: curr,
      });
      return;
    }

    if (opts.ignoreArrayOrder) {
      this.diffArraysUnordered(curr, upd, path, changes, opts);
    } else {
      this.diffArraysOrdered(
        curr,
        upd,
        path,
        changes,
        visited,
        opts,
        depth,
        metrics
      );
    }
  }

  /**
   * Diff arrays in order (index-based)
   */
  private diffArraysOrdered(
    curr: unknown[],
    upd: unknown[],
    path: Path,
    changes: Change[],
    visited: WeakSet<object>,
    opts: ResolvedDiffOptions,
    depth: number,
    metrics: {
      elementComparisons: number;
      prefixFastPathHits: number;
      wholeArrayReplaceHits: number;
      traversals: number;
    }
  ): void {
    // Fast path: same reference or trivially identical contents
    if (curr === upd) {
      return;
    }
    if (curr.length === upd.length) {
      let identical = true;
      for (let i = 0; i < curr.length; i++) {
        if (opts.instrumentation) metrics.elementComparisons++;
        if (curr[i] !== upd[i]) {
          identical = false;
          break;
        }
      }
      if (identical) return; // element-wise identical
    }
    const currLen = curr.length;
    const updLen = upd.length;
    const minLen = Math.min(currLen, updLen);

    // Prefix fast path for push/pop style mutations
    if (minLen > 0) {
      let prefixIdentical = true;
      for (let i = 0; i < minLen; i++) {
        if (opts.instrumentation) metrics.elementComparisons++;
        if (curr[i] !== upd[i]) {
          prefixIdentical = false;
          break;
        }
      }
      if (prefixIdentical && currLen !== updLen) {
        if (opts.instrumentation) metrics.prefixFastPathHits++;
        if (updLen > currLen) {
          for (let i = currLen; i < updLen; i++) {
            changes.push({
              type: ChangeType.ADD,
              path: [...path, i],
              value: upd[i],
            });
          }
        } else if (currLen > updLen && opts.detectDeletions) {
          for (let i = updLen; i < currLen; i++) {
            changes.push({
              type: ChangeType.DELETE,
              path: [...path, i],
              oldValue: curr[i],
            });
          }
        }
        return;
      }
    }

    // Large array heuristic: whole-array replace if many mismatches
    const LARGE_ARRAY_THRESHOLD = 1024;
    const REPLACE_MISMATCH_RATIO = 0.4;
    if (
      currLen >= LARGE_ARRAY_THRESHOLD &&
      updLen >= LARGE_ARRAY_THRESHOLD &&
      currLen === updLen
    ) {
      let mismatches = 0;
      for (let i = 0; i < currLen; i++) {
        if (opts.instrumentation) metrics.elementComparisons++;
        if (curr[i] !== upd[i]) {
          mismatches++;
          if (mismatches / currLen > REPLACE_MISMATCH_RATIO) {
            changes.push({
              type: ChangeType.REPLACE,
              path: [...path],
              value: upd,
              oldValue: curr,
            });
            if (opts.instrumentation) metrics.wholeArrayReplaceHits++;
            return;
          }
        }
      }
    }

    // Check each index
    const maxLength = Math.max(currLen, updLen);
    for (let i = 0; i < maxLength; i++) {
      if (i >= upd.length) {
        // Deletion (if enabled)
        if (opts.detectDeletions) {
          changes.push({
            type: ChangeType.DELETE,
            path: [...path, i],
            oldValue: curr[i],
          });
        }
      } else if (i >= curr.length) {
        // Addition
        changes.push({
          type: ChangeType.ADD,
          path: [...path, i],
          value: upd[i],
        });
      } else {
        // Potential update
        this.traverse(
          curr[i],
          upd[i],
          [...path, i],
          changes,
          visited,
          opts,
          depth + 1,
          metrics
        );
      }
    }
  }

  /**
   * Diff arrays ignoring order (value-based)
   */
  private diffArraysUnordered(
    curr: unknown[],
    upd: unknown[],
    path: Path,
    changes: Change[],
    opts: ResolvedDiffOptions
  ): void {
    // Build value sets
    const currSet = new Set(curr.map((v) => this.stringify(v)));
    const updSet = new Set(upd.map((v) => this.stringify(v)));

    // Find additions
    upd.forEach((value, index) => {
      const str = this.stringify(value);
      if (!currSet.has(str)) {
        changes.push({
          type: ChangeType.ADD,
          path: [...path, index],
          value,
        });
      }
    });

    // Find deletions (if enabled)
    if (opts.detectDeletions) {
      curr.forEach((value, index) => {
        const str = this.stringify(value);
        if (!updSet.has(str)) {
          changes.push({
            type: ChangeType.DELETE,
            path: [...path, index],
            oldValue: value,
          });
        }
      });
    }
  }

  /**
   * Stringify value for set comparison
   */
  private stringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
