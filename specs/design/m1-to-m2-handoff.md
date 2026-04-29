# M1 → M2 Handoff

**Generated:** 2026-04-29
**From:** M1 Static Review (complete — all checklist items resolved)
**To:** M2 Scaffold-and-Build (nested entity editor: invoice + line items)

---

## Summary of M1 findings relevant to M2

M1 produced 16 findings. The findings most material to the M2 scaffold-and-build are:

### Critical inputs to M2 scaffold design

| Finding | Impact on M2 |
|---|---|
| **F-002** — `entities()` throws at runtime | M2 must NOT use `.with(entities())`. Entity collections use `entityMap()` + no enhancer. The NgRx side uses `withEntities()` — this asymmetry must be documented in the DX-notes |
| **F-009** — Callable setter requires build transform | M2 scaffolds must use `.set()/.update()` syntax consistently, NOT callable syntax `signal(value)`, so the comparison is valid without the transform as a variable |
| **F-011** — `addMany` mode option unimplemented | If the invoice editor uses `addMany()`, use `upsertMany()` instead for add-or-replace semantics. Flag in DX-notes if `addMany` behavior (throws on dup) causes friction |
| **F-012/F-013** — EntityNode set/update silently ignored | Deep entity property writes via `byId(id)?.name.set(...)` WILL FAIL silently/throw at runtime. M2 must mutate via `updateOne(id, changes)` only. This is a significant DX gap vs NgRx `patchState` |

### Feature contract constraints

The **invoice + line items** feature must stress:
- Recursive type inference (nested `LineItem[]` inside `Invoice`)
- Deep updates (`invoice.total` recomputed when `lineItem.price` changes)
- Optional fields (`lineItem.discount?: number`)
- Array operations (add, update, remove line items)
- O(1) entity lookups by ID

Given F-012/F-013, the scaffold CANNOT use deep EntityNode property writes. The
DX comparison must show the SignalTree mutation path explicitly vs NgRx's
`patchState(store, { lineItems: updatedItems })`.

### API names confirmed for M2

Use these exact API names (not README aliases):

| Operation | SignalTree (correct) | Wrong (README ghost) |
|---|---|---|
| Set all entities | `.setAll(entities)` | ~~`.setMany()`~~ |
| Filter query | `.where(pred)` | ~~`.selectBy(pred)`~~ |
| Count signal | `.count` (getter) | ~~`.selectTotal()`~~ |
| IDs signal | `.ids` (getter) | ~~`.selectIds()`~~ |
| All signal | `.all` (getter) | ~~`.selectAll()`~~ |
| Add entity | `.addOne(e)` (throws on dup) | — |
| Add-or-update | `.upsertOne(e)` | — |
| Mutate by id | `.updateOne(id, changes)` | ~~`byId(id)(changes)`~~ — silent no-op |

### NgRx side (second-pair-of-eyes required)

Per `specs/design/second-pair-of-eyes.md`: the NgRx SignalStore implementation
of the invoice editor MUST be reviewed by a fresh Claude session given only
NgRx docs. Do not rely on this session's NgRx knowledge.

**Specific watch items for NgRx side:**
- Confirm `withEntities` is in `@ngrx/signals/entities` at current version
- Confirm `patchState` deep update semantics for nested entity changes
- Confirm line item array mutation patterns

---

## Carry-forward summary (M1 complete)

**What M1 checked:**
Full static review of `@signaltree/core` package:
`README.md`, `src/index.ts`, `src/lib/types.ts`, `src/lib/signal-tree.ts`,
`src/lib/entity-signal.ts`, `src/lib/constants.ts`,
`src/enhancers/{entities,effects,batching,time-travel,serialization,devtools}/`,
`src/lib/markers/{entity-map,status,stored,form}.ts`,
`src/lib/internals/derived-types.ts`,
plus `docs/README.md` (index) and all 20+ linked docs (all exist ✓).

**Findings count:** 16 total (3×P0, 8×P1, 3×P2, 2×P3)

**What M1 did NOT cover (deferred to other workstreams):**
- T2 light review surfaces: callable-syntax, enterprise, ng-forms, events, guardrails, realtime
- Benchmark claims (M4)
- Adversarial AI-agent test (M3)
- Competitive gap analysis vs NgRx SignalStore (M2+M4)
- RFC synthesis (M5)

**Top 3 candidates for RFC redesign proposals** (provisional, M5 confirms):
1. **README accuracy overhaul** — 16 findings, 11 P0/P1, directly blocks AI-agent adoption
2. **EntityNode write semantics** — type/impl mismatch (F-012, F-013) is a subtle correctness trap
3. **`entities()` / `effects()` export gap** — two enhancers in source with no public path (F-002, F-010)
