# SignalTree follow-ups from the v3 consumer audit — implementation brief

**Date:** 2026-07-28
**Companion to:** [`v3-consumer-reuse-audit.md`](./v3-consumer-reuse-audit.md) (findings A–E + misses M1–M4)
**Audience:** an implementing agent. Each item is self-contained: _why → exact files → concrete change → acceptance_.
**Scope of THIS brief:** the "optional-but-optimal" guidance + one enabling type fix (G1–G4).
The larger feature RFCs (audit findings A/B/C) are listed at the end as **deferred**, out of scope here.
**Version baseline:** `@signaltree/core` 13.1.1 (repo `HEAD`). Verify against current `HEAD` before editing.
**Each item cites the written rule that sanctions it** — the structural fix from maintainer review; the
first pass landed A/B/C wrong precisely because the rules (RFC 0001/0006/0007) weren't consulted per item.

---

## Priority order

| ID      | Item                                                                              | Kind         | Priority    | Sanctioning rule                                                                        | Status                 |
| ------- | --------------------------------------------------------------------------------- | ------------ | ----------- | --------------------------------------------------------------------------------------- | ---------------------- |
| **G1b** | Make `.computed()` slice names **typed** on `tree.$` (drop the `as any`)          | **Type fix** | **Highest** | RFC 0001 §4 (minimize surface): makes a _shipped_ primitive usable, adds **no** surface | ✅ **DONE** 2026-07-28 |
| **G1a** | Cookbook: add "derived slices & lookups" section (`.computed()`, `find`, `where`) | Docs         | High        | RFC 0001 §4.1 (composition ships as a recipe)                                           | ✅ **DONE**            |
| **G2a** | status(): add "migrate a manual `LoadingState` enum → `status()`" recipe          | Docs         | High        | RFC 0006 (status supersedes manual shapes)                                              | ✅ **DONE**            |
| **G2b** | status(): document the scope boundary (tree-slice vs per-entity/service loading)  | Docs         | High        | RFC 0006 §2 (niche → userland, not core)                                                | ✅ **DONE**            |
| **G2c** | Close RFC 0006 (idle+settled shipped; RFC still "decision-pending")               | Docs         | Medium      | doc/code drift                                                                          | ✅ **DONE**            |
| **G3**  | Cookbook: fold `find`/`where` one-liner into G1a                                  | Docs         | Low         | RFC 0001 §4.1                                                                           | ✅ **DONE**            |
| **G4a** | Document the object-leaf-vs-nested-node rule (settable object leaves)             | Docs         | High        | RFC 0001 §4 (docs over new marker)                                                      | ✅ **DONE**            |
| **G4b** | Add the `TS2339 … NodeAccessor` symptom → fix to the troubleshooting index        | Docs         | Medium      | discoverability                                                                         | ✅ **DONE**            |
| **G4c** | ~~dev-mode guardrail for the object-leaf footgun~~ **REJECTED** — record why      | Note         | —           | RFC 0001 §4 (no surface for an n=1 compile-time error)                                  | ✅ recorded            |

### What landed (2026-07-28) — where to look

| Item                  | Landed in                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1b                   | `packages/core/src/lib/types.ts` — `ApplyComputedSlices` + `LiteralKeys`, threaded through **both** entityMap arms of `TreeNode<T>`. Type-only; the runtime already attached slices. 5 assertions in `marker-resolution.typing.spec.ts` (single slice, chained slices, loader-backed variant, loader surface survives, **regression**: slice-free collection stays exactly `EntitySignal<E, K>`). Verified present in the emitted `.d.ts`.                |
| G1a + G3              | `docs/guides/entity-collection-cookbook.md` **§2 "Derived slices & lookups"** (new; old §2–§7 renumbered to §3–§8, and the one internal `see §2` ref repointed). Covers slices, `find`/`where`, and the "slice sees only its own entities" boundary.                                                                                                                                                                                                      |
| G2a + G2b             | **New guide** `docs/guides/status-predicates.md` — predicate table, enum→`status()` before/after with the state mapping, the `idle()`-in-guards footgun, and the three-case scope boundary (collection / per-entity / service). Chosen over appending to `migration-v12-v13.md` because none of it is v12→v13-specific.                                                                                                                                   |
| G2c                   | `docs/rfcs/0006-status-predicates-and-placement.md` header → **Accepted**. Note: §5 had _already_ recorded the decision (2026-07-24, shipped 12.1.0) — this was pure **header** drift, not an open question, so the analysis was left untouched and the audit's finding E is linked as the after-the-fact demand evidence.                                                                                                                                |
| G4a                   | `docs/myths-and-misconceptions.md` **Myth 19** + a section in `docs/guides/typing-patterns.md`, cross-linked. Open question closed: **no `leaf()`/value marker exists** (core's public markers are `entityMap`/`status`/`stored`/`form`/`asyncSource`/`asyncQuery` + `loader`/`history`/`linked`/`derivedFrom`), and leaf-vs-node is a runtime `value && typeof value === 'object'` test at `signal-tree.ts:273` — so `null as Dto \| null` is canonical. |
| G4b                   | `docs/errors/README.md` — new **"Compile-time symptoms (not `ST` codes)"** section, deliberately separate from the append-only `ST` tables.                                                                                                                                                                                                                                                                                                               |
| The `as any` teaching | Retired at all four sites that taught it: `SKILL.md`, `reference/core.md`, `llms.txt`, `llms-full.txt`.                                                                                                                                                                                                                                                                                                                                                   |

Also landed alongside (not from this brief): the **`nativeErrors` default flip to `true`** — see
`CHANGELOG.md` (Unreleased/13.2) and the new `docs/guides/migration-v13.2.md`. That resolves a
promise RFC 0004 §4.3 made for "the next major" and then missed across both v12 and v13.

**Sequence note (historical):** G1b was correctly done first — it's the single highest-leverage item in
either document (it makes an _already-shipped_ primitive credibly usable, which is why v3 rejected it —
audit D/M1), and doing it first let G1a's cookbook example ship without a cast.

---

## G1a — Cookbook: "derived slices & lookups" section

**Why:** the entity-collection cookbook (`docs/guides/entity-collection-cookbook.md`) only demonstrates
`load`/`all`/`loading`/`error`. `.computed()` slices and `find`/`where` are documented elsewhere
(`docs/skills/using-signaltree/SKILL.md:101`, `docs/skills/using-signaltree/reference/core.md:132` —
there is no `docs/reference/`) but a consumer reading the cookbook never meets them — v3 hand-rolled two
keyed-index projections as a result (audit M1).

**File:** `docs/guides/entity-collection-cookbook.md` — add a new section (suggest after §1 "Baseline",
before §2 "ETags", so it sits with the read surface).

**Content to add** (adapt prose to the cookbook's voice; keep the `plants` example it already uses):

- A **computed slice** attaches a derived projection to the collection _at declaration_, so it lives
  next to the data instead of in a separate `computed` in a derived layer:
  ```typescript
  plants: entityMap<PlantDto, string>({
    selectId: (p) => p.url,
    load: loader(() => this.http.get<PlantDto[]>('/api/plants'), { staleTime: '30m' }),
  }).computed('byUrl', (all) => Object.fromEntries(all.map((p) => [p.url, p]))),
  ```
  Read it as `store.tree.$.plants.byUrl()`. **Call out the current typing caveat** (see G1b): until
  G1b lands, slice names aren't on the static `tree.$` type — read via `(store.tree.$.plants as any).byUrl()`.
  Once G1b lands, drop the cast from this example.
- Slices work on both plain **and** loader-backed collections (verified: `LoadingEntityMapBuilder`
  exposes `.computed()` too — `packages/core/src/lib/markers/entity-map.ts:115-127`).
- **When to use a slice vs a derived layer:** a slice's `compute` receives only that collection's
  `E[]`. Anything that needs _other_ state (another collection, an external id signal) must stay a
  normal `computed`/derived — the slice can't see it. (This is exactly why v3's cross-domain
  `driverConfig.truck.entity` correctly stays a tier derived.)

**Acceptance:** cookbook shows a `.computed()` slice on the `plants` example, states the typing caveat
(and its removal condition), and states the "slice sees only its own entities" boundary.

---

## G1b — Surface `.computed()` slice names on the static `tree.$` type

**Why (the highest-ethos item in either document):** this isn't "ergonomics" — **a shipped primitive is
not credibly typed.** `.computed()` is documented as _"slice names aren't on the static `tree.$` type yet,
so read it via `(tree.$.users as any).name()`"_ (`docs/skills/using-signaltree/SKILL.md:101`,
`docs/skills/using-signaltree/reference/core.md:132`). **An API you must cast (`as any`) to use is worse
than no API** for the AI-agent audience that is SignalTree's stated primary consumer (RFC 0001) — the cast
defeats exactly the inference guarantee that sells the library. The proof is in this very audit: finding D
was _retracted_ because a typed consumer met this feature, rejected it, and hand-rolled a typed equivalent.
So this **outranks A, B, and C** — it makes an existing primitive usable instead of adding new surface
(RFC 0001 §4: minimize surface). Fix this before considering any of the deferred features.

The **builder** already tracks slices at the type level:
`EntityMapBuilder<E, K, Slices & Record<N, R>>` (`packages/core/src/lib/markers/entity-map.ts:84-105`,
loading variant `:115-127`). The types are **lost when the marker is materialized into `tree.$`** — that
is the gap to close.

**Files (investigate, then change):**

- `packages/core/src/lib/markers/entity-map.ts` — the `Slices` type param and `__computedSlices` /
  `EntityMapComputedSlices` carriers (lines ~41–130, ~262–318). The runtime already attaches slices to
  the entity signal (`(entitySignal as any)[name] = computedSignal`, ~line 269); the type just needs to
  flow through.
- The tree materialization / `$` accessor type (the walker that turns markers into `tree.$`). Trace from
  where an `entityMap` marker becomes an `EntitySignal` on `tree.$` and thread the `Slices` record onto
  the resulting accessor type as `{ [N in keyof Slices]: Signal<Slices[N]> }`.

**Approach:** carry the `Slices` generic from the builder into the resolved `EntitySignal` type
(`EntitySignal<E, K> & { [N in keyof Slices]: Signal<Slices[N]> }`) so `tree.$.plants.byUrl` is typed
`Signal<Record<string, PlantDto>>` with no cast. Keep it purely type-level (no runtime change — the
runtime already works).

**Caveats / watch-outs:**

- This may be non-trivial if the walker widens marker types on the way into `tree.$`. If a clean typed
  path isn't feasible without a large refactor, **write it up as an RFC** rather than forcing it — but
  capture the decision; it's the single highest-leverage ergonomic fix from this audit.
- Add a type-level test (the repo has `.spec.ts` type assertions — mirror the style in
  `packages/core/src/lib/markers/entity-map.spec.ts` if present) proving `tree.$.x.sliceName()` is typed.

**Acceptance:** `store.tree.$.plants.byUrl()` type-checks as `Signal<Record<string, PlantDto>>` with **no
`as any`**; a type test asserts it; the `SKILL.md:101` / `core.md:132` "read via `(… as any)`" caveats are
updated to reflect the fix; G1a's example drops the cast.

---

## G2a — status(): "migrate a manual `LoadingState` enum → `status()`" recipe

**Why:** v3 carried a pre-marker loading model (`LoadingState` enum + `LoadableState`/`ErrorableState`
interfaces + a hand-written `createLoadingHelpers()` re-deriving `isLoading/isLoaded/isNotLoaded`) in
~30 sites _alongside_ `status()` — the migration didn't reach that subsystem (audit M2). A migration
recipe would have made the replacement obvious.

**File:** best home is the v12→v13 migration guide `docs/guides/migration-v12-v13.md` (add a section),
cross-linked from RFC 0006. If a dedicated status guide is preferred, create
`docs/guides/status-predicates.md` and link it from `docs/guides/` index + RFC 0006.

**Content to add** — a before/after:

- **Before:** `enum LoadingState { NotLoaded, Loading, Loaded }` on a slice + a helper turning that signal
  into `isLoading/isLoaded/isNotLoaded`.
- **After:** `status<Err>()` on the slice; read `s.loading()/loaded()/notLoaded()/hasError()/idle()/settled()`
  directly — the helper is deleted. Map the enum states: `NotLoaded→notLoaded()`, `Loading→loading()`,
  `Loaded→loaded()`, error→`hasError()`.
- **Note the exact predicate names** (source of truth `packages/core/src/lib/markers/status.ts:58-93`):
  `notLoaded`, `loading`, `loaded`, `hasError`, `idle`, `settled`. It is **`hasError`**, not `error`.
- **Reference the existing guard footgun note** already in source (`status.ts:70-73`): in a
  guard/resolver use `idle()`, **not** `notLoaded()` — `notLoaded()` is strictly `state === NotLoaded`,
  so a `notLoaded()`-gated fetch silently never retries after an error.

**Acceptance:** a migration section shows the enum→`status()` before/after with correct predicate names
and the `idle()`-in-guards note.

---

## G2b — status(): document the scope boundary (tree-slice vs per-entity/service loading)

**Why:** part of v3's `LoadingState` survived because `status()` didn't obviously cover _service-level_
(Bluetooth pairing) and _per-entity_ (per-thread message) loading — and there's **no per-entity status
marker in core** (verified: `status()` is one marker per slice; the entityMap loader surface is
collection-level with `loading()/loaded()/error()` only — no `notLoaded()`). Consumers need to be told
how to model those cases so they don't fall back to a hand-rolled enum.

**File:** same location as G2a (add a short "What `status()` is and isn't for" subsection).

**Content to add:**

- `status()` models the load lifecycle of **one tree slice**. Use one per domain/collection that loads.
- **Collection-level** load state → the `entityMap({ load: loader(...) })` loader surface
  (`loading()/loaded()/error()`), not a separate `status()`.
- **Per-entity** load state (e.g. "is _this row_ loading") → **not** a core primitive. Model it as a
  small `loadingIds` set/slice on the domain, or a per-entity status map you own — don't put a
  `loadingState` field on the data DTO.
- **Service-level** state that isn't in a tree → prefer moving it into a tree domain and using
  `status()` there; if it must stay in a service, that's app-owned (core doesn't reach outside the tree).

**Acceptance:** the guide states the three cases (collection / per-entity / service) and the recommended
modeling for each, explicitly noting there is no per-entity status primitive.

---

## G2c — Close RFC 0006 (doc/code drift)

**Why:** `docs/rfcs/0006-status-predicates-and-placement.md` is still **"Spike / decision-pending"** and
§4 leaned "`idle` now, `settled` deferred until demand shows." Core 13.1.1 **ships both `idle` and
`settled`** (`status.ts:58-93`) — the closed-set option was taken in code while the RFC still reads
undecided. The v3 consumer supplies the missing demand evidence (it independently rebuilt the exact
predicate set).

**File:** `docs/rfcs/0006-status-predicates-and-placement.md`.

**Change:** flip **Status** to `Accepted` (or the repo's terminal status term — check how 0001–0005 are
marked and match). Add a short "Resolution" note: closed set = `notLoaded/loading/loaded/hasError/idle/settled`;
cite that it shipped in code and that the v3 consumer audit
(`docs/audits/2026-07/v3-consumer-reuse-audit.md`, finding E) is the demand evidence. Do **not** rewrite
the analysis sections — just resolve the header + add the note.

**Acceptance:** RFC 0006 header reads as decided, the shipped predicate set is recorded, and it links the
audit as evidence.

---

## G3 — Cookbook: `find`/`where` one-liner

**Why:** `entities.find(pred)`/`.where(pred)` return reactive `Signal<E|undefined>`/`Signal<E[]>` and are
documented in `SKILL.md:101` but not the cookbook; v3 used `.all().find(...)` in a few reactive deriveds
(audit M3 — low severity; `.all().find()` inside a `computed` is _correct_, the accessors just save a wrap).

**File:** `docs/guides/entity-collection-cookbook.md` — fold into the G1a section (one line + a snippet):

```typescript
const active = store.tree.$.plants.find((p) => p.active); // Signal<PlantDto | undefined>
const inRegion = store.tree.$.plants.where((p) => p.regionUrl === url); // Signal<PlantDto[]>
```

Note: prefer these for a **standalone reactive** lookup; a one-shot imperative read
(`store.tree.$.plants.all().find(...)`) is fine and doesn't need a signal.

**Acceptance:** cookbook mentions `find`/`where` with the "standalone signal vs one-shot read" guidance.

---

## G4a — Document object leaves vs nested nodes (settable object leaves)

**Why (real debugging cost in v3):** initializing an object-typed leaf as `{} as SomeDto` makes SignalTree
wrap it as a **nested `TreeNode`**, not a settable leaf — so `.set(...)` doesn't exist and you get
`TS2339: Property 'set' does not exist on type 'NodeAccessor<…>'`. v3 hit this on
`connectedFirmwareData` and fixed it by initializing `null as Nullable<SomeDto>` and defaulting to `{}`
at the consumer (audit M4). This rule is documented **nowhere** in `docs/`.

**File:** the state-shape guidance a consumer actually reads. Recommended: add to
`docs/myths-and-misconceptions.md` (a "gotchas" home) **and** a short note in
`docs/guides/typing-patterns.md`. Cross-link from both.

**Content to add:**

- **Rule:** a plain-object initializer (`{}`, `{ a: 1 }`) at a state key becomes a **nested node**
  (its fields become individual leaves); it is **not** a single settable value. Calling `.set()` on it
  is a type error (`NodeAccessor` has no `.set`).
- **To keep an object as one settable leaf** (you replace the whole object atomically — e.g. a DTO you
  swap wholesale), initialize it **`null`** with the object type: `firmware: null as Nullable<FirmwareDto>`
  — then `firmware.set(dto)` / `firmware()` work, and consumers default with `firmware() ?? {}`.
- Show the failing form and the fix side by side.
- **`null as Nullable<T>` is the canonical answer — there is no `leaf()`/value marker to reach for.**
  (Verified: core's public exports are `signalTree`/`entityMap`/`status`/`asyncSource`/`asyncQuery`/
  `loader`/`history`/`linked`/`derivedFrom`/`defineStore`/`batching`/`devTools`/`timeTravel` — no leaf
  marker.) Leaf-vs-node is decided by a runtime `value && typeof value === 'object'` test
  (`packages/core/src/lib/signal-tree.ts:273`), which is _why_ `{}` becomes a node and `null` stays a
  settable leaf. A `leaf()` marker is a conceivable alternative but should stay **unshipped absent demand**
  (RFC 0006 §3) — the `null`-init idiom needs no new surface. So G4a can be written now, no core check
  pending.

**Acceptance:** a consumer-facing doc states the object-vs-node rule, shows the `TS2339 NodeAccessor`
symptom, and gives the `null`-init fix as canonical.

---

## G4b — Troubleshooting index entry for the `NodeAccessor` symptom

**Why:** `docs/errors/README.md` is the greppable "I hit this, what now" index. The object-leaf mistake
surfaces as a **compile-time** `TS2339 … NodeAccessor` (not a runtime `ST` code), so it won't get an
`ST` number — but the README is where people search, and it should route them to G4a.

**File:** `docs/errors/README.md`.

**Change:** add a short subsection **after** the `ST` tables, e.g. "## Compile-time symptoms (not `ST`
codes)", with one row: _`Property 'set' does not exist on type 'NodeAccessor<…>'`_ → you initialized an
object state key as `{}` (a nested node) but tried to `.set()` it as a leaf → see G4a's guide; init
`null as Nullable<T>` for a settable object leaf. Keep it clearly separated from the append-only `ST`
code tables so the code numbering scheme is untouched.

**Acceptance:** searching the README for `NodeAccessor` or `does not exist on type 'NodeAccessor'` lands
on the fix.

---

## G4c — dev-mode guardrail for the object-leaf footgun — **REJECTED (record the decision)**

**Considered and rejected.** A dev-mode `ST20xx` guardrail was considered for the object-leaf mistake.
It fails RFC 0001 §4 (minimize surface): the mistake is **already caught at compile time** (`TS2339`),
the demand is **n=1**, and the runtime can't read author intent (was `{}` meant as a leaf or a node?), so
a guardrail could only fire on an unreliable proxy signal. Adding a coded warning for a single compile-time
type error is surface-for-nothing and edges toward "two ways to do one thing." **Docs (G4a/G4b) are the
fix.**

**Action:** none — this section exists so the option is on record as _considered, rejected, why_, not
silently dropped. Do not open an `ST` code for it.

---

## RESOLVED — findings A/B/C determined 2026-07-28 (hold lifted)

The hold on these was "until the v3 migration PR is reviewed." **That review is
done** (see the review notes in the reuse audit), so the determinations are made
rather than carried forward:

|                              | Determination                                                                 | Delivered as                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **A** — enhancer preset      | **Not core API.** A docs recipe.                                              | [`docs/guides/composition-recipes.md` §1](../../guides/composition-recipes.md#1-a-standard-enhancer-policy) |
| **B** — entity-CRUD Ops      | **Not API yet.** Recipe now; RFC 0008 only if the recipe proves insufficient. | [§2](../../guides/composition-recipes.md#2-a-reusable-entity-crud-ops-base)                                 |
| **C** — selection read-model | **Not core API.** Userland `.derived()` recipe.                               | [§3](../../guides/composition-recipes.md#3-a-selection-read-model)                                          |

**What the v3 review changed.** Two things, in opposite directions:

- It _weakened_ A's only technical argument for core. The case had been that a
  userland helper cannot type its own return value — v3 had annotated a narrower
  return type with a comment explaining that the enhancer-augmented type wasn't
  "portably nameable." That was a real bug, but in the **barrel**, not in the
  design: `DevToolsMethods` and `OptimizedUpdateMethods` weren't exported.
  **Fixed in 13.2.0**, so a userland helper now types correctly and A has no
  remaining structural reason to be in core.
- It _strengthened_ B's evidence while confirming it shouldn't ship as API yet.
  The engine is genuinely proven — twelve domains, each an ~8-line subclass — but
  its coupling is unchanged (`backend`/`endpoint` and hardcoded REST verb/URL
  conventions), and the reusable parts are already shipped primitives. What
  remains is an `extend`-this base class plus one app's REST conventions.

The recipe also carries two corrections the review produced that any future API
would have to respect: rollback must **snapshot prior values** (`updateAndReport()`
returns changed _paths_, not previous values, so it cannot restore state), and it
must restore the **whole** of what an operation touched — a real bug had
`delete$` restoring `[id]` instead of the user's actual prior selection, with a
test that passed only because it selected exactly the row it deleted.

If B is ever built, the constraints below still bind.

---

## Original analysis — feature RFCs (audit findings A/B/C)

These are genuine upstream _features_, tracked in the audit; they need RFCs/implementation, not "guidance,"
and are intentionally out of scope for this pass. **Each was re-tested per item against RFC 0001 §2/§4,
RFC 0006 §2/§3, and RFC 0007 §1** (the maintainer-review structural fix). That test moved all three off
their first-pass placements:

- **A — enhancer preset** (`standardEnhancers({ treeName, isProduction })`): **docs recipe by default, not
  API.** It's a composition of three exports + an `if`, and RFC 0001 §4.1's decided default for compositions
  is a **recipe/doc, not new surface**. The case for _core_ would have to be made explicitly under RFC 0006
  §2 (universal + agent-guessable) — this audit doesn't consider that proven. And the proposed shape is
  **broken for tree-shaking**: statically importing `timeTravel` and gating it on a runtime `isProduction`
  boolean is exactly the **RFC 0005 §0 `attachLoader` bug** (static import + runtime gate ships the code in
  every bundle), which RFC 0007 §1 cites to show the package boundary doesn't buy tree-shaking. If ever
  built, gating must be **structural** (separate import path / build-time), in an opt-in `@signaltree/presets`,
  never core.
- **B — generalized `EntityCrudOps`** (injected `save`/`remove`/`errorMap`, composing the existing
  `loader()`): **a core subpath / `helper()` feature — NOT a package.** RFC 0007 §1 grants a package only to
  code with an **independent runtime**; this has none (its only async dep is `Observable`, and `rxjs ^7` is
  **already a core `peerDependency`**). It's a **within-tree mechanic**, so it belongs as a core subpath
  feature shaped like `loader()`/`security()`/`history()`. Two hard constraints: (1) it must **compose the
  existing `loader()` branded helper**, not take a raw `load:` function — a raw fn is exactly what **ST2004**
  (entityMap) and **ST2006** (form/history) reject, per RFC 0007's branded-helper rule; (2) capability
  arrives via the imported helper with a coded loud failure on a raw value. The earlier "`@signaltree/entities`
  package" framing is **retracted**. RFC **0008**; hold until the v3 migration PR is reviewed.
- **C — selection read-model** (`selectedEntities`/`isMultiEdit`/`hasSelections`/`selectionCount` over
  app-owned `selectedIds`): **userland, not core.** Two rules kill the core case: RFC 0006 **§2** — it's four
  one-line `computed`s over an app-owned signal, so composition (`.derived()`) already provides it (reject
  "two ways"); and RFC 0006 **§3** — `settled` was _deferred_ for want of demand despite being plausibly
  universal at sub-byte cost, and selection has **n=1** demand and is **more opinionated** than `settled`
  was. Home it in **userland** (a documented `.derived()` recipe) or as a helper inside B's feature.

See `v3-consumer-reuse-audit.md` (findings A/B/C + consolidated table) for the full spec — now carrying
these corrections.
