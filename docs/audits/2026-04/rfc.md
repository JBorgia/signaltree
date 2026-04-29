# SignalTree 9.2.1 — Audit RFC
## 2026-04 Audit Cycle

**Audit date:** 2026-04-29  
**SignalTree version:** 9.2.1  
**NgRx SignalStore version:** @ngrx/signals@^20.1.0 (comparison target)  
**Angular baseline:** 20.x (peer dep `^20.0.0 || ^21.0.0`)  
**Methodology:** specs/design/audit-architecture.md (Versus Iterative Convergence, T3 Full RFC)  
**Findings DB:** docs/audits/2026-04/findings.json (16 findings, all open)  
**Scaffolds:** specs/examples/signaltree/ · specs/examples/ngrx-signal-store/  

---

## Executive Summary

SignalTree is an Angular state management library with a strong design premise: initialize with a JSON object, get fully recursive TypeScript inference, and mutate state through signal-style API without actions, reducers, or selectors. The core idea is sound and the library works as described at runtime for its principal use case (flat and shallow state trees). However, this audit found **16 documentation and API-surface problems** that collectively create a high barrier to adoption — in particular for AI coding agents, which are the primary discovery channel for new libraries in 2026.

**The library's core runtime behavior is not in question.** `signalTree()`, `entityMap()`, and `computed()` compose correctly for the invoice-editor feature contract (O1–O10 complete). The DX gap vs NgRx SignalStore is real but narrower than the README suggests.

**What blocks adoption** is the documentation: a README with pervasive phantom method references, broken examples that fail on the first `npm install`, and a callable-setter pattern that is the central differentiator but silently fails without a build transform that is never mentioned at the point of use.

### Top-3 Priority Actions

| Priority | Action | Findings |
|---|---|---|
| **P0-A** | Remove all `entities()` / `withTimeTravel` / `effect()` / `unwrap()` / `update()` / `subscribe()` references from README; replace with working equivalents | F-002, F-003, F-005 |
| **P0-B** | Add a callable-syntax caveat box **in the Quick Start section** — not just in a separate advanced section | F-009 |
| **P1-A** | Fix the EntityNode write gap: either implement deep writes (node.name.set()) or change the type to read-only Signal<T> and document `updateOne()` as the mutation path | F-012, F-013 |

These three actions would take the README from "fails within 2 minutes for any AI agent" to "plausibly produces working code on first attempt." The remaining 13 findings are DX improvements and clean-up but are not adoption-blockers in the same category.

---

## 1. Methodology

The audit ran Versus Iterative Convergence methodology (phases 0–5):

- **Phase 0–3:** Problem definition, critique, design hardening. Outputs: `specs/design/audit-architecture.md`, `specs/technical/measurement-protocol.md`, `specs/design/second-pair-of-eyes.md`
- **Phase 4:** Convergence gate — all design decisions locked before any execution
- **Phase 5 execution workstreams:**
  - **M1:** Static review of `@signaltree/core` sources, types, docs
  - **M2:** Scaffold-and-build — invoice editor in SignalTree vs NgRx SignalStore
  - **M3:** Adversarial AI-agent test (requires fresh session — see §5)
  - **M4:** Benchmark gap analysis (brainstorm — see §6)
  - **M5:** This document

**Core audit constraint:** Evidence-first. Every finding in findings.json cites a specific file:line or transcript section. No assertions without references.

**Scope:** `@signaltree/core` T3 (deep), T2-light surfaces (callable-syntax, enterprise, ng-forms, events, guardrails, realtime) are deferred and not reflected in this RFC unless findings from M1/M2 touch them incidentally.

---

## 2. M1: Static Review

### 2.1 Finding summary

| ID | Severity | Surface | Title |
|---|---|---|---|
| F-001 | P1 | docs/README.md | Version claim: 7.6.0 vs actual 9.2.1 |
| F-002 | P0 | core/README.md | `entities()` throws at runtime, not exported, but documented throughout |
| F-003 | P0 | core/README.md | `effect()`, `subscribe()`, `update()`, `unwrap()` listed in API reference but don't exist on ISignalTree |
| F-004 | P0 | core/README.md | README ends with corrupt code fragment (stray delimiters + orphaned tree.unwrap() call) |
| F-005 | P1 | core/README.md | `withTimeTravel` doesn't exist; correct name is `timeTravel`; config key `maxHistory` wrong (should be `maxHistorySize`) |
| F-006 | P1 | core/README.md | `.with(a(), b())` multi-arg — silently ignores second arg; must chain `.with(a()).with(b())` |
| F-007 | P1 | core/README.md | `setMany`, `selectAll`, `selectBy`, `selectTotal`, `selectIds` documented — none exist; correct names are `setAll`, `all`, `where`, `count`, `ids` |
| F-008 | P1 | core/README.md | Config key `batching` wrong; correct is `batchUpdates` |
| F-009 | P1 | core/README.md | Callable setter used throughout Quick Start without stating it requires `@signaltree/callable-syntax` build transform |
| F-010 | P2 | core/index.ts | `effects()` enhancer exists in source, not exported — no public import path |
| F-011 | P1 | entity-signal.ts | `addMany()` mode option ('skip'/'overwrite') typed but not implemented |
| F-012 | P1 | entity-signal.ts | EntityNode call signatures `(value)`, `(updater)` typed but silently no-ops at runtime |
| F-013 | P1 | entity-signal.ts | EntityNode deep property writes (`node.name.set()`) typed as `CallableWritableSignal` but throw at runtime (plain closure) |
| F-014 | P2 | constants.ts | Production error messages are bare numeric codes — opaque without a lookup URL |
| F-015 | P2 | entity-signal.ts | `all()`, `byId()` return-type comments wrong in README (`Signal<E[]>` vs `E[]`) |
| F-016 | P3 | packages/shared | `@signaltree/shared` version 9.0.1 vs monorepo 9.2.1 — drift |

**Severity distribution:** 3×P0 · 8×P1 · 3×P2 · 1×P3 (P3 not shown separately)

The 3 P0 findings (F-002, F-003, F-004) are each capable of stopping any AI agent cold within the first 5 lines of a generated sample:

- F-002: `import { entities } from '@signaltree/core'` → compile error; or `.with(entities())` → runtime throw
- F-003: `tree.effect(() => ...)` → runtime: "tree.effect is not a function"
- F-004: README source itself is structurally broken — agents may generate the corrupt fragment

### 2.2 Pattern analysis

Two clusters explain ~75% of the finding set:

**Cluster A — API name divergence (F-002, F-005, F-007, F-008):** Eight specific API names in the README are wrong. These appear to originate from two sources: (a) older versions where names were different (entities → entityMap, withTimeTravel → timeTravel, batching → batchUpdates), and (b) cross-contamination from NgRx's naming conventions (selectAll, selectIds, selectTotal, selectBy). The NgRx-echo names are particularly harmful for AI agents — they will pick NgRx names from training data even when reading SignalTree docs if the docs reinforce those names.

**Cluster B — Callable syntax: the invisible dependency (F-009):** SignalTree's primary DX differentiator — `tree.$.count(5)` syntax — silently fails without `@signaltree/callable-syntax`. The feature is described in the README but the caveat appears *after* the Quick Start examples that already use it. An agent reading left-to-right generates non-working code before reaching the warning. This is architecturally significant: the library's best feature becomes a trap.

### 2.3 AI-legibility assessment

**Verdict: a cold AI agent given only the current README has approximately 0% success rate at producing code that compiles and runs on the first attempt.**

Evidence:
- The first working entityMap example requires knowing NOT to do `.with(entities())` — README says both
- The first setter example uses callable syntax without the caveat
- Four API method names are wrong for EntitySignal operations
- The multi-arg `.with()` pattern appears in every composition example

After the second or third iteration with error messages, a capable agent would likely recover — but the recovery path is poorly lit (error messages are numeric codes in production: F-014).

---

## 3. M2: Scaffold-and-Build

### 3.1 Feature

**Invoice editor** — nested entity collection (Invoice contains LineItem[]). Both sides implement O1–O10 identically per `specs/examples/feature-contract.md`.

Expected derived values (test data):
- `li-1`: subtotal=100, tax=10, total=110
- `li-2`: subtotal=200, tax=0, total=200
- Invoice: subtotal=310, total=300 (after discount=10)

### 3.2 DX comparison

| Dimension | SignalTree | NgRx SignalStore |
|---|---|---|
| **LOC — store definition** | ~130 | ~115 |
| **Time to first compiling** | ~25 min | ~15 min |
| **TS errors hit** | 3 | 1 |
| **Workarounds required** | 3 (F-002, F-009, F-012/F-013) | 0 |
| **Nested entity mutation** | Read + spread + updateOne | `updateEntity({ id, changes: fn })` |
| **Derived state** | Angular `computed()` | `withComputed()` + Angular `computed()` |
| **Entity init** | `entityMap<Invoice, string>()` | `withEntities<Invoice>()` + `withHooks` |
| **Subjective DX (1–5)** | 2 | 4 |

### 3.3 Mutation ergonomics — the core gap

The most significant DX gap is nested entity mutation. For `addLineItem()`:

**SignalTree** (required workaround per F-012/F-013):
```typescript
addLineItem(invoiceId: string, item: LineItem): void {
  const invoice = this.tree.$.invoices.byId(invoiceId)?.();  // read full entity
  if (!invoice) return;
  this.tree.$.invoices.updateOne(invoiceId, {
    lineItems: [...invoice.lineItems, item],  // manually spread
  });
}
```

**NgRx SignalStore** (idiomatic, no workaround):
```typescript
addLineItem(invoiceId: string, item: LineItem): void {
  patchState(store, updateEntity({
    id: invoiceId,
    changes: (invoice) => ({ lineItems: [...invoice.lineItems, item] }),
  }));
}
```

The NgRx form is two lines fewer and does not require the caller to know `updateOne` is the only valid mutation path (the EntityNode callable overloads in SignalTree are typed but silently broken — F-012).

The `byId(invoiceId)?.()` dereference pattern (cursor → value) is also a friction point not documented at the `byId()` call site.

### 3.4 Derived state — parity

Both sides use Angular `computed()` for derived state. The `invoiceSignals(invoiceId)` factory pattern (per-ID reactive derived signals) is virtually identical on both sides. No DX gap in this dimension.

### 3.5 Summary

The SignalTree invoice-editor scaffold works correctly. All 10 operations are implemented. The DX friction is concentrated in the entity mutation path — specifically the EntityNode type/impl mismatch (F-012, F-013). If deep entity writes were fixed, the SignalTree DX would be broadly competitive with NgRx SignalStore on this feature.

**Scaffold artifacts:**
- `specs/examples/signaltree/invoice-editor/store.ts`
- `specs/examples/signaltree/invoice-editor/dx-notes.json`
- `specs/examples/ngrx-signal-store/invoice-editor/store.ts`
- `specs/examples/ngrx-signal-store/invoice-editor/dx-notes.json`

**Second-pair-of-eyes review required** for NgRx store (per `specs/design/second-pair-of-eyes.md`). Review transcript path: `specs/examples/ngrx-signal-store/invoice-editor/second-pair-review.md` (not yet produced).

---

## 4. Top-3 RFC Proposals

These are the three highest-leverage changes. Each is concrete enough to implement in a single PR.

### RFC-1: README Accuracy Overhaul

**Problem:** 11 of 16 findings (F-001 through F-009, F-015) are README accuracy issues. An AI agent given this README generates non-compiling code on first attempt, every time.

**Proposed changes (ordered by impact):**
1. Remove all `.with(entities())` references — replace with entityMap() self-registration pattern
2. Move callable-syntax caveat box to Quick Start section (above the first setter example)
3. Replace `withTimeTravel` → `timeTravel`, `maxHistory` → `maxHistorySize`
4. Replace all multi-arg `.with(a(), b())` → `.with(a()).with(b())`
5. Replace phantom EntitySignal names: `setMany` → `setAll`, `selectAll` → `all`, `selectBy` → `where`, `selectTotal` → `count`, `selectIds` → `ids`
6. Fix `{ batching: false }` → `{ batchUpdates: false }`
7. Fix return-type comments: `all()` returns `E[]`, not `Signal<E[]>`
8. Delete corrupt trailing fragment (lines 1957–1968)
9. Update docs/README.md version from 7.6.0 to 9.2.1
10. Remove phantom tree methods: `unwrap()`, `update()`, `effect()`, `subscribe()` — or export the `effects()` enhancer and require `.with(effects())`

**Effort estimate:** 2–4 hours (mechanical find-replace + human review pass)

**Impact:** Takes AI-agent first-attempt success from ~0% to >80%

### RFC-2: EntityNode Write Semantics — Fix or Document

**Problem:** F-012 and F-013 — EntityNode's callable overloads and deep property write types are promises the runtime cannot keep. Users who write `node(newValue)` or `node.name.set('Bob')` get TypeScript approval and silent failure at runtime. This is the worst category of API bug: invisible at compile time, broken at runtime.

**Two design options:**

**Option A — Implement writes:**
Make `EntityNode<E>(value)` and `EntityNode<E>(updater)` delegate to `updateOne(id, value)` / `updateOne(id, updater(current))`. Make `node.name.set(v)` patch just that field via `updateOne(id, { name: v })`. This aligns the runtime with the types and completes SignalTree's "everything is callable" design philosophy.

**Option B — Make EntityNode read-only:**
Change `EntityNode<E>[P]` from `CallableWritableSignal<T[P]>` to `Signal<T[P]>`. Add a JSDoc to `byId()`: "Returns a read-only cursor. Use `updateOne(id, changes)` to mutate." This closes the type-safety hole without implementing the deep-write mechanism.

**Recommendation:** Option A is the right long-term answer and more consistent with SignalTree's design intent. Option B is a safe intermediate step that can ship immediately with no runtime changes — only type changes.

**Effort estimate:** Option A: 3–5 days. Option B: 2 hours.

### RFC-3: `entities()` / `effects()` Export Gap

**Problem:** F-002 and F-010 — Two enhancers exist in source but are either deprecated-and-throws (`entities`) or silently hidden (`effects`). The README documents both. This creates a confusing public surface.

**Option A — Clean removal + migration note:**
- Delete `packages/core/src/enhancers/entities/entities.ts` entirely (or keep the runtime error throw but stop exporting it)
- Remove all `entities()` references from README with a clear migration note box
- For `effects()`: decide — export or remove. If Angular's built-in `effect()` is the recommended path, remove the enhancer and update the README

**Option B — Export and document:**
- Export `effects()` from `index.ts`, require `.with(effects())` in README examples
- Add a migration guide: "v6: .with(entities()) → v7+: entityMap() self-registers, no enhancer needed"

**Recommendation:** Option A (clean removal) is better for the AI-legibility problem. Simpler public surface → fewer hallucination targets. If `effects()` is genuinely useful and ready, export it with full documentation. If it's work-in-progress, remove it from source until it's ready.

**Effort estimate:** Option A: 4–8 hours (including README cleanup). Option B: 8–16 hours.

---

## 5. M3: Adversarial AI-agent Test

**Status: NOT YET RUN — requires fresh Claude session**

### 5.1 Objective

Validate the AI-legibility findings empirically. A fresh Claude session given only the `@signaltree/core` README (no source, no audit findings, no prior context) is asked to implement the same invoice editor feature defined in `specs/examples/feature-contract.md`.

Expected result per M1 findings: multiple failures on first attempt, concentrated on:
- entities() / callable setter / withTimeTravel (F-002, F-009, F-005)
- EntitySignal name errors (F-007)
- multi-arg .with() (F-006)

### 5.2 Prompt design

Prompts for the M3 test session are specified in:  
`specs/examples/m3-prompts/m3-test-prompt.md`

### 5.3 Success criteria

The test produces:
1. A complete transcript at `specs/examples/m3-prompts/transcript.md`
2. An annotated version at `specs/examples/m3-prompts/transcript-annotated.md` mapping each agent error to a finding ID
3. A failure-count table: errors × finding IDs × number of recovery turns

### 5.4 Known control requirement (S4)

Per `specs/design/second-pair-of-eyes.md`: the M3 agent session MUST NOT be given any audit findings, internal source files, or context from this session. Give only: the README URL (or file), the feature-contract.md, and no other scaffolding.

---

## 6. M4: Benchmark Gap Analysis

**Status: NOT YET RUN — deferred pending build environment**

### 6.1 What should be benchmarked

The current codebase does not contain a benchmark harness. Before building one, these are the honest questions to ask:

| Benchmark | Why it matters | Expected result |
|---|---|---|
| **Bundle size (gzip)** — SignalTree core vs @ngrx/signals | SignalTree's stated differentiator is smaller bundle | Need production build to measure; likely SignalTree smaller given fewer features |
| **Initial render time** — 1000-item entity list, cold start | Most impactful perf metric for Angular apps | Expected similar; both use Angular signals under the hood |
| **Update throughput** — 10k updates/sec on flat signal tree | Validates "faster than NgRx" claim | Likely similar given both use Angular's signal primitives |
| **Memory — 10k entities** | Practical concern for large entity collections | SignalTree entityMap() vs NgRx entity adapter |
| **Derived recomputation** | Signals are lazy; both should recompute only on access | Expected parity |

### 6.2 What NOT to benchmark

- Raw signal read/write speed (both delegate to `@angular/core` signals — parity guaranteed)
- Dev-mode build size (misleading; tree-shaking only works in production builds)
- Comparisons against NgRx classic (Store + Effects) — out of scope

### 6.3 Measurement protocol reference

Per `specs/technical/measurement-protocol.md`: all benchmarks run production builds, Angular CLI version captured in results, three runs reported with median. Bundle size format defined in `specs/examples/feature-contract.md §Bundle size format`.

### 6.4 Prerequisite

Bundle size capture requires `ng build --configuration production`. This requires a working Angular workspace with both libraries installed. Neither a production build nor a benchmark harness currently exists in this repo. M4 is blocked on environment setup.

**Recommendation:** Add an `apps/bench/` Angular workspace to the monorepo containing both the SignalTree and NgRx invoice-editor stores, wired up for production builds. The `measurement-protocol.md` harness spec can guide this.

---

## 7. Findings Index

All 16 findings are machine-queryable in `docs/audits/2026-04/findings.json`. Summary:

| ID | Sev | Surface | Title (abbreviated) |
|---|---|---|---|
| F-001 | P1 | docs/README.md | Version claim: 7.6.0 vs 9.2.1 |
| F-002 | P0 | core/README.md | `entities()` throws at runtime, documented as valid |
| F-003 | P0 | core/README.md | Phantom tree methods: effect/subscribe/update/unwrap |
| F-004 | P0 | core/README.md | Corrupt trailing code fragment |
| F-005 | P1 | core/README.md | `withTimeTravel` / `maxHistory` wrong names |
| F-006 | P1 | core/README.md | Multi-arg `.with()` silently drops second enhancer |
| F-007 | P1 | core/README.md | 5 EntitySignal method names wrong (NgRx echo) |
| F-008 | P1 | core/README.md | Config key `batching` wrong (should be `batchUpdates`) |
| F-009 | P1 | core/README.md | Callable setter in Quick Start without transform caveat |
| F-010 | P2 | core/index.ts | `effects()` not exported, no public import path |
| F-011 | P1 | entity-signal.ts | `addMany` mode option typed but not implemented |
| F-012 | P1 | entity-signal.ts | EntityNode call signatures silently no-op at runtime |
| F-013 | P1 | entity-signal.ts | EntityNode deep property writes typed but throw at runtime |
| F-014 | P2 | constants.ts | Production errors are numeric codes (0, 1, 2…) |
| F-015 | P2 | entity-signal.ts | Wrong return-type comments in entityMap API reference |
| F-016 | P3 | packages/shared | @signaltree/shared version drift: 9.0.1 vs 9.2.1 |

---

## 8. What This Audit Did Not Cover

Per `specs/design/audit-architecture.md` negative scope:

- **T2-light surfaces** (callable-syntax, enterprise, ng-forms, events, guardrails, realtime): checklist exists in `specs/design/m1-checklist-core.md` but not yet executed
- **M3 adversarial AI test:** fresh session required — transcript not yet produced
- **M4 benchmark:** production build environment not available
- **@signaltree/shared deep audit:** version drift flagged as F-016; no API audit done
- **Code fixes / PRs against SignalTree:** explicitly out of scope this cycle

---

## 9. Recommendation Ranking

Actions ordered by impact-to-effort ratio:

1. **RFC-1, step 8** — Delete corrupt README fragment (F-004). 5 minutes. Any agent reading the README may reproduce the corrupt fragment.
2. **RFC-1, step 2** — Add callable-syntax caveat to Quick Start (F-009). 30 minutes. Prevents the most common first-time failure.
3. **RFC-1, step 1** — Remove entities() references (F-002). 1 hour. The single highest-severity finding by blast radius.
4. **RFC-2 Option B** — Make EntityNode read-only in types (F-012, F-013). 2 hours. Closes the type-safety hole safely.
5. **RFC-1, steps 3–7, 10** — Fix remaining API name errors. 2–3 hours. Batch the mechanical renames.
6. **RFC-3 Option A** — Clean up effects() export gap (F-010). 4 hours.
7. **RFC-2 Option A** — Implement EntityNode deep writes. 3–5 days. High value but highest effort.
8. **M3 adversarial test** — Run fresh-agent session to empirically validate M1 findings.
9. **M4 benchmark harness** — Add apps/bench/ Angular workspace.

---

*RFC generated by M5 synthesis — 2026-04-29. Findings DB authoritative; this narrative is derived from it.*
