import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { Registry, SchemaEntry, AncestorRunRecord } from './state';
import { ensurePathState, addPendingPath, removePendingPath } from './state';
import { collectOwnedLeaves, readTreeAtPath } from './matcher';
import { issueToLeafPath, defaultFormatIssue } from './issue-mapper';
import { applyLeafVerdict } from './leaf-handler';

/**
 * Dispatch an ancestor schema run. Captures the version of every owned leaf
 * at dispatch time so per-leaf staleness can be checked when the run settles.
 *
 * Per D4 fixed precedence: the ancestor only writes/clears verdicts for
 * leaves no more-specific schema claims. Issues for specific-owned leaves
 * are dropped.
 *
 * @internal
 */
export function dispatchAncestorRun(
  registry: Registry,
  treeRoot: unknown,
  entry: SchemaEntry,
  ancestorPath: string
): Promise<void> | void {
  const ancestorValue = readTreeAtPath(treeRoot, ancestorPath);
  const ownedLeaves = new Set(
    collectOwnedLeaves(registry, entry, ancestorPath, ancestorValue)
  );

  // Capture each owned leaf's version at dispatch.
  const capturedVersions = new Map<string, number>();
  for (const leaf of ownedLeaves) {
    capturedVersions.set(leaf, ensurePathState(registry, leaf).version);
  }

  const runId = ++registry.nextAncestorRunId;
  const record: AncestorRunRecord = {
    runId,
    capturedVersions,
    ownedLeaves,
  };
  registry.activeAncestorRuns.set(ancestorPath, record);

  // Mark each owned leaf pending if we're going async. Determined after
  // calling validate() — until then assume sync; flip to pending if a Promise
  // comes back. This avoids spurious pending flicker for sync ancestor schemas.

  let result: StandardSchemaV1.Result<unknown> | Promise<StandardSchemaV1.Result<unknown>>;
  try {
    result = entry.schema['~standard'].validate(ancestorValue);
  } catch (err) {
    applyAncestorVerdict(
      registry,
      entry,
      ancestorPath,
      ownedLeaves,
      capturedVersions,
      { issues: [{ message: runtimeErrorMessage(err) }] } as StandardSchemaV1.FailureResult,
      /* fromRuntimeError= */ true
    );
    registry.activeAncestorRuns.delete(ancestorPath);
    return;
  }

  if (!(result instanceof Promise)) {
    applyAncestorVerdict(
      registry,
      entry,
      ancestorPath,
      ownedLeaves,
      capturedVersions,
      result,
      false
    );
    registry.activeAncestorRuns.delete(ancestorPath);
    return;
  }

  // Async — mark owned leaves pending.
  for (const leaf of ownedLeaves) {
    const state = ensurePathState(registry, leaf);
    state.pendingSignal.set(true);
    addPendingPath(registry, leaf);
  }

  // Return the .then chain so callers (validate()) can await the settle.
  // Write-path callers (routeWrite) should `void` the result explicitly.
  return result.then(
    (settled) => {
      applyAncestorVerdict(
        registry,
        entry,
        ancestorPath,
        ownedLeaves,
        capturedVersions,
        settled,
        false
      );
      // Clear pending for owned leaves whose pending was set by THIS run.
      // (Other runs may also be pending; we only clear if no in-flight leaf
      // run still owns the path.)
      for (const leaf of ownedLeaves) {
        const state = ensurePathState(registry, leaf);
        if (state.inFlightVersion === null) {
          state.pendingSignal.set(false);
          removePendingPath(registry, leaf);
        }
      }
      // Only delete the active-run record if it's still ours (a newer run
      // for the same ancestorPath could have replaced it).
      if (registry.activeAncestorRuns.get(ancestorPath)?.runId === runId) {
        registry.activeAncestorRuns.delete(ancestorPath);
      }
    },
    (err: unknown) => {
      applyAncestorVerdict(
        registry,
        entry,
        ancestorPath,
        ownedLeaves,
        capturedVersions,
        { issues: [{ message: runtimeErrorMessage(err) }] } as StandardSchemaV1.FailureResult,
        true
      );
      for (const leaf of ownedLeaves) {
        const state = ensurePathState(registry, leaf);
        if (state.inFlightVersion === null) {
          state.pendingSignal.set(false);
          removePendingPath(registry, leaf);
        }
      }
      if (registry.activeAncestorRuns.get(ancestorPath)?.runId === runId) {
        registry.activeAncestorRuns.delete(ancestorPath);
      }
    }
  );
}

/**
 * Distribute issues from an ancestor run to owned leaves. Each leaf gets a
 * per-leaf staleness check before its verdict is applied — a leaf whose
 * version has advanced since dispatch is left untouched.
 *
 * Issues for non-owned leaves (specific schema owns them per D4) are dropped.
 *
 * Owned leaves with no issue reported get cleared (null verdict), with the
 * same staleness check.
 *
 * @internal
 */
function applyAncestorVerdict(
  registry: Registry,
  _entry: SchemaEntry,
  ancestorPath: string,
  ownedLeaves: ReadonlySet<string>,
  capturedVersions: ReadonlyMap<string, number>,
  result: StandardSchemaV1.Result<unknown>,
  fromRuntimeError: boolean
): void {
  const formatIssue = registry.config.formatIssue ?? defaultFormatIssue;

  if ('issues' in result && result.issues && result.issues.length > 0) {
    const reported = new Set<string>();

    for (const issue of result.issues) {
      const leafPath = issueToLeafPath(ancestorPath, issue);

      // If the issue addresses a leaf the ancestor doesn't own (because a
      // specific schema claimed it), drop it per D4.
      // For runtime errors we attach to the ancestor root path and let it
      // fall back to clearing-all-owned (handled below by being absent from
      // reported).
      if (!ownedLeaves.has(leafPath)) {
        // Edge case: runtime error reports the issue at the ancestor root
        // path itself. Apply it to every owned leaf (stale-checked).
        if (fromRuntimeError) {
          for (const leaf of ownedLeaves) {
            staleSafeApply(registry, leaf, capturedVersions, formatIssue(issue, leaf));
            reported.add(leaf);
          }
        }
        continue;
      }

      staleSafeApply(registry, leafPath, capturedVersions, formatIssue(issue, leafPath));
      reported.add(leafPath);
    }

    // Stale-safe clear for owned leaves not reported by this run.
    for (const leaf of ownedLeaves) {
      if (reported.has(leaf)) continue;
      staleSafeApply(registry, leaf, capturedVersions, null);
    }
    return;
  }

  // No issues: clear all owned leaves with staleness check.
  for (const leaf of ownedLeaves) {
    staleSafeApply(registry, leaf, capturedVersions, null);
  }
}

function staleSafeApply(
  registry: Registry,
  leafPath: string,
  capturedVersions: ReadonlyMap<string, number>,
  msg: string | null
): void {
  const state = ensurePathState(registry, leafPath);
  const captured = capturedVersions.get(leafPath);
  if (captured === undefined) return;
  if (state.version !== captured) return; // stale, drop
  applyLeafVerdict(registry, state, leafPath, msg);
}

function runtimeErrorMessage(err: unknown): string {
  return `validation runtime error: ${String(err instanceof Error ? err.message : err)}`;
}
