# `@signaltree/schema` — Production Plan (v3, locked)

**Status:** Locked. Implementation-ready.
**Authors:** SignalTree maintainers (Borgia)
**Reviewers (iteration history):** internal review + repo verification pass
**Target:** ship across four PRs (PR1–PR4) over the next release cycle.

> This document is the canonical plan. Earlier critique threads, v1, and v2 are superseded. Where this plan and a thread message disagree, this document wins.

---

## 0. One-paragraph summary

`@signaltree/schema` is a new enhancer that lets users register [StandardSchemaV1](https://github.com/standard-schema/standard-schema)-compatible schemas against dotted leaf paths (including `*` wildcards for entity collections) and exposes per-path and tree-wide error signals. The enhancer is **async-first** and **observe-only** — it reports verdicts, never blocks writes. A new ambient write-context channel in `@signaltree/core` lets enhancers tag writes with `UpdateMetadata` without changing Angular's `WritableSignal` API. The `@signaltree/ng-forms` package gains a Signal Forms bridge — planned here as `signalFormBridge`, shipped and then unified under `signalForm()` in 11.6.0 (`signalFormBridge` remains a deprecated alias until the next major) — that reads schemas from the schema enhancer's registry (single source of truth) and binds them into Angular Signal Forms.

---

## 1. Motivation

### 1.1 The problem (from Phase 0 audit)

1. **Schema drift across surfaces.** Today, validation lives in three places — `form()` markers (per-field validators), guardrails (rule-based, performance-focused), and ad-hoc Zod calls in `@signaltree/events`. There is no single registration site. A user who validates `user.email` in a form, in events, and on a server-action boundary writes three diverging implementations.
2. **No standard interop.** Each surface couples to a specific validation library (Zod, custom predicates). [StandardSchemaV1](https://github.com/standard-schema/standard-schema) is now the de-facto interop spec for Zod, Valibot, ArkType, Effect Schema, etc. Adopting it makes SignalTree validation portable across schema libraries with zero per-library code.
3. **Signal Forms gap.** Angular's Signal Forms ([RFC](https://github.com/angular/angular/discussions/60851)) is on track to become the recommended form primitive. SignalTree has a `formBridge` for classic ReactiveForms but no Signal Forms equivalent. Without one, users who pick Signal Forms either fork SignalTree state into a separate form model or drop SignalTree entirely on form-heavy views.

### 1.2 The shape of the answer

- One schema registry per tree, owned by the `schema` enhancer.
- All other surfaces (Signal Forms bridge, server actions, future Reactive Forms revisions) **read from** that registry. They do not accept their own schema arguments. Single registration site by type-shape, not by discipline.
- Validation observes writes via `interceptLeafSignals`, runs schemas async with a strict write-sequence guard to drop stale verdicts, and surfaces per-path + aggregate signals.
- An ambient write-context (`withWriteContext`) lets time-travel/hydration/migration writes carry intent so the enhancer can suppress validation for those replays.

---

## 2. Scope

### 2.1 In scope (v1)

- `@signaltree/schema` package (new). API per §4.
- `UpdateMetadata` lifted from `@signaltree/guardrails` to `@signaltree/core` and exported from core's public entry.
- `withWriteContext` / `getActiveWriteContext` added to core.
- `interceptLeafSignals` callback signature widened to pass an optional `UpdateMetadata` argument captured from the active write context.
- `@signaltree/guardrails` updated to read `getActiveWriteContext()` first, fall back to its existing `extractMetadata(payload)` payload-sniffing.
- `@signaltree/core/devtools` time-travel `applyState` wrapped in `withWriteContext({ intent: 'system', source: 'time-travel' })`.
- `signalForm` (planned as `signalFormBridge`) in `@signaltree/ng-forms` — bridges Angular Signal Forms `FieldTree` nodes against the schema enhancer registry. Per §9, the API-capability spike comes first and determines the bridge's shape.
- Docs (PR4): root README mention, `@signaltree/schema` README, AI skill under `docs/skills/using-signaltree/`, integration guides.

### 2.2 Out of scope (v1)

- **Multi-issue arrays per path.** v1 surfaces first issue message only, matching `form()` convention. `errorIssuesAt(path): Signal<readonly Issue[]>` is a v2 if asked.
- **Cross-field schemas spanning sibling subtrees without a common ancestor.** Register at the nearest common ancestor and let the issue-path mapper distribute messages.
- **Schema-reactive validation.** Schemas are registered once at enhancer attach. Hot-swapping schemas at runtime is not supported in v1.
- **Backporting `StandardSchemaV1` to `@signaltree/events`.** Events currently imports Zod directly ([packages/events/src/core/validation.ts](../../packages/events/src/core/validation.ts)). A separate follow-up issue, not blocking this work.
- **Whole-object Signal Forms binding as the default.** Per §9, the default is per-field binding. Whole-object is an optimization only attempted if metrics demand it.
- **Reject mode.** The enhancer cannot synchronously gate an async verdict — the write has already notified subscribers before the schema's promise resolves. `mode: 'reject'` would mean a silent rollback that observers already saw. Not offered.

---

## 3. Locked architectural decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Async-first surface.** All schema runs route through a promise (sync schemas use a fast-path branch — see §6.1). `pending`, `pendingPaths`, `isPendingAt(path)` are first-class signals. | `StandardSchemaV1.validate` returns `Result \| Promise<Result>`. A sync-only surface fails the moment a user registers a Valibot async schema. |
| D2 | **Observe-only, never reject.** Modes are `'accept'` (default) and `'warn'`. No `'reject'`. | Async writes have already notified subscribers before the schema settles. Rollback is unsafe and surprising. The enhancer is a reporter, not a gatekeeper. |
| D3 | **Write-sequence guard with per-path version counters.** Each leaf has a monotonic `version`; each schema dispatch captures `version`; on settle, stale verdicts (captured ≠ current) are discarded. Generalized to **ancestor-run records** for one-run→N-leaves cases (see §6.3). | Without the guard, a slow schema run for write A can clobber the verdict for a newer write B. |
| D4 | **Fixed precedence for ancestor vs specific schemas.** Specific schema owns its leaf; ancestor schema only writes/clears errors for leaves no specific schema claims. Determined at attach time via a `leafOwner` map. | Two unsynchronized clocks (ancestor version, leaf version) cannot last-write-wins coherently. Fixed precedence collapses to one clock per leaf. |
| D5 | **Ambient write-context channel** (`withWriteContext`) in core. Enhancers consume via `getActiveWriteContext()`. Synchronous capture only — does **not** survive `await` boundaries. | Angular's `WritableSignal.set(value)` signature cannot be widened to carry metadata. An ambient channel is the only seam that doesn't fork the signal API. |
| D6 | **Single registration site by type-shape.** `signalForm` (planned as `signalFormBridge`) requires `& SchemaMethods<T>` on its tree parameter. It reads schemas from `tree.schemas.schemaFor(path)`. There is no `schemas` argument on the bridge. | Two registration sites = drift = the bug this work exists to kill. Type-shape enforcement makes drift impossible at API surface, not at code-review discipline. |
| D7 | **Lazy wildcard match-on-write.** Patterns compile to a matcher at attach. On every leaf write, the matcher is consulted; first match (longest-specific) lazily instantiates `PathState`. No upfront entity enumeration, no add/remove event subscription. | Verification confirmed `entityMap` exposes no add/remove notifications. Lazy match avoids both that gap and the O(n) enumeration cost on 1000-item lists. Eviction is deferred — small leak, ship `tree.schemas.compact()` as the manual control. |
| D8 | **Per-path signal memoization in a path-keyed `Map`,** with optional eviction via `tree.schemas.compact()`. `errorsAt`, `isValidAt`, `isPendingAt` return the same `Signal` for the same path across calls. | Without memoization, `errorsAt(userId)` inside a list renderer creates a new `computed` per render — classic leak. |
| D9 | **PR3 default is per-field binding, not whole-object.** Whole-object Signal Forms binding is the optimization branch, attempted only if measured. | H1/H2/H3 of the v2 hypotheses share a root cause: whole-object replacement. Per-field binding makes three of four pass trivially. The actual unknown is whether Signal Forms permits external per-field writables — that's the PR3 API-capability spike, not the perf benchmark. |
| D10 | **Bundle budget ≤ 6 KB gzipped** for `@signaltree/schema`. Optional `@signaltree/schema/collections` subpath if wildcard expansion proves too heavy to fit. | Re-derived from runtime weight per §11. Types compile to zero; the bulk is the version-guard machinery, path mapping, and matcher. |

---

## 4. Public API

### 4.1 `@signaltree/schema`

```ts
// packages/schema/src/index.ts
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Signal } from '@angular/core';
import type {
  ISignalTree,
  UpdateMetadata,
} from '@signaltree/core';

/** Dotted path with optional `*` segments. Examples: `user.email`, `users.*.email`, `orders.*.items.*.qty`. */
export type SchemaPath = string;

export interface SchemaConfig {
  /** Path-keyed schema registry. Wildcards expand against current tree state via lazy match-on-write. */
  schemas: Readonly<Record<SchemaPath, StandardSchemaV1>>;

  /** Reporter behavior. No `'reject'` — see D2. Default `'accept'`. */
  mode?: 'accept' | 'warn';

  /** Initial validation pass on attach (default `true`). Sync schemas populate synchronously; async after their promises settle. */
  validateOnAttach?: boolean;

  /** Suppress validation for writes whose active context's `intent` is in this list. */
  suppressIntents?: ReadonlyArray<NonNullable<UpdateMetadata['intent']>>;

  /** Suppress validation for writes whose active context's `source` is in this list. NOTE: do not include `'serialization'` — deserialize is the canonical ingest case validation exists for. */
  suppressSources?: ReadonlyArray<NonNullable<UpdateMetadata['source']>>;

  /** Optional reporter for `mode: 'warn'` and runtime errors. Defaults to `console.warn` when `mode === 'warn'`. */
  onError?: (path: string, message: string) => void;

  /** Optional custom extractor for the surfaced message from an issue. Default: `issue.message`. */
  formatIssue?: (issue: StandardSchemaV1.Issue, path: string) => string;
}

export interface SchemaMethods<T> {
  schema: {
    // --- Settled state (last completed verdict per path) ---

    /** Path → message of last settled run, or null if valid. */
    errors: Signal<Readonly<Record<string, string | null>>>;

    /** Flat list of settled non-null error messages. */
    errorList: Signal<readonly string[]>;

    /** True iff every settled path is valid. Pending paths use their last settled verdict. */
    isValid: Signal<boolean>;

    // --- In-flight state ---

    /** True iff any path has an in-flight validation run. */
    pending: Signal<boolean>;

    /** Paths currently being validated. */
    pendingPaths: Signal<readonly string[]>;

    // --- Per-path access (memoized per path; same Signal returned across calls) ---

    errorsAt(path: string): Signal<string | null>;
    isValidAt(path: string): Signal<boolean>;
    isPendingAt(path: string): Signal<boolean>;

    // --- Imperative ---

    /** Re-run all schemas. Cancels in-flight runs by bumping version. Resolves to current `isValid()` after all runs settle. */
    validate(): Promise<boolean>;

    /** Re-run schema(s) at a single leaf path. Same cancel-and-restart semantics. */
    validatePath(path: string): Promise<boolean>;

    /** Evict `PathState` and memoized signals for paths that no longer exist in the tree. Manual GC. */
    compact(): void;

    // --- Bridge integration (signalForm consumer) ---

    /** Internal: resolve the schema bound to a leaf path (after wildcard expansion). Returns `undefined` if no schema claims this leaf. */
    schemaFor(leafPath: string): StandardSchemaV1 | undefined;

    /** Internal: reactive list of all currently-bound leaf paths. Signal so the bridge can subscribe and rebind on entity add/remove. */
    boundPaths: Signal<readonly string[]>;
  };
}

export function schema(
  config: SchemaConfig
): <T>(tree: ISignalTree<T>) => ISignalTree<T> & SchemaMethods<T>;
```

### 4.2 `@signaltree/core` additions

```ts
// packages/core/src/lib/types.ts (existing file)
export interface UpdateMetadata {
  /** Intent of the update (closed union — adding new intents is a core change). */
  intent?: 'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system';
  /** Source of the update (closed union). */
  source?: 'serialization' | 'time-travel' | 'devtools' | 'user' | 'system';
  /** Suppress guardrails for this update. */
  suppressGuardrails?: boolean;
  /** Optional correlation ID for related updates. */
  correlationId?: string;
  /** Optional timestamp. */
  timestamp?: number;
  /**
   * Open extension for guardrails' historical custom-key shape.
   * NOTE: `@signaltree/schema` reads ONLY `intent` and `source`. Custom keys
   * here are guardrails-private — do not expect other enhancers to honor them.
   */
  readonly [key: string]: unknown;
}

// packages/core/src/lib/write-context.ts (new file)
/**
 * Run `fn` with `meta` set as the active write context. Synchronous capture
 * only — context is restored before `fn` returns. Does NOT survive `await`
 * boundaries; capture context synchronously at the write site.
 */
export function withWriteContext<R>(meta: UpdateMetadata, fn: () => R): R;

/** Read the active write context, if any. Returns `undefined` outside a `withWriteContext` frame. */
export function getActiveWriteContext(): UpdateMetadata | undefined;
```

### 4.3 `interceptLeafSignals` widening

```ts
// packages/core/src/lib/internals/intercept-leaf-signals.ts
export interface InterceptLeafSignalsOptions {
  maxDepth?: number;
}

export function interceptLeafSignals(
  root: unknown,
  onWrite: (
    path: string,
    next: unknown,
    prev: unknown,
    meta?: UpdateMetadata,
  ) => void,
  options?: InterceptLeafSignalsOptions,
): () => void;
```

The wrapped `.set` / `.update` captures `getActiveWriteContext()` synchronously immediately before calling `onWrite`. The captured value is passed through as `meta`.

### 4.4 `@signaltree/ng-forms` additions (PR3 — shape contingent on §9 spike)

```ts
// packages/ng-forms/src/enhancer/signal-form-bridge.ts (new file)
import type { ISignalTree } from '@signaltree/core';
import type { SchemaMethods } from '@signaltree/schema';

export interface SignalFormBridgeConfig {
  /** Optional override: if false, the bridge will not subscribe to `boundPaths` and will only bind once at attach. */
  reactiveRebind?: boolean; // default true
}

export interface SignalFormMethods {
  signalForm: {
    /** Returns the `form()` tree used to render. Shape determined by the §9 spike. */
    form: unknown; // typed in PR3 against the spike outcome
  };
}

export function signalFormBridge(
  config?: SignalFormBridgeConfig,
): <T>(
  tree: ISignalTree<T> & SchemaMethods<T>,
) => ISignalTree<T> & SchemaMethods<T> & SignalFormMethods;
```

The `& SchemaMethods<T>` constraint on the input tree is load-bearing — it forces the user to apply `schemas()` before the bridge (shipped as `signalForm()`), which is what makes single-registration enforceable at the type level (D6).

---

## 5. Internal data structures

```ts
// packages/schema/src/lib/internals/state.ts
interface PathState {
  /** Monotonic counter incremented on every write to this leaf. */
  version: number;
  /** Verdict from the last settled run, null = valid. */
  lastSettledError: string | null;
  /** Captured version of the run currently in flight, or null if idle. */
  inFlightVersion: number | null;
  /** Writable backing signal exposed via `errorsAt`. */
  errorSignal: WritableSignal<string | null>;
  /** Writable backing signal exposed via `isPendingAt`. */
  pendingSignal: WritableSignal<boolean>;
}

interface AncestorRunRecord {
  /** Monotonic per ancestor schema reference. */
  runId: number;
  /** Snapshot of every owned leaf's `version` at dispatch. */
  capturedVersions: ReadonlyMap<string, number>;
  /** Leaves this ancestor schema can write/clear errors for (per D4 precedence). */
  ownedLeaves: ReadonlySet<string>;
  /** Resolves when the schema run settles. */
  settle: Promise<void>;
}

interface SchemaEntry {
  pattern: string;             // original key from config.schemas
  schema: StandardSchemaV1;
  isWildcard: boolean;
  isAncestor: boolean;         // true if schema covers a subtree (not a single leaf)
  /** Compiled matcher segments for wildcard expansion. */
  segments: ReadonlyArray<string | typeof WILDCARD>;
}

interface Registry {
  /** All registered schemas in declaration order. */
  entries: ReadonlyArray<SchemaEntry>;
  /** For each currently-known leaf path, the schema that owns it (per D4 precedence). */
  leafOwner: Map<string, SchemaEntry>;
  /** Lazy `PathState` map; entries created on first matching write. */
  pathStates: Map<string, PathState>;
  /** Per-path memoized public signals. */
  errorsAtCache: Map<string, Signal<string | null>>;
  isValidAtCache: Map<string, Signal<boolean>>;
  isPendingAtCache: Map<string, Signal<boolean>>;
  /** Active ancestor runs, keyed by ancestor pattern. */
  activeAncestorRuns: Map<string, AncestorRunRecord>;
  /** Aggregate state. */
  pendingPathsSignal: WritableSignal<readonly string[]>;
  boundPathsSignal: WritableSignal<readonly string[]>;
}
```

`WILDCARD` is a singleton symbol used in compiled segments to indicate `*`.

---

## 6. Algorithms

### 6.1 Write router and dispatch

A single leaf write at path `P` can match **both** a specific schema (which owns `P`) and one or more ancestor schemas (which own sibling leaves under a common prefix). The top-level `routeWrite` is the dispatcher; it fans out to `dispatchLeafRun` (this section) and `dispatchAncestorRun` (§6.3). Suppression is checked once at the router, not per dispatched run.

```ts
function routeWrite(
  path: string,
  next: unknown,
  prev: unknown,
  meta?: UpdateMetadata,
): void {
  // Suppression: applied once at the router, not per dispatched run.
  if (meta?.intent && config.suppressIntents?.includes(meta.intent)) return;
  if (meta?.source && config.suppressSources?.includes(meta.source)) return;
  if (meta?.suppressGuardrails) return; // honor existing convention

  // (1) Specific-schema dispatch for the exact leaf path, if any.
  //     `matchLeaf` returns the owner per D4 precedence — specific wins over
  //     wildcard wins over ancestor. `isAncestor` is false for leaf-targeted
  //     entries; ancestor entries are handled in (2).
  const leafEntry = matchLeaf(path);
  if (leafEntry && !leafEntry.isAncestor) {
    dispatchLeafRun(leafEntry, path, next);
  }

  // (2) Ancestor dispatch for every ancestor schema whose pattern is a strict
  //     prefix of `path` AND owns ≥ 1 leaf under the current tree. A single
  //     write can trigger both (1) and (2) — they run concurrently and operate
  //     on disjoint leaves per D4.
  for (const { entry, ancestorPath } of matchAncestors(path)) {
    dispatchAncestorRun(entry, ancestorPath, meta);
  }
}

function dispatchLeafRun(
  entry: SchemaEntry,
  path: string,
  next: unknown,
): void {
  const state = ensurePathState(path);
  const myVersion = ++state.version;

  // Sync fast-path. Eliminates the microtask surprise for sync schemas.
  const result = runSchemaSync(entry.schema, next);
  if (!(result instanceof Promise)) {
    applyLeafVerdict(state, path, resultToMessage(result, path));
    return;
  }

  // Async path with write-sequence guard.
  state.inFlightVersion = myVersion;
  state.pendingSignal.set(true);
  addPendingPath(path);

  result.then(
    (settled) => {
      if (state.inFlightVersion !== myVersion) return; // superseded, drop
      state.inFlightVersion = null;
      applyLeafVerdict(state, path, resultToMessage(settled, path));
      state.pendingSignal.set(false);
      removePendingPath(path);
    },
    (err) => {
      if (state.inFlightVersion !== myVersion) return;
      state.inFlightVersion = null;
      applyLeafVerdict(state, path, `validation runtime error: ${String(err)}`);
      state.pendingSignal.set(false);
      removePendingPath(path);
    },
  );
}

function applyLeafVerdict(
  state: PathState,
  path: string,
  msg: string | null,
): void {
  // Maintain the O(1) invalid-count for `isValid` (see §6.6). Both leaf and
  // ancestor dispatches funnel through applyLeafVerdict, so the counter stays
  // consistent across both paths.
  const wasInvalid = state.lastSettledError !== null;
  const nowInvalid = msg !== null;
  if (wasInvalid !== nowInvalid) {
    registry.invalidCount.update((c) => c + (nowInvalid ? 1 : -1));
  }

  state.lastSettledError = msg;
  state.errorSignal.set(msg);

  if (config.mode === 'warn' && msg) {
    (config.onError ?? defaultWarn)(path, msg);
  }
}
```

`runSchemaSync` is a thin wrapper: calls `schema['~standard'].validate(value)` and returns the raw result (the sync-or-promise union). `matchAncestors(path)` walks `registry.entries` and yields each ancestor entry whose `segments` form a strict prefix of `path.split('.')` and whose `ownedLeaves` set is non-empty for the current tree state. The router invokes `dispatchAncestorRun` (§6.3) for each yielded entry; the ancestor handler itself bumps versions and applies verdicts via `applyLeafVerdict`, keeping the invalid-count consistent.

### 6.2 Lazy wildcard matching (D7)

```ts
function matchLeaf(leafPath: string): SchemaEntry | undefined {
  // Cached?
  const cached = registry.leafOwner.get(leafPath);
  if (cached) return cached;

  const segs = leafPath.split('.');
  let best: SchemaEntry | undefined;
  let bestSpecificity = -1;

  for (const entry of registry.entries) {
    const sp = matchSpecificity(entry.segments, segs);
    if (sp > bestSpecificity) {
      best = entry;
      bestSpecificity = sp;
    }
  }

  if (best) {
    // Cache, and if it's an ancestor schema, mark this leaf as ancestor-owned only if
    // no specific entry would claim it later. Specificity already encodes this.
    registry.leafOwner.set(leafPath, best);
    addBoundPath(leafPath);
  }
  return best;
}

/**
 * Returns a specificity score; -1 means no match.
 * Score = number of literal (non-wildcard) segments matched, with ancestor schemas
 * (entry.segments.length < segs.length) scoring lower than exact-length matches.
 * Specific schemas always score higher than wildcard schemas for the same leaf.
 */
function matchSpecificity(pattern: readonly (string | typeof WILDCARD)[], segs: string[]): number;
```

**Eviction.** `tree.schemas.compact()` walks `registry.leafOwner` and removes entries whose path no longer resolves in the current tree (uses a path-existence probe via the tree). Removed paths also have their `PathState`, memoized signals, and `boundPaths` entry torn down. Compaction is opt-in to avoid surprising cost during interactive work.

### 6.3 Ancestor-run version capture (D4)

When a write at path `P` is matched by an ancestor schema at `A` (where `A` is a strict prefix of `P`), dispatch the ancestor run against `A`'s current value — not just the changed leaf:

```ts
function onAncestorWrite(
  ancestorEntry: SchemaEntry,
  ancestorPath: string,
  changedLeaf: string,
  meta?: UpdateMetadata,
): void {
  // Suppression check identical to onLeafWrite.

  const runId = ++ancestorRunCounter;
  const ownedLeaves = collectOwnedLeaves(ancestorEntry, ancestorPath);
  const capturedVersions = new Map<string, number>();
  for (const leaf of ownedLeaves) {
    capturedVersions.set(leaf, ensurePathState(leaf).version);
  }

  const record: AncestorRunRecord = {
    runId,
    capturedVersions,
    ownedLeaves,
    settle: dispatchAncestor(ancestorEntry, ancestorPath, capturedVersions, ownedLeaves),
  };
  registry.activeAncestorRuns.set(ancestorPath, record);
}

async function dispatchAncestor(
  entry: SchemaEntry,
  ancestorPath: string,
  capturedVersions: ReadonlyMap<string, number>,
  ownedLeaves: ReadonlySet<string>,
): Promise<void> {
  const ancestorValue = readTreeAtPath(ancestorPath);
  const result = await Promise.resolve(entry.schema['~standard'].validate(ancestorValue));

  if ('issues' in result && result.issues) {
    // Distribute issues to owned leaves with staleness check per leaf.
    const reported = new Set<string>();
    for (const issue of result.issues) {
      const leafPath = issueToLeafPath(ancestorPath, issue);
      if (!ownedLeaves.has(leafPath)) continue; // specific schema owns it
      const state = ensurePathState(leafPath);
      if (state.version !== capturedVersions.get(leafPath)) continue; // stale
      const msg = (config.formatIssue ?? defaultFormatIssue)(issue, leafPath);
      applyLeafVerdict(state, state.version, leafPath, msg);
      reported.add(leafPath);
    }
    // Stale-safe clear for owned leaves that didn't error this run.
    for (const leaf of ownedLeaves) {
      if (reported.has(leaf)) continue;
      const state = ensurePathState(leaf);
      if (state.version !== capturedVersions.get(leaf)) continue; // stale
      applyLeafVerdict(state, state.version, leaf, null);
    }
  } else {
    // No issues → clear all owned leaves with staleness check.
    for (const leaf of ownedLeaves) {
      const state = ensurePathState(leaf);
      if (state.version !== capturedVersions.get(leaf)) continue;
      applyLeafVerdict(state, state.version, leaf, null);
    }
  }
}
```

**Why per-leaf staleness inside an ancestor run:** a single ancestor `user`-schema run produces issues for many leaves. Between dispatch and settle, any of those leaves may have advanced via a faster, more specific schema (or another ancestor run). The fixed-precedence rule (D4) guarantees specific schemas take priority, but a slow ancestor run can still clobber a peer ancestor-owned leaf that has advanced. Per-leaf version check inside the ancestor settle handler kills that race.

### 6.4 Issue path → leaf path mapping

`StandardSchemaV1.Issue.path` is `ReadonlyArray<PropertyKey | { key: PropertyKey }>`. Both forms appear in the wild:

```ts
function issueToLeafPath(rootPath: string, issue: StandardSchemaV1.Issue): string {
  const segs = (issue.path ?? []).map((p) =>
    typeof p === 'object' && p !== null && 'key' in p
      ? String((p as { key: PropertyKey }).key)
      : String(p),
  );
  return segs.length ? `${rootPath}.${segs.join('.')}` : rootPath;
}
```

Issues with empty `path` attach to the ancestor's root path. The mapper is shared between ancestor runs and (rare) cases where a leaf schema returns a nested issue path.

### 6.5 Per-path signal memoization (D8)

```ts
function errorsAt(path: string): Signal<string | null> {
  const cached = registry.errorsAtCache.get(path);
  if (cached) return cached;
  // Computed reads through ensurePathState so add/remove cycles re-resolve.
  const sig = computed(() => ensurePathState(path).errorSignal());
  registry.errorsAtCache.set(path, sig);
  return sig;
}
```

`ensurePathState(path)` always returns the current `PathState`, never a stale one. If `compact()` evicted a path that's later re-added, a new `PathState` is installed and the computed picks it up on next read.

To handle the edge case where a consumer's cached `errorsAt(path)` keeps a stale `PathState` reference alive across an evict → re-add, the `WritableSignal`s inside `PathState` are cleared (`.set(null)`, `.set(false)`) **before** removal from the map. Any subscriber gets a final `null` / `false` snapshot before the new `PathState` replaces it.

### 6.6 Aggregate signals

`isValid` is the hot path — it's read inside button-disabled bindings and re-evaluates per keystroke. v1 ships an **O(1) invalid-count counter** maintained inside `applyLeafVerdict` (§6.1). `errors` and `errorList` stay as on-demand `computed`s that pay O(paths) only when something actually reads them — the typical pattern is one error-list view per form, not per keystroke.

```ts
// Maintained by applyLeafVerdict: incremented when a verdict crosses null→non-null,
// decremented on non-null→null. Stays consistent across leaf and ancestor runs
// because both funnel through applyLeafVerdict.
registry.invalidCount = signal(0);

const isValid = computed(() => registry.invalidCount() === 0); // O(1) per read

const errors = computed(() => {
  const out: Record<string, string | null> = {};
  for (const [path, state] of registry.pathStates) {
    out[path] = state.errorSignal();
  }
  return out;
}); // O(paths) — evaluated only when read

const errorList = computed(() =>
  Object.values(errors()).filter((v): v is string => v !== null),
); // O(paths) — evaluated only when read

const pending = computed(() => registry.pendingPathsSignal().length > 0);
```

**Why the counter matters.** Per-keystroke validation pays the O(1) counter update inside `applyLeafVerdict`; only views that render the full error map pay the O(paths) walk. NgRx-comparison benchmarks measure exactly this per-keystroke cost — the counter pattern is the difference between "validation is free per keystroke" and "validation cost scales with form size per keystroke."

### 6.7 `validate()` and `validatePath()` semantics

Both **supersede** any in-flight runs for the targeted paths by bumping each leaf's `version`, then dispatch fresh runs. Awaiting the returned promise resolves to the current `isValid()` after all dispatched runs settle. Mixing imperative `validate()` with concurrent edits is safe — the same write-sequence guard applies; whichever run captured the latest version wins.

For ancestor schemas, `validate()` bumps the version of every owned leaf, then dispatches one ancestor run. The captured-version snapshot inside that run reflects the just-bumped versions.

**"Supersede," not "cancel."** A `StandardSchemaV1.validate` promise cannot be aborted from outside — bumping the version **orphans** the in-flight run; the schema still runs to completion, and the verdict is dropped on settle via the staleness check. For schemas that perform real I/O (an async uniqueness check hitting a server), this means `validate()` called repeatedly during typing piles up orphaned network requests that all run to completion before being discarded. Callers that re-invoke `validate()` per keystroke should debounce. When StandardSchema adds an abort-signal channel, the runner will accept it; until then, the debounce discipline is on the caller and is documented in the README.

### 6.8 `validateOnAttach`

When `true` (default), the enhancer enumerates all currently-resolvable leaves under each schema's pattern at attach time and dispatches initial runs. Sync schemas populate synchronously via the fast-path branch (§6.1). Async schemas populate after their promises settle. `isValid()` read in the same synchronous tick as enhancer attach returns `true` only if all attached schemas were sync-resolving — otherwise it returns `true` until the first async result fails (no errors yet ≠ proven valid). The README documents this clearly.

---

## 7. PR1 — Lift `UpdateMetadata` + ambient write-context

### 7.1 Scope

1. **Move `UpdateMetadata` to core.** Add the interface to [packages/core/src/lib/types.ts](../../packages/core/src/lib/types.ts), export from core's public entry. Keep a deprecated re-export in guardrails for one minor release, then remove.
2. **Add `withWriteContext` / `getActiveWriteContext`** in new file [packages/core/src/lib/write-context.ts](../../packages/core/src/lib/write-context.ts). Export from core's public entry under an `internals` namespace (`@signaltree/core/internals`) — enhancer plumbing, not application API.
3. **Widen `interceptLeafSignals` callback** at [packages/core/src/lib/internals/intercept-leaf-signals.ts:22](../../packages/core/src/lib/internals/intercept-leaf-signals.ts#L22). Capture `getActiveWriteContext()` synchronously inside the wrapped `set` / `update` and pass it to `onWrite`. Existing call sites that pass a 3-arg callback continue to work (the 4th arg is optional).
4. **Wrap devtools time-travel** at [packages/core/src/enhancers/devtools/devtools.ts:1407](../../packages/core/src/enhancers/devtools/devtools.ts#L1407) (`applyExternalState`) and any other replay sites in `applyState` ([packages/core/src/lib/utils.ts:569](../../packages/core/src/lib/utils.ts#L569)) in `withWriteContext({ intent: 'system', source: 'time-travel' })`. Verify no other replay sites bypass.
5. **Update guardrails** at [packages/guardrails/src/lib/guardrails.ts:930](../../packages/guardrails/src/lib/guardrails.ts#L930) (`extractMetadata`) to read `getActiveWriteContext()` first and fall back to existing payload-sniff. Adds zero new behavior; ensures forward compatibility.
6. **Tests** in `packages/core/src/lib/__tests__/`:
   - Round-trip an `intent: 'hydrate'` through a leaf write → verify the callback receives `meta.intent === 'hydrate'`.
   - Nested `withWriteContext` correctly restores the outer context after the inner returns.
   - Throwing inside `fn` still restores the previous context (try/finally semantics).
   - `withWriteContext` does NOT survive `await` — write a test that demonstrates this so the limitation is encoded.
   - Devtools time-travel replay: confirm replayed writes arrive at `interceptLeafSignals` callbacks with `meta.source === 'time-travel'`.

### 7.2 Risks / open items

- **`ng-forms` history.** Verified that `formTree.setValues()` propagates through `FormGroup.valueChanges`, not leaf signal writes ([packages/ng-forms/src/history/history.ts:110](../../packages/ng-forms/src/history/history.ts#L110)). Form history undo *does* eventually reach the tree via the existing `formBridge` writing back per-leaf — which now goes through `interceptLeafSignals`, which means validation *will* fire on history undo. This is the desired UX (restored state shows errors). No wrapping needed for ng-forms history in PR1.
- **Multi-tree SSR.** `activeWriteContext` is a module-level singleton. In a JavaScript runtime, single-threaded execution makes this safe for the synchronous-capture pattern. SSR with concurrent requests sharing a tree across requests is an antipattern; document the limitation in the `withWriteContext` JSDoc.

### 7.3 Acceptance criteria

- All existing tests in core, guardrails, ng-forms, and devtools pass unchanged.
- New tests above pass.
- `bundle-size` script reports the core delta is ≤ 200 bytes gzipped (the `withWriteContext` machinery is trivial).
- `@signaltree/guardrails` continues to function with the old payload-sniff path (covered by existing tests).

---

## 8. PR2 — `@signaltree/schema` enhancer

### 8.1 File layout

```
packages/schema/
├── README.md                          # PR4
├── package.json                       # 9.2.x to match siblings
├── tsconfig.json
├── tsconfig.lib.json
├── tsconfig.spec.json
├── project.json                       # Nx project config
├── src/
│   ├── index.ts                       # public exports
│   ├── lib/
│   │   ├── validation.ts              # validation() factory
│   │   ├── internals/
│   │   │   ├── state.ts               # PathState, AncestorRunRecord, Registry
│   │   │   ├── matcher.ts             # pattern compilation, matchLeaf
│   │   │   ├── leaf-handler.ts        # onLeafWrite
│   │   │   ├── ancestor-handler.ts    # onAncestorWrite, dispatchAncestor
│   │   │   ├── issue-mapper.ts        # issueToLeafPath, formatting
│   │   │   ├── signal-cache.ts        # errorsAt/isValidAt/isPendingAt memo
│   │   │   ├── aggregates.ts          # errors, errorList, isValid, pending
│   │   │   └── compact.ts             # tree.schemas.compact()
│   │   └── types.ts                   # public API types
│   └── __tests__/                     # see §8.3
```

### 8.2 Implementation order

1. `state.ts`, `types.ts` — data shapes, no logic.
2. `matcher.ts` — pattern compilation + `matchLeaf`. Unit-test in isolation (no tree).
3. `signal-cache.ts` — memoization. Trivial.
4. `leaf-handler.ts` — `onLeafWrite` with sync fast-path. Unit-test with a stub schema runner.
5. `issue-mapper.ts`, `ancestor-handler.ts` — ancestor run with version capture. Most subtle; gets the deepest test coverage.
6. `aggregates.ts`, `compact.ts` — derived state, manual GC.
7. `validation.ts` — wire it together, expose the enhancer factory.

### 8.3 Tests (`packages/schema/src/__tests__/`)

**Smoke (`smoke.spec.ts`)**

- Register one sync Zod schema at `user.email`, write valid + invalid values, observe `errorsAt` settles correctly.
- Same with one async Valibot schema.

**Write-sequence guard (`write-sequence.spec.ts`)**

- Fire 5 writes A→E to `user.email` with schema resolving at variable latency (E resolves first, then A, then C…). Assert only E's verdict is applied; A/C/B/D are dropped.
- Same as above but with `validate()` called mid-sequence.

**Ancestor runs (`ancestor.spec.ts`)**

- Register schema at `user`. Write to `user.email` → ancestor schema runs against whole `user` object, produces issues for `email` and `age`. Both leaves receive the right messages.
- Write to `user.email`, then immediately write to `user.age` before the ancestor's first run settles. Assert: when the first run settles, only the leaf whose version it captured cleanly is applied; the leaf that advanced gets the second run's verdict.
- Mixed: register schema at `user` AND at `user.email`. Specific schema owns `email`; ancestor only writes to `user.age`. Test by making ancestor schema emit an `email` issue → assert it is **dropped** (specific schema's `email` value is unchanged).

**Wildcard matching (`wildcard.spec.ts`)**

- Register `users.*.email`. Add entity `users.42`. Write to `users.42.email` → schema runs, verdict applied. Write to `users.42.name` (no schema) → no-op.
- Add entity `users.99`. Write to `users.99.email` → schema runs (lazy match installs `PathState`).
- Specificity: register both `users.*.email` and `users.42.email`. Write to `users.42.email` → most-specific wins. Write to `users.99.email` → wildcard wins.

**Compact (`compact.spec.ts`)**

- Add entity, write to it (installs `PathState`), remove entity, call `compact()`, verify `PathState`/memoized signals are gone.
- Add entity back, `errorsAt('users.42.email')` returns the new fresh `Signal`, not the stale one.

**Suppression (`suppress.spec.ts`)**

- Register sync schema. Write inside `withWriteContext({ intent: 'time-travel' }, ...)` with `suppressIntents: ['time-travel']` — wait, that's not a valid intent. Use `intent: 'system'` and `suppressIntents: ['system']`. Verify no verdict change.
- Source suppression: `withWriteContext({ source: 'time-travel' }, ...)` + `suppressSources: ['time-travel']` → suppressed. Verify validation does NOT fire on devtools time-travel replays when the user opts in.
- Default (no suppression configured) — time-travel writes DO trigger validation.

**Aggregates (`aggregates.spec.ts`)**

- `errors`, `errorList`, `isValid`, `pending`, `pendingPaths` all observe correctly during a burst of writes.

**`validate()` / `validatePath()` (`imperative.spec.ts`)**

- `validate()` cancels in-flight runs (bump version) and resolves to current `isValid()` after all dispatched runs settle.
- `validatePath()` does the same for a single path.
- Concurrent `validate()` + user edits: no clobbering.

**Async fast-path branch (`sync-fast-path.spec.ts`)**

- Sync schema verdict is observable in the same synchronous tick as the write (no microtask delay).
- `validateOnAttach: true` with sync schemas populates `errors` before the next microtask drains.

### 8.4 Bundle measurement

After PR2 lands, run `pnpm bundle-size` (or equivalent) on `@signaltree/schema`. Assert:
- ≤ 6 KB gzipped (D10).
- If over, split entity-collection support into `@signaltree/schema/collections` subpath — non-wildcard validation must fit ≤ 3.5 KB.

### 8.5 Acceptance criteria

- All tests pass.
- Bundle within budget.
- `pnpm typecheck` clean (strict mode, no `any` leaks at the public API).
- README authored (PR4) — but PR2 itself ships with JSDoc on every public symbol so docs can be generated.

---

## 9. PR3 — Signal Forms bridge

### 9.1 First deliverable: API capability spike

Before any plan ink dries on the bridge shape, confirm the *actual* unknown: **does Angular Signal Forms permit binding a `FieldTree` leaf to an externally-owned `WritableSignal`** (or supplying one as the node's source), rather than owning the whole model object?

**Spike artifact:** [packages/ng-forms/spike/signal-form-per-field.spec.ts](../../packages/ng-forms/spike/signal-form-per-field.spec.ts) (new file, deleted after the spike concludes). Repro:

1. Create a `WritableSignal<string>` externally.
2. Build a `form()` whose `email` field is sourced from that external signal (not from an object property).
3. Mutate the external signal → assert the form reflects the change.
4. Mutate the form via Signal Forms' input API → assert the external signal reflects the change.

If (3) and (4) both pass: per-field bridge is real, PR3 ships per-field as default.

If (3) or (4) fails: Signal Forms only supports whole-object binding. Re-open v2's H1/H2/H3 as load-bearing benchmarks before committing to the bridge. In the worst case, the bridge ships with a "whole-object only, perf caveats apply" warning, or doesn't ship in v1.

### 9.2 If spike succeeds — per-field bridge

Bridge attach:

1. Walk `form()` markers in the SignalTree (same scan the existing `formBridge` does).
2. For each `form()` marker, enumerate its field paths.
3. For each field path `P`, call `tree.schemas.schemaFor(P)`. If a schema is registered, bind it into Signal Forms' field validation via [`validateStandardSchema(schema)`](https://github.com/angular/angular/discussions/60851) (or whatever the Signal Forms public spec lands as — PR3 references the API as it exists when the spike runs).
4. Bind the field's source signal to the SignalTree leaf's `WritableSignal`. Read and write flow through that single signal — no diff engine, no echo loop, no whole-object replacement.
5. Subscribe to `tree.schemas.boundPaths` (a Signal — D7) and re-walk + rebind when new entity rows arrive or are removed.

**Echo-loop guard.** Even with per-field binding, Zod/StandardSchema transforms (`.transform(s => s.trim())`) can return a value not referentially equal to the input. Before writing the transformed value back to the SignalTree leaf, deep-equal-check against the current leaf value via `@signaltree/shared`'s `deepEqual`. If equal, skip the write entirely.

### 9.3 Spike outcomes — three branches

The spike has three possible outcomes, not two. Force-binarizing it would pressure the design toward per-field even when the real result is ambiguous.

**Branch A — clean pass.** Steps 1–4 in §9.1 all work without surprises. Ship per-field bridge as PR3 per §9.2.

**Branch B — ambiguous pass.** Steps 1–4 work but require non-trivial wiring — e.g., a wrapper signal that re-introduces a coercion hop, or per-field binding only works through a `linkedSignal`-style adapter that adds a microtask. The auto-bridge becomes lossy or surprising. Ship a **documented manual-wiring path** instead: README shows how to wire `errorsAt(path)` into a hand-built Signal Form, plus a small helper (`bindLeafToField(tree, leafPath, field)`) that does the common case in ~5 lines. No auto-bridge enhancer; users opt in to the wiring per form. This is the most likely real outcome for an experimental Angular API.

**Branch C — clean fail.** Steps 3 or 4 don't work — Signal Forms only supports whole-object binding. v1 ships **without** the Signal Forms bridge (`signalForm`). Users continue to use the existing `formBridge` (ReactiveForms) with the validation enhancer's `errorsAt(path)` wired manually. Document the limitation; track Signal Forms API evolution; revisit in next minor.

The spike PR documents which branch was reached and why. PR4 docs ship for whichever branch landed.

### 9.4 Tests

If per-field bridge ships:

- `signal-form-bridge.spec.ts` — round-trip writes form → tree → form, assert validation errors surface via Signal Forms' field error API.
- Echo-loop regression — register a Zod transform, type a padded value, assert no write loop.
- Entity rebind — add/remove entity rows, assert the bridge picks them up.

### 9.5 Acceptance criteria

- Spike outcome documented in PR3 description.
- Per-field bridge passes the above tests (if spike succeeded), OR the spike result is documented and a follow-up issue created (if spike failed).
- No regression in the existing `formBridge` (ReactiveForms).

---

## 10. PR4 — Docs

### 10.1 Surfaces

1. **Root README.** New section in the features list pointing to `@signaltree/schema`. Single sentence: "Schema-driven validation via StandardSchema, with first-class async support and a Signal Forms bridge."
2. **`packages/schema/README.md`.** Full user-facing docs:
   - 30-second intro: "register schemas, observe errors per path." One copy-paste snippet.
   - API reference (generated from JSDoc + hand-edited).
   - Wildcard syntax + the precedence rule (D4) explained with examples.
   - Async semantics: `pending`, sequence guard, what `isValid()` reads while in flight.
   - Suppression (`suppressIntents` / `suppressSources`) — examples for time-travel and migration; explicit warning against suppressing `'serialization'`.
   - Bridge integration: "If you use Signal Forms, the bridge reads from this registry; do not pass schemas to the bridge separately."
   - Bundle: "Tree-shakable. Wildcard support is in the main entry; if you don't need collections, … (TODO if subpath split lands)."
3. **`docs/skills/using-signaltree/validation.md`.** AI-discovery skill, terse, optimized for agent retrieval. Same structure as existing skills.
4. **`docs/architecture/`.** This document. Stays as the reference for "why these decisions."
5. **Migration note for guardrails users.** If they were relying on `UpdateMetadata` from `@signaltree/guardrails`, the import path changes to `@signaltree/core` (with a deprecated re-export for one minor).

### 10.2 Acceptance criteria

- Every public API symbol has JSDoc with at least one usage example.
- The validation README runs through the same "AI agent discovery" smoke check used for other recent docs (i.e., a fresh agent asked "how do I validate fields in SignalTree?" reaches the right snippet).
- Skill file matches sibling format under `docs/skills/using-signaltree/`.

---

## 11. Bundle budget

### 11.1 Re-derivation

| Concern | LOC est. | KB gz est. |
|---|---|---|
| StandardSchema runner (sync/async, formatIssue, runtime-error catch) | 40 | 0.4 |
| Issue-path → leaf-path mapping (PropertyKey + `{key}` shapes) | 50 | 0.5 |
| Wildcard pattern compilation + matcher + specificity scoring | 110 | 1.0 |
| Lazy match-on-write + `leafOwner` cache | 60 | 0.6 |
| `PathState` registry + per-path signal memo + GC via `compact()` | 110 | 1.0 |
| Async sequence guard (leaf-side) | 50 | 0.5 |
| Ancestor-run version capture + per-leaf staleness check | 80 | 0.8 |
| Tree-wide aggregates (`errors`, `errorList`, `isValid`, `pending`, `pendingPaths`) | 60 | 0.6 |
| Public API surface, factory, config normalization | 60 | 0.6 |
| **Total estimate** | **~620** | **~6.0 KB gz** |

### 11.2 Budget enforcement

- AGENTS.md bundle-size table gets a new row:

  | Package | Max size | Max gzipped |
  |---|---|---|
  | `validation` | 16 KB | 6 KB |

- CI gate fails if gzipped size exceeds 6 KB.
- Overshoot mitigation: split into `@signaltree/schema` (core) + `@signaltree/schema/collections` subpath import for wildcard machinery. Bare validation (no wildcards) fits in ≤ 3.5 KB.

---

## 12. Test matrix

| Surface | Test file(s) | Notes |
|---|---|---|
| `withWriteContext` | `packages/core/src/lib/__tests__/write-context.spec.ts` | Nesting, throw-safety, async-boundary loss, multi-tree isolation note |
| `interceptLeafSignals` widening | `packages/core/src/lib/internals/__tests__/intercept-leaf-signals.spec.ts` | Backwards compat with 3-arg callbacks, metadata passthrough |
| Guardrails metadata source | `packages/guardrails/src/lib/__tests__/metadata.spec.ts` | Context wins over payload sniff; payload sniff still works |
| Devtools time-travel intent | `packages/core/src/enhancers/devtools/__tests__/time-travel-metadata.spec.ts` | Replays carry `source: 'time-travel'` |
| Validation core | `packages/schema/src/__tests__/*` | Per §8.3 |
| Signal Forms bridge | `packages/ng-forms/src/enhancer/__tests__/signal-form-bridge.spec.ts` | Contingent on §9 spike |
| End-to-end (examples app) | `apps/demo/src/app/validation/*` | One worked example: form → tree → validation → UI |

---

## 13. Risks, mitigations, open items

### 13.1 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Signal Forms API doesn't permit external per-field writables | Medium | High — collapses PR3 to no-ship | §9.1 spike runs **first**, before any bridge code. Outcome gates the rest of PR3. |
| Ancestor-run version capture has an edge case missed in §6.3 | Low | Medium | Comprehensive tests in `ancestor.spec.ts`; review the algorithm with a second reader before PR2 merge. |
| Wildcard match performance under huge entity collections (>10k items) | Low | Medium | Lazy match is O(N) over patterns per write, not O(items). Patterns are typically ≤ 10. Profile if a user reports it. |
| `compact()` is forgotten, memory leaks | High | **Medium for collection-heavy apps** (Low otherwise) | Leak is bounded by *distinct leaf paths ever written that matched a wildcard*, not by current entity count. A long-lived `users.*.email` over a session that churns 10k user rows retains 10k `PathState` + their memoized signals across the session. README characterizes this explicitly. Expose a guardrails rule "validation registry has > N stale paths" in a future minor; consider auto-compact on entity-removal notification when that API exists. |
| Module-level write context fails under SSR with shared trees | Low (antipattern anyway) | Medium | Documented limitation in `withWriteContext` JSDoc. Users sharing trees across SSR requests should use per-request trees. |
| StandardSchema spec evolution breaks `issueToLeafPath` | Low | Low | The mapper is one function; rev-bump and ship a patch. |

### 13.2 Open items — resolved

1. **PR3 §9.1 spike outcome — three branches (A / B / C) per §9.3.** The spike decides which branch; PR3 + PR4 adapt to whichever lands. Resolved at spike time, not before — pre-deciding would force-binarize an inherently three-way outcome.
2. **`UpdateMetadata` open extension — keep open, but narrow the contract.** The `[key: string]: unknown` index signature stays for guardrails backward compatibility. However, the validation enhancer **only reads `intent` and `source`** — both closed unions, both protected at the API surface by `NonNullable<UpdateMetadata['intent']>` and `NonNullable<UpdateMetadata['source']>`. The JSDoc on `UpdateMetadata` (§4.2) explicitly states this: validation reads only these two fields; custom keys are guardrails-private. Future readers should not assume validation honors arbitrary keys.
3. **`compact()` ergonomics — top-level method.** `tree.schemas.compact()` for discoverability. The leak shape is documented in the README per §13.1's updated risk row.

### 13.3 Deferred to follow-ups

- StandardSchema adoption in `@signaltree/events` (Zod decoupling).
- `errorIssuesAt(path)` returning the full issue array.
- Hot-swap schema registry (re-register at runtime).
- Whole-object Signal Forms binding as a perf optimization (only if metrics demand).

---

## 14. Sequencing & timeline

```
PR1: lift UpdateMetadata + write-context channel
  └─→ PR2: @signaltree/schema
        └─→ PR3 spike: Signal Forms per-field capability
              ├── PASS → PR3: signalForm per-field bridge
              │           └─→ PR4: docs
              └── FAIL → PR4: docs (without bridge, with limitation note)
```

**Hard ordering:** PR1 blocks PR2 (validation needs the metadata channel). PR2 blocks PR3 (bridge reads from the registry).

**Soft ordering:** PR4 (docs) can begin in parallel with PR2 once PR2's public API is stable. The README mentions of the validation enhancer can be drafted as soon as §4 is locked (which it is, as of this document).

**No fixed wall-clock estimate** — these PRs are sized by their listed acceptance criteria, not by a calendar. PR1 is ~1–2 days of work; PR2 is the longest (likely 4–6 days including tests and bundle tuning); PR3 spike is half a day, bridge implementation 2–3 days if the spike passes; PR4 is 1–2 days.

---

## 15. Appendix A — Why no `mode: 'reject'`

Some readers will reach for a synchronous "reject the write if invalid" mode. Three reasons it cannot work:

1. **Async schemas.** `StandardSchemaV1.validate` may return a Promise. By the time the Promise resolves, the write has long since notified subscribers. Rolling back at that point means UI flicker and observer confusion — they saw value B, you silently restore value A.
2. **Sync schemas don't save it.** Even with sync schemas, the enhancer observes writes via `interceptLeafSignals` — *after* the underlying `WritableSignal.set` has already updated. The signal API doesn't expose a pre-write hook. We cannot block.
3. **It's not a validation problem.** The right place to gate writes is the form input — Signal Forms already rejects bad input at the field level via `validateStandardSchema`. The store edge is a reporter, not a gate. v1 commits to that role.

If a user genuinely wants to refuse writes at the store edge, they can:
- Use guardrails (already a gating layer for performance rules — extend it for validation if needed).
- Wrap their write sites in a `try/catch` that calls `validate()` first.
- Treat validation errors as a UI concern: render the error, but don't change the model.

---

## 16. Appendix B — Verified facts about the current repo

(Recorded here so subsequent reviewers don't repeat the verification pass.)

- `interceptLeafSignals` callback today: `onWrite(path, next, prev)` — no metadata channel ([packages/core/src/lib/internals/intercept-leaf-signals.ts:22](../../packages/core/src/lib/internals/intercept-leaf-signals.ts#L22)).
- `UpdateMetadata` lives in [packages/guardrails/src/lib/types.ts:115](../../packages/guardrails/src/lib/types.ts#L115). Not currently exported from `@signaltree/core`'s public entry.
- `intent` is a closed union: `'hydrate' | 'reset' | 'bulk' | 'migration' | 'user' | 'system'` (line 117).
- `source` is a closed union: `'serialization' | 'time-travel' | 'devtools' | 'user' | 'system'` (line 119).
- `entityMap` exposes no add/remove notification API — only the parent signal.
- Devtools time-travel goes through `applyState` → leaf `.set()` → `interceptLeafSignals` callbacks ([packages/core/src/enhancers/devtools/devtools.ts:1407](../../packages/core/src/enhancers/devtools/devtools.ts#L1407), [packages/core/src/lib/utils.ts:569](../../packages/core/src/lib/utils.ts#L569)).
- `ng-forms` `formBridge` exists for ReactiveForms ([packages/ng-forms/src/enhancer/form-bridge.ts:56](../../packages/ng-forms/src/enhancer/form-bridge.ts#L56)). No Signal Forms bridge yet.
- `ng-forms` history replays via `formTree.setValues()` → `FormGroup.valueChanges`, not leaf signal writes ([packages/ng-forms/src/history/history.ts:110](../../packages/ng-forms/src/history/history.ts#L110)). Does eventually reach the tree via `formBridge`'s back-write — validation fires there.
- `guardrails.extractMetadata` payload-sniffs at [packages/guardrails/src/lib/guardrails.ts:930](../../packages/guardrails/src/lib/guardrails.ts#L930). Will be updated in PR1 to prefer `getActiveWriteContext()`.
- `@signaltree/events` directly imports Zod runtime types (`z, ZodError, ZodIssue, ZodObject, ZodRawShape`). Zod is a peer dependency (line 48 of `packages/events/package.json`). Not currently on StandardSchema; out of scope here.
- All `packages/*` are uniformly versioned at 9.2.2. No drift.
- No existing `@signaltree/schema` package. No existing `errorsAt`/`isValidAt`/`isPendingAt` API. Greenfield.

---

**End of plan.** Implementation may begin against PR1 immediately.
