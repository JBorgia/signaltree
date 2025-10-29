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
}

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
  private defaultOptions: Required<DiffOptions> = {
    maxDepth: 100,
    detectDeletions: false,
    ignoreArrayOrder: false,
    equalityFn: (a, b) => a === b,
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

    this.traverse(current, updates, [], changes, visited, opts, 0);

    return {
      changes,
      hasChanges: changes.length > 0,
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
    opts: Required<DiffOptions>,
    depth: number
  ): void {
    // Depth limit
    if (depth > opts.maxDepth) {
      return;
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
      this.diffArrays(curr, upd, path, changes, visited, opts, depth);
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
        this.traverse(
          currObj[key],
          updObj[key],
          [...path, key],
          changes,
          visited,
          opts,
          depth + 1
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
    opts: Required<DiffOptions>,
    depth: number
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
      this.diffArraysOrdered(curr, upd, path, changes, visited, opts, depth);
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
    opts: Required<DiffOptions>,
    depth: number
  ): void {
    // Check each index
    const maxLength = Math.max(curr.length, upd.length);

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
          depth + 1
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
    opts: Required<DiffOptions>
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
