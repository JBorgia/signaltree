# SignalTree vs raw Angular signals

> Honest, axis-by-axis comparison written for both humans and AI coding agents. Raw Angular signals are the **framework itself** — zero dependency, zero learning tax, guaranteed future-proof. SignalTree must *earn* its dependency against that bar. This page says plainly where it does and where it doesn't.

This is the comparison most "should I use SignalTree?" decisions actually hinge on — more than the NgRx one. If you only have a couple of values, **stop here and use raw signals.**

---

## TL;DR

| Use... | When... |
|---|---|
| **Raw Angular signals** (`signal` / `computed` / `linkedSignal` / `effect` / `resource`) | Your state is a handful of values or one flat object; you don't need entity CRUD, forms, persistence, or undo; you want zero dependencies and zero abstraction risk. **This is the right default for most components and many apps.** |
| **SignalTree** | Your state is **deeply structured** (nested domains, dashboards, multi-step forms), AND you want batteries — entity CRUD, async status, localStorage, forms, validation — attached **at specific nodes at any depth**, with full recursive typing and far less hand-wiring than assembling the above from primitives. |
| **Either** | Medium apps with some structure but modest battery needs — taste and team familiarity decide. |

The honest one-liner: **raw signals win for simple/flat state; SignalTree earns its place only when state is structured *and* needs batteries at depth.** If you're not in that niche, the dependency isn't justified — and that's fine.

---

## What raw Angular signals already give you (the bar to beat)

As of Angular 20 the native primitives cover a lot:

- `signal<T>()` — a writable reactive value.
- `computed<T>()` — derived, memoized.
- `effect()` — react to changes.
- `linkedSignal<T>()` — a *writable* computed that resets when its source changes (stable since v19).
- `resource()` / `rxResource()` — async data loading with `value`/`status`/`error`/`reload` (developer-preview / stabilizing through the 19–20 line; check your version).

For one value, a derived view, or a single async fetch, these are complete, zero-dependency, and will never be deprecated out from under you. **SignalTree adds nothing here — it would be pure overhead.**

What native signals do **not** provide (and won't — they're primitives, not a state library):

- **Deep nested state with reactivity at every path.** With raw signals you either keep one `signal(bigObject)` and replace it immutably on every change (losing fine-grained reactivity), or hand-create a signal per field and wire the nesting yourself.
- **Entity collections** — no `addOne`/`updateMany`/`byId`/`where`. You write the normalized-map boilerplate.
- **Form state** — no field/dirty/valid/submit tracking.
- **Persistence** — no localStorage/sync.
- **Undo/redo, DevTools, batching** — none.

## Axis-by-axis

| Axis | Raw signals | SignalTree |
|---|---|---|
| Single value / derived / writable-derived | ✅ `signal`/`computed`/`linkedSignal` | ✅ leaves + `.derived()` (heavier for this) |
| One async fetch | ✅ `resource`/`rxResource` | ✅ `asyncSource`/`asyncQuery` (comparable) |
| **Deep nested state, signal at every path** | ⚠️ manual (signal-per-field or immutable replace) | ✅ automatic via the tree + partial deep-merge writes |
| **Entity CRUD** | ❌ hand-rolled | ✅ `entityMap` |
| **Forms / persistence / undo / DevTools** | ❌ none | ✅ markers + enhancers, **at any depth** |
| Recursive deep typing of the whole state | ⚠️ you type each signal | ✅ inferred across the tree |
| Dependency / bundle | ✅ zero (framework) | ⚠️ ~8.5 KB gz core (tree-shaken) |
| Future-proofing | ✅ it *is* the framework | ⚠️ a dependency to maintain |
| AI-codegen familiarity | ✅ agents know native signals cold | ⚠️ niche; relies on llms.txt priming |

## Where raw signals win (use them, not SignalTree)

- Flat or shallow state; a few values; component-local state.
- A single async resource — `resource()` is purpose-built.
- You want zero dependencies / zero abstraction risk / maximum longevity.
- You're prototyping or the app is small. Reaching for SignalTree here is over-engineering.

## Where SignalTree wins (its defensible niche)

The win is **not** "reactivity" (native has that) — it's **eliminating the boilerplate of structured state + batteries**:

- State is **deeply structured** and you want a signal at every path with partial deep-merge writes, instead of hand-wiring signal-per-field or replacing a big object immutably.
- You need **entity collections, async status, forms, persistence, undo** — and you want them **co-located at the node they belong to, at any depth** (`$.workspace.editor.draft`), not assembled by hand or flattened to the root.
- You want the whole nested shape **recursively typed** from one literal.

Outside that niche, raw signals are the better engineering choice — and SignalTree's own docs should say so (they now do, here).

## Don't use SignalTree if…

- Your state fits in one or two `signal()`s. (Use them.)
- You need exactly one async fetch. (Use `resource`.)
- You can't justify an ~8.5 KB dependency for the batteries you'd actually use.
- You value zero-dependency longevity over the boilerplate savings.

---

*See also: [SignalTree vs NgRx SignalStore](./ngrx-signalstore.md) for the other axis of the decision.*
