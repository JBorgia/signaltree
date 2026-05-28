import { signal } from '@angular/core';
import {
  interceptLeafSignals,
  type ISignalTree,
  type UpdateMetadata,
} from '@signaltree/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { SchemaConfig, SchemaMethods } from './types';
import type { Registry, SchemaEntry } from './internals/state';
import { WILDCARD } from './internals/state';
import {
  compilePattern,
  enumerateLeafPaths,
  readTreeAtPath,
  matchLeaf,
  matchAncestors,
} from './internals/matcher';
import { routeWrite, dispatchLeafRun, applyLeafVerdict } from './internals/leaf-handler';
import { dispatchAncestorRun } from './internals/ancestor-handler';
import { errorsAt, isValidAt, isPendingAt } from './internals/signal-cache';
import { createAggregates } from './internals/aggregates';
import { compact } from './internals/compact';
import { ensurePathState, addPendingPath, removePendingPath } from './internals/state';
import { resultToMessage, defaultFormatIssue } from './internals/issue-mapper';

/**
 * Create the `schema()` enhancer — schema-driven validation for SignalTree.
 *
 * Registers StandardSchema-compatible schemas against dotted leaf paths and
 * exposes per-path + tree-wide error signals. Observe-only: never blocks writes.
 *
 * @example Basic usage
 * ```ts
 * import { signalTree } from '@signaltree/core';
 * import { schema } from '@signaltree/schema';
 * import { z } from 'zod';
 *
 * const tree = signalTree({ user: { email: '', age: 0 } }).with(
 *   schema({
 *     schemas: {
 *       'user.email': z.string().email(),
 *       'user.age': z.number().int().min(0),
 *     },
 *   })
 * );
 *
 * tree.$.user.email.set('not-an-email');
 * tree.schema.errorsAt('user.email')(); // 'Invalid email'
 * tree.schema.isValid(); // false
 * ```
 *
 * @public
 */
export function schema(
  config: SchemaConfig
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & SchemaMethods {
  return function <T>(tree: ISignalTree<T>): ISignalTree<T> & SchemaMethods {
    const entries = compileEntries(config);
    const registry: Registry = {
      entries,
      leafOwner: new Map(),
      pathStates: new Map(),
      errorsAtCache: new Map(),
      isValidAtCache: new Map(),
      isPendingAtCache: new Map(),
      invalidCount: signal(0),
      activeAncestorRuns: new Map(),
      nextAncestorRunId: 0,
      pendingPathsSignal: signal<readonly string[]>([]),
      boundPathsSignal: signal<readonly string[]>([]),
      boundPathsSet: new Set(),
      pendingPathsSet: new Set(),
      config,
    };

    const aggregates = createAggregates(registry);
    const treeRoot = (tree as unknown as { $: unknown }).$;

    // Attach leaf interceptor — writes route through routeWrite, which fans
    // out to leaf + ancestor dispatchers. Explicit param types here because
    // core's published .d.ts strips inference for this internal symbol.
    const restoreInterceptor = interceptLeafSignals(
      treeRoot,
      (path: string, next: unknown, _prev: unknown, meta?: UpdateMetadata) => {
        routeWrite(registry, treeRoot, path, next, meta);
      },
    );

    // Optional: initial validation pass.
    if (config.validateOnAttach !== false) {
      initialValidation(registry, treeRoot);
    }

    // Lifecycle: tear down on tree.destroy().
    const originalDestroy = tree.destroy?.bind(tree);
    tree.destroy = () => {
      restoreInterceptor();
      if (originalDestroy) originalDestroy();
    };

    // Build the method namespace.
    const methods: SchemaMethods['schema'] = {
      errors: aggregates.errors,
      errorList: aggregates.errorList,
      isValid: aggregates.isValid,
      pending: aggregates.pending,
      pendingPaths: registry.pendingPathsSignal,

      errorsAt: (path) => errorsAt(registry, path),
      isValidAt: (path) => isValidAt(registry, path),
      isPendingAt: (path) => isPendingAt(registry, path),

      validate: () => validateAll(registry, treeRoot),
      validatePath: (path) => validateOnePath(registry, treeRoot, path),
      compact: () => compact(registry, treeRoot),

      schemaFor: (leafPath) => {
        const owner = matchLeaf(registry, leafPath);
        return owner?.schema;
      },
      boundPaths: registry.boundPathsSignal,
    };

    (tree as unknown as Record<string, unknown>)['schema'] = methods;
    return tree as ISignalTree<T> & SchemaMethods;
  };
}

/**
 * Compile every entry from `config.schemas` into a `SchemaEntry`.
 */
function compileEntries(config: SchemaConfig): SchemaEntry[] {
  const entries: SchemaEntry[] = [];
  for (const [pattern, schema] of Object.entries(config.schemas)) {
    const segments = compilePattern(pattern);
    entries.push({
      pattern,
      schema,
      isWildcard: segments.includes(WILDCARD),
      // Conservative: classified dynamically at match time; leave both
      // possibilities open. Lookups that need a definitive answer compute
      // the comparison inline against the leaf path's length.
      isAncestor: false,
      segments,
    });
  }
  return entries;
}

/**
 * Initial validation pass at attach: walk every leaf under the tree root,
 * resolve each via `matchLeaf` (which lazily binds paths and dispatches the
 * owning schema). Dispatches one run per bound leaf via the same path the
 * runtime write router uses, except synchronously and without a write context.
 *
 * Also fires any ancestor schemas whose pattern matches a known prefix.
 */
function initialValidation(registry: Registry, treeRoot: unknown): void {
  const rootValue = readTreeAtPath(treeRoot, '');
  const allLeaves = enumerateLeafPaths(rootValue, '');
  const ancestorPathsToRun = new Set<string>();

  for (const leafPath of allLeaves) {
    const owner = matchLeaf(registry, leafPath);
    if (!owner) continue;
    const leafLen = leafPath === '' ? 0 : leafPath.split('.').length;

    if (owner.segments.length === leafLen) {
      // Leaf-targeted dispatch.
      const value = readTreeAtPath(treeRoot, leafPath);
      dispatchLeafRun(registry, owner, leafPath, value);
    }

    // Ancestor schemas that cover this leaf.
    for (const { entry, ancestorPath } of matchAncestors(registry, leafPath)) {
      ancestorPathsToRun.add(`${entry.pattern}::${ancestorPath}`);
      // Deduped dispatch below.
      _scheduleAncestorRun(registry, treeRoot, entry, ancestorPath, ancestorPathsToRun);
    }
  }
}

const _ancestorScheduled = new WeakMap<Registry, Set<string>>();

function _scheduleAncestorRun(
  registry: Registry,
  treeRoot: unknown,
  entry: SchemaEntry,
  ancestorPath: string,
  _dedupHint: Set<string>
): void {
  // Dedup per (registry, entry, ancestorPath): only dispatch once per attach.
  let scheduled = _ancestorScheduled.get(registry);
  if (!scheduled) {
    scheduled = new Set();
    _ancestorScheduled.set(registry, scheduled);
  }
  const key = `${entry.pattern}::${ancestorPath}`;
  if (scheduled.has(key)) return;
  scheduled.add(key);
  // Initial validation is fire-and-forget; async ancestor schemas settle on
  // their own and their verdicts populate `errors` after the next microtask.
  void dispatchAncestorRun(registry, treeRoot, entry, ancestorPath);
}

/**
 * `validate()` — re-run every registered schema against the current tree.
 *
 * Bumps the version on every owned leaf, then dispatches fresh runs. Awaits
 * settle of all dispatched (async) runs; resolves to the current `isValid()`.
 *
 * Supersede-not-cancel semantics: any in-flight runs are orphaned but still
 * complete (their verdicts get dropped on settle via the staleness check).
 *
 * @internal — exposed as `tree.validation.validate()`
 */
async function validateAll(registry: Registry, treeRoot: unknown): Promise<boolean> {
  const promises: Promise<unknown>[] = [];

  for (const entry of registry.entries) {
    if (entry.isWildcard) {
      // Wildcard: re-run for every currently-bound path that this entry owns.
      for (const path of registry.boundPathsSet) {
        const owner = matchLeaf(registry, path);
        if (owner === entry) {
          promises.push(runOnePathForEntry(registry, treeRoot, entry, path));
        }
      }
      continue;
    }

    // Non-wildcard: a single literal path. Decide leaf vs ancestor by reading.
    const pathSegs = entry.segments.length;
    const literalPath = entry.segments.join('.');
    promises.push(runOneLiteralEntry(registry, treeRoot, entry, literalPath, pathSegs));
  }

  await Promise.all(promises);
  return registry.invalidCount() === 0;
}

async function runOnePathForEntry(
  registry: Registry,
  treeRoot: unknown,
  entry: SchemaEntry,
  leafPath: string
): Promise<void> {
  const leafLen = leafPath === '' ? 0 : leafPath.split('.').length;
  if (entry.segments.length === leafLen) {
    const value = readTreeAtPath(treeRoot, leafPath);
    await runLeafAwait(registry, entry, leafPath, value);
  } else {
    // Ancestor for this leaf's prefix.
    const ancestorPath = leafPath.split('.').slice(0, entry.segments.length).join('.');
    await Promise.resolve(dispatchAncestorRun(registry, treeRoot, entry, ancestorPath));
  }
}

async function runOneLiteralEntry(
  registry: Registry,
  treeRoot: unknown,
  entry: SchemaEntry,
  literalPath: string,
  patternSegs: number
): Promise<void> {
  const value = readTreeAtPath(treeRoot, literalPath);

  // If literalPath resolves to a plain non-leaf object, treat as ancestor.
  if (isAncestorTarget(value)) {
    await Promise.resolve(dispatchAncestorRun(registry, treeRoot, entry, literalPath));
    return;
  }

  // Otherwise, dispatch as leaf.
  void patternSegs;
  await runLeafAwait(registry, entry, literalPath, value);
}

function isAncestorTarget(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date || value instanceof Map || value instanceof Set) return false;
  return true;
}

/**
 * Run a single leaf-targeted schema awaitably. Same write-sequence semantics
 * as `dispatchLeafRun`, but the returned promise resolves when the leaf's
 * verdict has been applied (or dropped due to a newer run superseding it).
 */
function runLeafAwait(
  registry: Registry,
  entry: SchemaEntry,
  path: string,
  next: unknown
): Promise<void> {
  const state = ensurePathState(registry, path);
  const myVersion = ++state.version;
  const formatIssue = registry.config.formatIssue ?? defaultFormatIssue;

  let result: StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>;
  try {
    result = entry.schema['~standard'].validate(next);
  } catch (err) {
    applyLeafVerdict(registry, state, path, runtimeErrorMessage(err));
    return Promise.resolve();
  }

  if (!(result instanceof Promise)) {
    applyLeafVerdict(registry, state, path, resultToMessage(result, path, formatIssue));
    return Promise.resolve();
  }

  state.inFlightVersion = myVersion;
  state.pendingSignal.set(true);
  // R3 fix: also update the aggregate pendingPathsSet — without this,
  // tree.schema.pending() lies during await validate() on async schemas.
  addPendingPath(registry, path);
  return result.then(
    (settled) => {
      if (state.inFlightVersion !== myVersion) return;
      state.inFlightVersion = null;
      applyLeafVerdict(registry, state, path, resultToMessage(settled, path, formatIssue));
      state.pendingSignal.set(false);
      removePendingPath(registry, path);
    },
    (err: unknown) => {
      if (state.inFlightVersion !== myVersion) return;
      state.inFlightVersion = null;
      applyLeafVerdict(registry, state, path, runtimeErrorMessage(err));
      state.pendingSignal.set(false);
      removePendingPath(registry, path);
    }
  );
}

async function validateOnePath(
  registry: Registry,
  treeRoot: unknown,
  path: string
): Promise<boolean> {
  const owner = matchLeaf(registry, path);
  if (!owner) return registry.invalidCount() === 0;
  await runOnePathForEntry(registry, treeRoot, owner, path);
  return registry.invalidCount() === 0;
}

function runtimeErrorMessage(err: unknown): string {
  return `validation runtime error: ${String(err instanceof Error ? err.message : err)}`;
}
