import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { UpdateMetadata } from '@signaltree/core';

import type { Registry, PathState, SchemaEntry } from './state';
import { ensurePathState, addPendingPath, removePendingPath } from './state';
import { matchLeaf, matchAncestors } from './matcher';
import { resultToMessage, defaultFormatIssue } from './issue-mapper';
import { dispatchAncestorRun } from './ancestor-handler';

/**
 * Top-level write dispatcher. Called by the leaf-signal interceptor on every
 * tree leaf write.
 *
 * A single write can match BOTH a specific schema (which owns the exact leaf
 * path) AND one or more ancestor schemas (which own sibling leaves under a
 * common prefix). The router fans out to both.
 *
 * Suppression is checked once at the router, not per dispatched run.
 *
 * @internal
 */
export function routeWrite(
  registry: Registry,
  treeRoot: unknown,
  path: string,
  next: unknown,
  meta?: UpdateMetadata
): void {
  // Suppression checks — applied once at the router.
  if (meta?.intent && registry.config.suppressIntents?.includes(meta.intent)) {
    return;
  }
  if (meta?.source && registry.config.suppressSources?.includes(meta.source)) {
    return;
  }
  if (meta?.suppressGuardrails) return;

  // (1) Specific-schema dispatch for the exact leaf path, if any.
  //     matchLeaf returns the owner per D4 precedence. Skip if the owning
  //     entry is an ancestor (those are handled by step 2).
  const leafEntry = matchLeaf(registry, path);
  if (leafEntry && isLeafLengthMatch(leafEntry, path)) {
    dispatchLeafRun(registry, leafEntry, path, next);
  }

  // (2) Ancestor dispatch for every ancestor schema whose pattern is a
  //     strict prefix of `path`. Disjoint from (1) per D4.
  //     `void` operator explicitly discards the optional returned promise —
  //     write-path is fire-and-forget; only validate() awaits the settle.
  for (const { entry, ancestorPath } of matchAncestors(registry, path)) {
    void dispatchAncestorRun(registry, treeRoot, entry, ancestorPath);
  }
}

/**
 * True iff the entry's pattern matches the leaf at exact length (i.e., it's
 * the leaf-targeted schema, not an ancestor schema).
 */
function isLeafLengthMatch(entry: SchemaEntry, leafPath: string): boolean {
  const leafLen = leafPath === '' ? 0 : leafPath.split('.').length;
  return entry.segments.length === leafLen;
}

/**
 * Run a leaf-targeted schema against the new value. Sync schemas apply
 * verdicts synchronously; async schemas go through the write-sequence guard.
 *
 * @internal
 */
export function dispatchLeafRun(
  registry: Registry,
  entry: SchemaEntry,
  path: string,
  next: unknown
): void {
  const state = ensurePathState(registry, path);
  const myVersion = ++state.version;

  let result: StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>;
  try {
    result = entry.schema['~standard'].validate(next);
  } catch (err) {
    applyLeafVerdict(registry, state, path, runtimeErrorMessage(err));
    return;
  }

  // Sync fast-path. Eliminates microtask delay for sync schemas — important
  // so a same-tick `isValid()` read after a write returns the correct verdict
  // (and so `validateOnAttach: true` populates errors synchronously).
  if (!(result instanceof Promise)) {
    applyLeafVerdict(
      registry,
      state,
      path,
      resultToMessage(result, path, registry.config.formatIssue ?? defaultFormatIssue)
    );
    return;
  }

  // Async path with write-sequence guard.
  state.inFlightVersion = myVersion;
  state.pendingSignal.set(true);
  addPendingPath(registry, path);

  result.then(
    (settled) => {
      if (state.inFlightVersion !== myVersion) return; // superseded, drop
      state.inFlightVersion = null;
      applyLeafVerdict(
        registry,
        state,
        path,
        resultToMessage(settled, path, registry.config.formatIssue ?? defaultFormatIssue)
      );
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

/**
 * Apply a verdict to a leaf path. Maintains the O(1) invalid-count counter
 * for `isValid` and invokes the `onError` reporter in `'warn'` mode.
 *
 * Both leaf-dispatch and ancestor-dispatch paths funnel through this function
 * so the invalid-count stays consistent across both.
 *
 * @internal
 */
export function applyLeafVerdict(
  registry: Registry,
  state: PathState,
  path: string,
  msg: string | null
): void {
  const wasInvalid = state.lastSettledError !== null;
  const nowInvalid = msg !== null;
  if (wasInvalid !== nowInvalid) {
    registry.invalidCount.update((c) => c + (nowInvalid ? 1 : -1));
  }

  state.lastSettledError = msg;
  state.errorSignal.set(msg);

  if (msg && registry.config.mode === 'warn') {
    (registry.config.onError ?? defaultWarn)(path, msg);
  }
}

function runtimeErrorMessage(err: unknown): string {
  return `validation runtime error: ${String(err instanceof Error ? err.message : err)}`;
}

function defaultWarn(path: string, message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`[validation] ${path}: ${message}`);
}
