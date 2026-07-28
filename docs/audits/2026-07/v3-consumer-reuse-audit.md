# SignalTree — v3 consumer reuse & upstream audit

**Date:** 2026-07-28
**SignalTree version at consumer:** `@signaltree/core` 13.1.0 (repo `HEAD` 13.1.1) (+ `@signaltree/ng-forms` 13.1.0)
**Consumer audited:** TruckTrax v3 (`~/code/v3`) — 3 SignalTree apps (`trucktrax-geo`, `trax-suite`, `trax-suite-poc`) + shared `packages/store`, `packages/screens`, `packages/signal-forms`
**Affects (if actioned):** `@signaltree/core` (docs recipes; possibly a `helper()` subpath feature) — **no new package proposed** (see B)
**Builds on:** [RFC 0001](../../rfcs/0001-ai-embedded-boundary.md), [RFC 0002](../../rfcs/0002-entity-collection.md), [RFC 0005](../../rfcs/0005-entity-loader-composition.md), [RFC 0006](../../rfcs/0006-status-predicates-and-placement.md), [RFC 0007](../../rfcs/0007-packaging-principle-and-ng-forms-reslice.md)
**Status:** Findings — feeds the RFC process; nothing decided here.
**Validated:** 2026-07-28 against `@signaltree/core` source. **Ethos-reconciled 2026-07-28** after signaltree-maintainer review — each finding now cites the written rule it's judged against (RFC 0001 §2/§4, RFC 0006 §2/§3, RFC 0007 §1). That review moved **A** (→ docs recipe by default), **B** (→ core subpath feature, **not** a package), and **C** (→ userland) off their first-pass placements; **D** stays retracted.

---

## Executive summary

TruckTrax v3 is a large, real SignalTree consumer: three apps on one-tree-per-app +
an `AppStore` facade, using core markers (`entityMap`/`loader`/`status`/`asyncSource`/
`stored`/`form`) as intended. It does **not** reinvent core primitives — a good sign
for the marker surface.

The audit looked for (1) abstractions the consumer built that could live upstream, and
(2) repeated shapes a small generic would DRY. After source-validation **and** an
ethos re-test against the repo's own written rules, the honest tally is:

- **B — a real reuse story, but a *core subpath feature*, not a package** (the earlier
  `@signaltree/entities` framing was wrong under RFC 0007 §1).
- **A — most likely a docs recipe, not API** (RFC 0001 §4.1 default; the API case is
  unproven and the proposed shape has a tree-shaking bug — see below).
- **C — userland**, not core (RFC 0006 §2/§3).
- **E — a consumer cleanup** that corroborates RFC 0006.
- **D — retracted**: already exists in core; a v3 discoverability miss.

The single highest-leverage upstream item isn't A/B/C at all — it's making the **already-shipped
`.computed()` slice feature credibly typed** (see [followups](./v3-consumer-followups.md) G1b):
a primitive you must cast (`as any`) to read is why a typed consumer rejected it and hand-rolled
D's equivalents.

### Priority actions (ethos-reconciled)

| # | Action | Ethos verdict (rule) | Kind |
|---|---|---|---|
| **G1b** | Make `.computed()` slice names typed on `tree.$` (drop the `as any`) | **Do first** — makes a shipped primitive usable, adds no surface (RFC 0001 §4: minimize surface) | Type fix |
| **B** | Generalize `EntityCrudOps` → a `helper()`-style **core subpath feature** composing `loader()` | Reuse is real; **core subpath, not a package** (RFC 0007 §1); must arrive via a branded helper, not a raw `load:` fn (ST2004/ST2006) | Core feature / RFC 0008 |
| **A** | `standardEnhancers` preset | **Docs recipe by default** (RFC 0001 §4.1); core only if the RFC 0006 §2 case is made — and **not** in the proposed static-import+`isProduction`-gate shape (RFC 0007 §1 / RFC 0005 §0) | Docs (likely) |
| **C** | selection read-model | **Userland** — 4 `computed`s over app-owned `selectedIds`; composition already provides it (RFC 0006 §2) and demand is n=1 (RFC 0006 §3) | Userland recipe |
| **D** | ~~`indexBy`/`resolveById`~~ | **RETRACTED — already exists** (`.computed()` + `find`/`where`); v3 alignment | v3 refactor |
| **E** | `LoadableState`/`ErrorableState` superseded by `status()` | Validates RFC 0006; consumer cleanup | n/a |

---

## Method

For each exported symbol in the consumer's `packages/store`, classify by **coupling** (zero
app deps AND broadly useful → upstream candidate), then grep the derived/ops layers for
repeated shapes. **Then apply the repo's own core-vs-userland test to each candidate** —
this second step is what the first pass skipped, and what moved A/B/C. Counts measured
against the v3 tree on 2026-07-28.

The written rules applied:
- **RFC 0001 §2/§4** — the state-concern test + *minimize public surface*; compositions of
  existing primitives ship as **recipes/docs**, because new markers/API add hallucination
  surface for the AI-agent audience.
- **RFC 0006 §2/§3** — core = **universal AND better for being standard/agent-guessable**;
  **pre-demand discipline** (don't ship on n=1); "two ways to do one thing" is anti-ethos.
- **RFC 0007 §1** — **independent runtime → own package; within-tree mechanic with no
  independent dep → core subpath / injected feature.** The package boundary does **not** buy
  tree-shaking.

---

## Reality-check vs core source (2026-07-28)

Re-checked against installed `@signaltree/core@13.1.0` `.d.ts` and source. What core 13.1.x
already ships:

- **`entityMap().computed(name, compute)`** — chainable computed slices on a collection
  (`markers/entity-map.ts`), `compute: (entities: E[]) => R`; on **both** plain
  (`EntityMapBuilder`) and loader-backed (`LoadingEntityMapBuilder`) builders. **Caveat:**
  slice names are **not on the static `tree.$` type** — read via `(tree.$.x as any).name()`.
- **`EntitySignal.find(predicate)` / `.where(predicate)` / `.byId(id)`** + `upsertOne/Many`,
  `setAll`, `removeOne` (`entity-signal.ts`).
- **`status<Err>()`** marker — six predicates: **`notLoaded`, `loading`, `loaded`, `hasError`,
  `idle`, `settled`** (`markers/status.ts:58-93`). Note: it is **`hasError`**, not `error`, and
  **both** composites (`idle` + `settled`) shipped.
- Enhancers export **only** `createEnhancer` / `resolveEnhancerOrder` — **no preset/bundle**.
  `batching`/`timeTravel`/`devTools` are individual exports; nothing composes them.
- **No** CRUD/optimistic engine and **no** selection layer in core.
- `rxjs ^7` is already a **core `peerDependency`** (`packages/core/package.json`) — relevant to B.
- No `leaf()`/value marker exists; leaf-vs-node is a runtime `value && typeof value === 'object'`
  test (`signal-tree.ts:273`) — relevant to the M4 footgun.

| Finding | Verdict after source + ethos check |
|---|---|
| A — enhancer preset | **Docs recipe by default** (RFC 0001 §4.1). Composition of 3 exports + an `if`. Core only if RFC 0006 §2 case is made; proposed shape has a tree-shake bug (below). |
| B — `EntityCrudOps` engine | **Real reuse; core subpath feature, not a package** (RFC 0007 §1 — no independent runtime, `rxjs` already a core peerDep). Must compose `loader()`. |
| C — selection-over-`entityMap` | **Userland.** Composition already provides it (RFC 0006 §2); n=1 demand (RFC 0006 §3). Genuinely can't be a `.computed()` slice (slice sees only `entities`), but that makes it a userland `.derived()`, not core. |
| D — `indexBy`/`resolveById`/predicate lookup | **RETRACTED.** Already exists; v3 alignment/discoverability. |
| E — `LoadableState`/`ErrorableState` | **Confirmed.** Superseded by `status()`; validates RFC 0006. |

---

## Findings

### A. `withStandardEnhancers` — most likely a DOCS RECIPE, not API

**Consumer:** `packages/store/src/lib/tree-enhancers.ts`. Zero coupling — imports only
`@signaltree/core` (`batching`, `devTools`, `timeTravel`, `SignalTreeBuilder`, `TreeNode`):

```ts
export function withStandardEnhancers<T extends object>(
  tree: SignalTreeBuilder<T, TreeNode<T>>,
  { treeName, isProduction }: { treeName: string; isProduction: boolean },
): SignalTreeBuilder<T, TreeNode<T>> {
  const enhanced = tree.with(batching()).with(devTools({ treeName }));
  return isProduction ? enhanced : enhanced.with(timeTravel());
}
```

**Ethos verdict (RFC 0001 §4.1):** this is a **composition of existing primitives** (three
enhancers + an `if`). The repo's decided default for that is a **recipe/doc, not new API** —
new API adds hallucination surface. So the burden is on the *core* case, not the docs case.

**The only path to core is RFC 0006 §2** (universal AND materially better for being
standard/agent-guessable). The first-pass argument ("every app re-derives this") is the RFC
0001 default *for a recipe*, not a case for API. If someone wants it in core, argue §2
explicitly; this audit doesn't consider that case proven.

**The "tree-shaking open question" is already answered — against the proposed shape.** RFC 0007
§1 states the package boundary does **not** buy tree-shaking, citing **RFC 0005 §0**: `entity-map.ts`
statically imported `attachLoader` and gated it on a runtime config check, shipping the loader in
**every** bundle for a full version. A preset that **statically imports `timeTravel` and gates it on a
runtime `isProduction` boolean is that exact bug** — `timeTravel` ships to prod. If A is ever built,
the gating must be structural (separate import path / build-time), not a runtime `if`, and it belongs
in an opt-in `@signaltree/presets`, never core.

### B. `EntityCrudOps` engine — a CORE SUBPATH FEATURE (not a package), composing `loader()`

**Consumer:** `packages/store/src/lib/entity-crud-ops.ts` + `entity-crud-state.ts`
(`EntityCrudConfig`, `EntityCrudSlice`, `entityCrudState`, `EntityCrudOps<T>`). An abstract
optimistic CRUD engine over an injected tree slice: optimistic `upsertOne`/`upsertMany`/`removeOne`
+ rollback, a self-loading `entityMap` (SWR + staleTime + single-flight), a `status()` save marker,
and selection. In `trax-suite-poc` each admin domain is a **~4-line subclass** — 11 domains, one base.

Strongest reuse story in the consumer, and **already generic in shape**. What blocks it as-is is
**coupling** (`entityCrudState()` hardcodes `ApiService.get$(endpoint,{backend})` and
`captureError → NotifyErrorModel`; `EntityCrudConfig` carries `TraxBackend`/`endpoint`).

**Placement (RFC 0007 §1) — core subpath, NOT a package.** The earlier `@signaltree/entities`
proposal was wrong: RFC 0007 §1 gives a package only to code with an **independent runtime**. This has
none — its only async dep is `Observable`, and `rxjs ^7` is **already a core `peerDependency`**. It's a
**within-tree mechanic**, so it belongs as a **core subpath / injected `helper()` feature, shaped like
`loader()` / `security()` / `history()`.**

**It must compose the existing `loader()`, not introduce a parallel `load:` path.** The first-pass
sketch took a raw `load: (filter?) => Observable<E[]>` — precisely what **ST2004** rejects for
`entityMap` and **ST2006** rejects for `form({ history })` (`docs/errors/README.md`). Per RFC 0007's
branded-helper rule, capability must arrive via an imported branded helper with a coded loud failure on
a raw value. So:

```ts
// core subpath (e.g. @signaltree/core, exported like loader/history) — no app deps
export interface EntityCrudConfig<E, K extends string | number, F = void> {
  selectId: (e: E) => K;
  load: EntityLoader<E, F>;                 // the EXISTING loader() branded helper — not a raw fn
  save: (e: E) => Observable<E>;
  remove: (id: K) => Observable<void>;
  errorMap?: (err: unknown, ctx: string) => unknown;
}
```

The app binds `save`/`remove`/`errorMap` to its `ApiService`/`captureError` in one place, and passes
`loader(fn, { staleTime, tags, … })` for `load`. This composes RFC 0002's loader + RFC 0006's `status()`
— a natural next layer, not a competing concept.

**Recommendation:** RFC **0008** (next free number), after the v3 migration PR is reviewed so the base
is production-proven. Scope it as a core subpath feature; do **not** open a new package.

### C. Selection-over-`entityMap` derived — USERLAND (not core)

**Consumer:** `entityCrudSelectionDerived` + `EntityCrudSelection<T>` in `entity-crud-state.ts`.
100% generic — composes core's `EntitySignal`; only coupling is `EntityId` (≡ core's `K`):

```ts
export function selectionDerived<E, K extends string | number>(slice: {
  entities: Pick<EntitySignal<E, K>, 'byId'>;
  selection: { selectedIds: Signal<K[]> };
}) {
  return {
    selectedEntities: computed(() =>
      slice.selection.selectedIds().map(id => slice.entities.byId(id)?.() ?? null)
        .filter((x): x is E => x != null)),
    isMultiEdit:   computed(() => slice.selection.selectedIds().length > 1),
    hasSelections: computed(() => slice.selection.selectedIds().length > 0),
    selectionCount: computed(() => slice.selection.selectedIds().length),
  };
}
```

**Source-validated:** genuinely **cannot** be an `entityMap().computed()` slice — the slice
`compute` is `(entities: E[]) => R`, so it can't read the external, writable `selectedIds`. So the
existing slice feature doesn't cover it; a helper would be net-new.

**Ethos verdict — NOT core (RFC 0006 §2 + §3):**
- **§2 (composition already provides it):** this is four one-line `computed`s over an app-owned
  `selectedIds`. `.derived()` or a custom marker already covers it; adding core surface that duplicates
  composition is the anti-ethos "two ways to do one thing."
- **§3 (pre-demand discipline):** `settled` was *deferred* for want of demonstrated demand despite being
  plausibly universal at sub-byte cost. Selection has **n=1** demand and is **more opinionated** than
  `settled` was. Shipping it now would violate the discipline the repo just applied to a stronger candidate.

**Home:** a documented **userland `.derived()` recipe** — or, if packaged at all, a helper *inside B's*
subpath feature. Never core surface of its own. (Corrects the first-pass "→ core" framing.)

### D. `indexBy` / `resolveById` / predicate-lookup — ~~UPSTREAM~~ **RETRACTED: already exists; v3 not aligned**

Source check shows core 13.1.x already provides all three — v3 hand-rolls equivalents:

| v3 hand-rolled pattern | Already in core 13.1.x |
|---|---|
| `indexBy` — `plants.byUrl`, `device.glinxDeviceEntityMap` as tier-1 computeds looping `record[keyFn(e)] = e` | **`entityMap().computed(name, fn)`** — attach the index at the collection declaration |
| predicate lookups — `entities.all().find(x => …)` / `.all().filter(…)` | **`entities.find(predicate)` / `.where(predicate)`** — reactive `Signal<E \| undefined>` / `Signal<E[]>` |
| reactive-id resolve — `computed(() => id != null ? entities.byId(id)?.() ?? null : null)` | `byId(id)` exists; the wrapper is a one-line `computed` — no helper warranted |

**Verified** in the consumer's installed `.d.ts`. **Recast as v3 alignment** (adopt slices +
`find`/`where`), with the constraint that `.computed()` slices see only `(entities: E[])`, so
cross-domain deriveds legitimately stay tier deriveds. The real upstream signal is **docs/discoverability**
(RFC 0001's "demonstrate the composition serves codegen better than new API"), plus the **G1b typing
gap** that pushed a typed consumer to hand-roll — see [followups](./v3-consumer-followups.md).

### E. Consumer's `LoadableState`/`ErrorableState` are superseded by `status()` — validates RFC 0006

**Consumer:** `packages/store/src/lib/types/state.types.ts` — `LoadableState = { loadingState: LoadingState }`
and `ErrorableState = { error }`, plus a (now-deleted in v3) `createLoadingHelpers` re-deriving
`isLoading/isLoaded/isNotLoaded`. These are **pre-marker manual shapes**; `status()` already provides the
predicate set.

**Signal for 0006:** a real consumer independently rebuilt the exact predicate set `status()` standardizes
— demand evidence for the composite predicates. No upstream action; consumer cleanup. (In v3 GF, the
dead helper was deleted; the remaining `LoadingState` usage is legitimately app-owned per-entity/service
state, which `status()` — a tree-slice marker — is not meant to replace.)

---

## What v3 missed — and the guidance-doc gaps it implies

Mirror image of the findings: what **already existed** and the consumer failed to use, so the
guidance can be hardened. All sites verified against v3 `HEAD` 2026-07-28. Full remediation
guidance is in the companion [implementation brief](./v3-consumer-followups.md).

| # | v3 did | Already existed | Why missed | Guidance fix |
|---|---|---|---|---|
| **M1** | Hand-rolled keyed-index projections (`plants.byUrl`, `device.glinxDeviceEntityMap`) as tier computeds | `entityMap().computed(name, fn)` | *Documented* (SKILL.md:101, reference/core.md:132) but **not credibly typed** — reads need `(tree.$.x as any)`. A typed hand-rolled computed was the escape. | **G1b** (type surfacing) + a cookbook slice example. This is the one *genuine ergonomic gap*, not mere discoverability. |
| **M2** | Kept a pre-marker `LoadingState`/`LoadableState`/helper model | `status()` | Migration reached tree domains but not service/per-entity state | Doc a `LoadingState → status()` recipe **and the scope boundary** (tree-slice vs per-entity/service — no per-entity status primitive). |
| **M3** | `entities.all().find(pred)` in a couple of reactive deriveds | `entities.find`/`.where` | Documented (SKILL.md:101), not in the cookbook | Low/stylistic — `.all().find()` in a `computed` is correct; one-liner in the cookbook. |
| **M4** | Initialized a settable object leaf as `{}` → wrapped as a nested node → `TS2339 … NodeAccessor` | (behavioral) leaf-vs-node rule | Undocumented silent footgun | Document the rule: init `null as Nullable<T>` for a settable object leaf. No `leaf()` marker exists; `null`-init is canonical. |

**Cross-cutting root cause:** mostly **discoverability** (M2/M3/M4), with **one genuine ergonomic
gap** (M1 — the `as any` on a shipped primitive). Corroborates the 2026-04 audit's adoption-barrier
theme: the marker surface is right; the docs under-sell it and one rough edge pushes consumers back to
hand-rolling.

---

## What correctly stays app-coupled (do NOT upstream)

| Consumer symbol | Coupling |
|---|---|
| `EntityCrudConfig`/`entityCrudState`/`EntityCrudOps` *as concretely bound* | `ApiService`, `TraxBackend`, `captureError`, `NotifyErrorModel` |
| `PlantApi`/`OrderApi`/`DeviceApi`/`ThreadApi`/`BluetoothApi` + tokens | TruckTrax endpoints |
| `BannerService`/`SettingsPersistence`/`WaterAddedLike` | app services/DTOs |
| `AppTree`/`APP_TREE` token, `TraxMobileFeatureFlags` | app-level |
| `MessageBus` | generic RxJS event bus, orthogonal to state trees — correctly a service |
| `GlinxDeviceFirmwareData`/`BluetoothDevice` | hardware DTOs (app models) |

---

## What should exist in SignalTree — consolidated

| Item | Where it should live | Status today | Action |
|---|---|---|---|
| **G1b** — computed-slice names typed on `tree.$` | `@signaltree/core` (type-level) | Shipped-but-uncredibly-typed (needs `as any`) | **Highest priority** — see followups G1b |
| **B** — generalized entity-CRUD engine (compose `loader()`; injected `save`/`remove`/`errorMap`) | **`@signaltree/core` subpath / `helper()` feature — NOT a package** (RFC 0007 §1) | Missing | RFC 0008 after v3 PR review |
| **A** — `standardEnhancers` | **Docs recipe** (RFC 0001 §4.1); opt-in `@signaltree/presets` only if the §2 case is made *and* gating is structural | Missing (no preset) | Write the recipe; don't ship the runtime-gated shape |
| **C** — selection read-model | **Userland `.derived()` recipe**, or a helper in B's feature — NOT core (RFC 0006 §2/§3) | Missing (no packaged helper) | Doc recipe |
| **D** — `indexBy` / predicate lookup / reactive-id resolve | already `.computed()` + `find`/`where`/`byId` | Already exists | v3 refactor only |
| **E** — `LoadableState`/`ErrorableState` | superseded by `status()` | Already exists upstream | Consumer cleanup |

---

## Evidence (v3 file references)

- Enhancer preset (A): `v3: packages/store/src/lib/tree-enhancers.ts`
- CRUD engine (B): `v3: packages/store/src/lib/entity-crud-ops.ts`, `entity-crud-state.ts`; consumers `v3: apps/trax-suite-poc/src/app/store/ops/*.ops.ts`
- Selection derived (C): `v3: packages/store/src/lib/entity-crud-state.ts` (`entityCrudSelectionDerived`)
- M1 slice sites: `v3: apps/trucktrax-geo/src/app/store/tree/derived/tier1-entity-resolution.derived.ts` (`plants.byUrl`; `glinxDeviceEntityMap` since removed as dead)
- Superseded types (E): `v3: packages/store/src/lib/types/state.types.ts`
