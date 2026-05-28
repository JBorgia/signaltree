import { signal, WritableSignal, Signal } from '@angular/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import type { SchemaConfig } from '../types';

/**
 * Sentinel for the `*` wildcard segment in compiled patterns.
 */
export const WILDCARD: unique symbol = Symbol('validation/wildcard');
export type PatternSegment = string | typeof WILDCARD;

/**
 * Per-leaf-path mutable state. Created lazily on first matching write.
 */
export interface PathState {
  /** Monotonic counter incremented on every write to this leaf. */
  version: number;
  /** Verdict from the last settled run; `null` means valid. */
  lastSettledError: string | null;
  /** Captured version of the run currently in flight; `null` if idle. */
  inFlightVersion: number | null;
  /** Writable backing signal exposed via `errorsAt`. */
  errorSignal: WritableSignal<string | null>;
  /** Writable backing signal exposed via `isPendingAt`. */
  pendingSignal: WritableSignal<boolean>;
}

/**
 * Captured state of a single ancestor schema run. Used to apply per-leaf
 * staleness checks when the run settles, so a slow ancestor can't clobber a
 * faster leaf write that happened mid-flight.
 */
export interface AncestorRunRecord {
  /** Monotonic per ancestor schema reference. */
  runId: number;
  /** Snapshot of every owned leaf's `version` at dispatch. */
  capturedVersions: ReadonlyMap<string, number>;
  /** Leaves this ancestor schema can write/clear errors for (fixed precedence). */
  ownedLeaves: ReadonlySet<string>;
}

/**
 * One registered schema entry. Compiled at attach.
 */
export interface SchemaEntry {
  /** Original key from `config.schemas`. */
  pattern: string;
  /** The schema itself. */
  schema: StandardSchemaV1;
  /** True if the pattern contains any `*` segments. */
  isWildcard: boolean;
  /**
   * True if the pattern covers a subtree (i.e., is a strict prefix of leaf
   * paths reached via tree traversal). Determined empirically as paths bind:
   * if a write at path P matches this entry's segments exactly, it's a leaf
   * schema. If it matches as a strict prefix, it's an ancestor for that P.
   *
   * For static dispatch we use the conservative rule: a pattern is "ancestor"
   * if it could be a prefix of a deeper path under the tree. We track this
   * dynamically at match time rather than statically.
   */
  isAncestor: boolean;
  /** Compiled matcher segments for wildcard expansion. */
  segments: ReadonlyArray<PatternSegment>;
}

/**
 * The mutable container for all enhancer state. One per `validation()`
 * invocation; lives for the life of the tree it enhances.
 */
export interface Registry {
  /** All registered schemas in declaration order (for stable specificity ties). */
  entries: ReadonlyArray<SchemaEntry>;

  /**
   * For each leaf path that has matched, the entry that owns it per D4
   * fixed-precedence (specific > wildcard > ancestor). Computed lazily on
   * first match and cached.
   *
   * `null` here distinguishes "checked, no match" from "not yet checked";
   * however we only insert on match, so absence means "not yet checked."
   */
  leafOwner: Map<string, SchemaEntry>;

  /** Lazy `PathState` map; entries created on first matching write. */
  pathStates: Map<string, PathState>;

  /** Per-path memoized public signals. */
  errorsAtCache: Map<string, Signal<string | null>>;
  isValidAtCache: Map<string, Signal<boolean>>;
  isPendingAtCache: Map<string, Signal<boolean>>;

  /** O(1) invalid-count counter for the `isValid` aggregate. */
  invalidCount: WritableSignal<number>;

  /** In-flight ancestor runs keyed by ancestor pattern. */
  activeAncestorRuns: Map<string, AncestorRunRecord>;

  /** Monotonic ancestor-run id allocator. */
  nextAncestorRunId: number;

  /** Currently pending leaf paths. */
  pendingPathsSignal: WritableSignal<readonly string[]>;

  /** All currently-bound leaf paths (reactive for bridge consumers). */
  boundPathsSignal: WritableSignal<readonly string[]>;

  /** Internal mutable set, kept in sync with boundPathsSignal. */
  boundPathsSet: Set<string>;

  /** Internal mutable set, kept in sync with pendingPathsSignal. */
  pendingPathsSet: Set<string>;

  /** User config, frozen at attach. */
  config: SchemaConfig;
}

/**
 * Allocate a fresh `PathState` with empty verdicts.
 */
export function createPathState(): PathState {
  return {
    version: 0,
    lastSettledError: null,
    inFlightVersion: null,
    errorSignal: signal<string | null>(null),
    pendingSignal: signal<boolean>(false),
  };
}

/**
 * Get-or-create the `PathState` for a leaf path.
 */
export function ensurePathState(
  registry: Registry,
  path: string
): PathState {
  let state = registry.pathStates.get(path);
  if (!state) {
    state = createPathState();
    registry.pathStates.set(path, state);
  }
  return state;
}

/**
 * Atomically add a path to the bound-paths set and update the reactive signal.
 * No-op if already present.
 */
export function addBoundPath(registry: Registry, path: string): void {
  if (registry.boundPathsSet.has(path)) return;
  registry.boundPathsSet.add(path);
  registry.boundPathsSignal.set(Array.from(registry.boundPathsSet));
}

/**
 * Remove a path from the bound-paths set. No-op if absent.
 */
export function removeBoundPath(registry: Registry, path: string): void {
  if (!registry.boundPathsSet.has(path)) return;
  registry.boundPathsSet.delete(path);
  registry.boundPathsSignal.set(Array.from(registry.boundPathsSet));
}

export function addPendingPath(registry: Registry, path: string): void {
  if (registry.pendingPathsSet.has(path)) return;
  registry.pendingPathsSet.add(path);
  registry.pendingPathsSignal.set(Array.from(registry.pendingPathsSet));
}

export function removePendingPath(registry: Registry, path: string): void {
  if (!registry.pendingPathsSet.has(path)) return;
  registry.pendingPathsSet.delete(path);
  registry.pendingPathsSignal.set(Array.from(registry.pendingPathsSet));
}
