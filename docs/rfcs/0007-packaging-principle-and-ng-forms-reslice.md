# RFC 0007 — The packaging principle, and the ng-forms re-slice it forced

**Status:** Decided; implementing on `feat/v13-package-reslice`.
**Date:** 2026-07-24
**Builds on:** [RFC 0005](0005-entity-loader-composition.md) §1 (the injected-feature
precedent, generalized here into a repo-wide rule), §7 (the processor-swallows-throws
fail-closed siting rule)
**Affects:** package boundaries repo-wide; `@signaltree/core`, `@signaltree/ng-forms`,
`@signaltree/events`; breaking (v13)

## 0. Context / problem

The repo ships 9 packages. Some capabilities live inside `@signaltree/core` — as
`.with()` enhancers, or as subpath injected-features (`security()`, `lazy()`,
`loader()`) — while others are separate npm packages (`ng-forms`, `events`,
`realtime`, `schema`, `enterprise`, `guardrails`, `callable-syntax`). The line
between "belongs in core" and "gets its own package" was drawn by instinct at
each addition's creation time. It was never written down, so it could not be
checked against.

Two concrete bugs traced directly to that missing rule:

1. **Form history was unreachable from Signal Forms.** `withFormHistory` lived
   in `@signaltree/ng-forms`, bolted onto `createFormTree`'s Angular `FormGroup`
   via its `valueChanges` stream (`packages/ng-forms/src/history/history.ts`,
   pre-move). `signalForm()` — the Angular Signal Forms bridge
   (`packages/ng-forms/src/signals/marker-bridge.ts`) — has nothing to do with
   `FormGroup`: its `FieldTree` model IS the `form()` marker's values signal
   (`__model`, `packages/core/src/lib/markers/form.ts:737`). A `FormGroup`-only
   history helper structurally could not attach to a `FieldTree`. Undo/redo was
   unavailable to every Signal Forms user, not by design — by substrate
   mismatch nobody had named.
2. **Events had no bridge to `entityMap`.** `@signaltree/events` could receive a
   batch of domain events but had no sanctioned way to turn that batch into
   `entityMap` writes, so every consumer hand-wrote a per-event
   `upsertOne`/`updateOne`/`removeOne` loop — O(N) signal notifications and
   O(N × size) Map clones for what `entityMap`'s own batch ops
   (`upsertMany`/`updateMany`/`removeMany`) already collapse into one.

Both bugs are instances of the same missing rule: nobody had written down what
determines a capability's package.

## 1. The governing principle

> **Independent dependency or runtime → its own package. A within-tree
> mechanic — one that needs only `@signaltree/core` + `@signaltree/shared` —
> → core, as a subpath or an injected `key: helper()` feature.**

This generalizes RFC 0005 §1's `security()`/`loader()` precedent from a
single-marker pattern into the repo's package-boundary test. Applying it:

- `createFormTree`, `signalForm`, and the `FieldValidator` shape all touch
  `@angular/forms` (`FormGroup` or `@angular/forms/signals`'s `FieldTree`) —
  an independent runtime dependency core does not otherwise carry. Own
  package: `ng-forms`.
- Anything that only reads/writes a tree's signals and depends on nothing
  beyond `@signaltree/shared` has no independent-dependency justification for
  living outside core — keeping it separate is pure historical accident, not
  a boundary decision.

**Within any package**, the second half of the rule is unchanged from RFC
0005 §1: capability code arrives via the *import*, config only *carries* it
(a branded feature object), and the absence of the helper on a config key that
expects one fails loud — a coded error — never silent-inert. This is
`security()`/`loader()`'s shape, and it is now `history()`'s.

**The package boundary does not itself buy tree-shaking.** RFC 0005 §0 is the
cautionary tale: `entity-map.ts` *statically imported* `attachLoader` and
called it behind a runtime config check, so the loader shipped in every
`entityMap` bundle for a full version — a boundary existed (loader logic sat
in its own module) and it made no difference, because the *import* was
unconditional. Splitting a capability into its own package or subpath is
necessary but not sufficient; it must be paired with the no-static-import
discipline (the helper's closure is the *only* reference to the engine code)
or the split is cosmetic.

## 2. ng-forms re-slice — measured classification

Every `ng-forms` module was checked against the principle: does it have a
real, structural dependency on `@angular/forms`, or only a `FormGroup`-shaped
`any` and a duck-typed call?

| Module | Real `@angular/forms` dependency? | Verdict |
|---|---|---|
| `createFormTree` | **Yes** — constructs and owns a `FormGroup` | Stays in `ng-forms` |
| `signalForm` | **Yes** — `@angular/forms/signals`' `FieldTree`, `form()`, `validate()`, branded error factories | Stays |
| ng-forms validators (`FieldValidator` shape) | Tied to `createFormTree`'s validator contract | Stays |
| `wizard` | Built on `createFormTree` | Stays — **deferred**: no `signalForm()` path exists yet (flagged, not fixed here) |
| `history` (`withFormHistory`) | **No** — `FormTree` is a local `interface { form: any; … }`; the only real dependency is `FormGroup.valueChanges`/`getRawValue()`, both duck-typed through `any` | **Moved** to core as `history()` |
| `audit` (`createAuditTracker`/`createAuditCallback`) | **No** — depends only on `getChanges` (`@signaltree/shared`) and `ISignalTree` | **Moved** to core |

`history` and `audit` share the same defect: each was placed in `ng-forms` at
creation time because form-adjacent state felt Angular-forms-shaped, but
neither module's code ever imports `@angular/forms`. Under the principle,
that's disqualifying for a separate package — they are within-tree mechanics
that happened to be filed under the wrong tree.

## 3. What shipped (v13)

**Core `history()` injected feature**
(`packages/core/src/lib/form-history/form-history.ts`,
`packages/core/src/lib/types.ts` for `HistoryFeature`/`FormHistoryOptions`):

- Branded `HistoryFeature<T>` (`__signalTreeFormHistory: true`), carried on
  `form({ history: history({ capacity, exclude }) })` — exact `security()`/
  `loader()` shape.
- **Fail-closed at the `form()` FACTORY**, not the marker processor
  (`packages/core/src/lib/markers/form.ts:309-327`, error `[ST2006]`). RFC
  0005 §7 established why: the materializer wraps `create()` in a
  `try/catch` that swallows throws, so a processor-level guard degrades to
  silent no-op instead of failing loud. `history()`'s guard runs synchronously
  at the call site, matching the loader's `[ST2004]` siting.
- **Signal-native — no RxJS.** The engine is a plain `signal<FormHistorySnapshot<T>>`
  with `computed` `canUndo`/`canRedo`; no `valueChanges`, no subscription
  lifecycle to manage.
- **Security `exclude` option**: snapshots are projected through
  `deepClone` + per-excluded-key `delete` before comparison or storage, so an
  edit touching only an excluded field records nothing and undo can never
  resurrect a stripped secret (`form-history.ts:58-64`).
- **Attaches to the marker's values signal** — the same signal `signalForm()`
  uses as its `FieldTree` model (`form.ts:737`, `__model`) — so `history()`
  drives BOTH the marker's `set`/`patch`/`reset`/`clear` API and any bound
  `signalForm()` field tree from one engine. The ng-forms bridge
  (`marker-bridge.ts:283-291`) runs an `effect` over the shared model to
  capture edits made *through* the `FieldTree` (which writes the model signal
  directly, bypassing the marker's mutators); overlap with mutator-side
  recording is deduped by the engine's snapshot-equality guard
  (`form-history.ts:78`), so double-entries and undo/redo feedback loops
  don't occur.
- Legacy `withFormHistory` (`packages/ng-forms/src/history/history.ts`) is
  kept, `@deprecated` since v13, scoped explicitly to `createFormTree`
  (`FormGroup`) users — it is retained, not removed, because `createFormTree`
  itself stays in `ng-forms` per §2 and still needs a history story until (or
  unless) it grows a `signalForm()`-equivalent path.

**`audit` moved to core**
(`packages/core/src/lib/audit/audit.ts`), re-exported from
`packages/ng-forms/src/audit/audit.ts` as a back-compat shim (`@deprecated`,
importing from `@signaltree/core` instead). `createAuditTracker`/
`createAuditCallback` are unchanged in behavior — only their home moved.

**events ↔ entityMap bridge** (`packages/events/src/angular/`):

- `entityEventHandler` (`entity-events.ts`) maps a *batch* of domain events
  onto `entityMap`'s batch ops: events are grouped in-memory (`Map`/`Set`) by
  target id and inferred op (`upsert`/`update`/`remove`, `match`-driven or
  inferred by extractor precedence), same-id touches within a batch are
  folded in arrival order, removal wins over any upsert/update to the same id
  in the same batch, and `update` deltas sharing a structural shape
  (`stableKey`) collapse into one `updateMany` call — so a batch of N events
  costs one `upsertMany` + a handful of `updateMany`/`removeMany` calls
  instead of N individual notifications.
- **O(n²) → O(n) fix in `optimistic-updates.ts`**: `OptimisticUpdateManager`
  previously cloned its whole pending-updates `Map` on every apply/confirm/
  rollback; it now mutates a private `Map` in place and bumps a `signal<number>`
  version counter that all read signals (`pendingCount`/`hasPending`/`pending`)
  depend on, so a burst of N ops is O(N) total instead of O(N²)
  (`optimistic-updates.ts:72-86`).
- `applyOptimisticEntityChange` derives a `rollback` closure automatically
  from the entityMap's current entry at call time (restore the prior entity
  via `upsertOne`, or `removeOne` if the change was a fresh optimistic create
  with no prior entry) — callers no longer hand-write the rollback closure for
  the common single-entity case (`optimistic-updates.ts:312-340`).

**Measured tree-shaking result:**

| Bundle | gzip |
|---|---|
| `form()` only | 7.46 KB |
| `form()` + `history()` | 8.15 KB |
| Δ | **~0.69 KB** |

The history ENGINE identifiers (`canRedo`, `snapshotsEqual`, the undo/redo
branch logic) are absent from the form-only bundle — only the brand property
string (`__signalTreeFormHistory`) leaks in, exactly the same shape as
`loader()`'s `__signalTreeLoader` string leaking into plain-`entityMap`
bundles (RFC 0005 §6/§7). That leak is expected and matches precedent: the
size-matrix gate asserts on engine identifiers, not the brand string, so this
is not a shake defect. A size-matrix gate row locks this in (§4).

**Breaking-change classification:** the core↔ng-forms moves are public-API
relocations (`withFormHistory`'s non-deprecated replacement and `createAuditTracker`/
`createAuditCallback`'s canonical import both change), which is why this rides
in v13 rather than a minor.

## 4. Test-plan / gates

A size-matrix gate row, added to `tools/check-bundle-budget.mjs` and
`scripts/verify-tree-shaking.js` (extending the matrix RFC 0005 §5 established
for the loader), asserting:

- A `form()`-only bundle contains **none** of the history engine identifiers
  (`canRedo`, `canUndo`, `snapshotsEqual`, the undo/redo record/restore
  closures) — forbidden-identifier assertion, per RFC 0005 §5 rule 1.
- A negative-test pass first (RFC 0005 §5 rule 2): the assertion must fail
  against a pre-fix build (history statically imported) before it is trusted
  to pass post-fix.
- A byte budget on the `form()` + `history()` bundle (the measured 8.15 KB,
  with tolerance), so a future regression that re-introduces a static import
  of the history engine is caught by budget as well as by identifier absence.

## 5. Non-decisions (explicitly out of scope here)

- **`wizard`** stays in `ng-forms`, unmoved, and has **no `signalForm()`
  bridge** — flagged as a gap, not resolved. It is built on `createFormTree`
  (§2), so a Signal-Forms-native wizard is a separate, unscheduled design
  problem, not a re-slice.
- No other package (`realtime`, `schema`, `enterprise`, `guardrails`,
  `callable-syntax`) was re-audited against the principle as part of this
  RFC. §1 is the durable rule for *future* placement decisions and for
  whichever package gets audited next; retrofitting the rest of the packaging
  map is not claimed here.

## 6. Forms convergence: one signal-native story, and the `connect()` correction

SignalTree converges on **one** signal-native forms story: the `form()`
marker plus `signalForm()`, built on Angular's real `@angular/forms/signals`
primitives. `createFormTree` (classic Reactive Forms, `FormGroup`) is
deprecated — kept working (§2, §3) but not the recommended path for new code.

That deprecation also corrects a standing error: `createFormTree`'s bridge
code and comments elsewhere in the docs referred to preferring a native
Angular `connect()` API once available. There is no such API — Angular has
never shipped a `connect()` method on `FormControl` or `FormArray`, on any
version. `createFormTree`'s manual bidirectional bridge is not a stopgap for
a missing native primitive; it is the only sync path, and it is what runs
unconditionally on Angular 20/21/22 today.

If classic Reactive Forms interop is ever demanded again, the intended shape
is a thin helper over Angular's real `SignalFormControl`
(`@angular/forms/signals`, 21.2+) — not a maintained parallel tree-builder
like `createFormTree`. No such helper is planned or scheduled; this section
records the shape it should take if the need arises.
