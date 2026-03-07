# SignalTree Demo Refinement Plan

## Purpose

This document replaces the raw conversation log with a working plan for the SignalTree demo site and related presentation refinements.

It is intended to be:

- the single source of truth for the current demo overhaul
- a decision log for what has already been settled
- a phased implementation plan
- a checklist that can be updated as work progresses

---

## Executive Summary

SignalTree’s core/runtime work is in strong shape. The current weakness is not the library architecture itself, but how the demo site explains, presents, and routes users into that architecture.

The demo currently has three main problems:

1. **Positioning leads with mechanism instead of pain.**
   - The site says “Reactive JSON” before it proves why nested reactive state is painful and why SignalTree is the better model.

2. **The information architecture undersells what already exists.**
   - Many useful routes/pages exist but are not surfaced clearly from the home page or navigation.

3. **Trust is weakened by small inconsistencies.**
   - Some homepage examples drift from current APIs.
   - Build metadata is partially synthetic.
   - Deep-link behavior appears inconsistent from the live site audit.

The next phase should focus on **presentation clarity, route discoverability, trust signals, and homepage narrative**, not on adding more demo surface area.

---

## Core Decisions Already Made

These decisions are considered settled unless explicitly changed.

### Product / Architecture Positioning

- SignalTree’s best-practice architecture is still:
  - **one root runtime tree**
  - **feature/domain slices under that tree**
  - **typed slice access**
  - **root-level DevTools / persistence / time-travel**
- “Multiple trees in one Redux DevTools instance” is not the primary story.
- The ethos is still:
  - state is data
  - paths matter
  - minimal ceremony
  - minimal runtime noise

### Demo-Site Messaging

- The homepage should lead with **nested-state pain and the simpler mental model**, not with abstract feature language.
- “Reactive JSON” remains useful, but should be a supporting phrase, not the first thing a new visitor must decode.
- The homepage should include:
  - a before/after example
  - “who it’s for / not for”
  - clear routes into Learn, Examples, Docs, and Benchmarks

### Site IA

- The demo site should act like a product site plus interactive docs.
- The content structure should bias toward:
  - **Learn**
  - **Examples**
  - **Reference**
  - **Benchmarks**
- Existing routes should be surfaced more intentionally instead of hidden in the route table.

---

## Completed Work to Date

These items are already done and should not be re-opened unless regressions are found.

### Core / DevTools / Release Work

- DevTools phantom-action issue was investigated, fixed, tested, documented, and released.
- v8.0.2 was published.
- Release workflow and rollback handling were hardened.
- Aggregated Redux DevTools work was reviewed and production-hardened.
- Validation and tree-shaking checks were run successfully.

### Demo Code Fixes Already Shipped

- SignalTree version reporting in the demo was corrected to use generated version metadata.
- Entities demo search reactivity was fixed.
- DevTools demo naming inconsistency was fixed.
- Library version metadata generation was centralized.
- Tooling alignment and validation cleanup were completed.

These are background context, not the current focus.

---

## Current Objective

Overhaul the SignalTree demo site so that it:

- explains the value proposition faster
- surfaces the best routes and demos more clearly
- improves trust and polish
- reflects the architecture guidance already decided
- converts the current “feature catalog” feel into a clearer product narrative

---

## Audit Summary

### What is Already Strong

- The repo has a large amount of useful demo content already implemented.
- The route surface is broad and technically rich.
- The documentation page can render package README content in-app.
- The demo already contains meaningful comparison/benchmark material.
- The site has enough raw content to feel substantial once the presentation is fixed.

### Main Problems Found

#### 1. Positioning / Messaging

- Hero messaging is too library-mechanism-first.
- The value proposition is not anchored quickly enough in real application pain.
- Some copy feels too spec-sheet-driven or too self-promotional.
- The homepage does not establish a clear primary user journey.

#### 2. Information Architecture / Discoverability

- Route coverage is much larger than surfaced navigation coverage.
- The home page promotes only part of the actual product surface.
- Docs coverage is incomplete relative to published packages.
- Navigation does not expose enough of the most useful advanced and package-specific pages.

#### 3. Trust / Credibility

- The homepage quick-start example drifts from current imports/API usage.
- Build date in nav is generated at runtime instead of coming from real build metadata.
- Stale or unused app-shell code exists.
- Deep-link behavior looked inconsistent from live-site fetch checks.

#### 4. Product Narrative Gaps

- There is no strong “who this is for / who it isn’t for” section.
- There is no simple “why not actions/reducers/selectors for this use case?” explanation.
- There is not yet a memorable, opinionated “start here” experience for evaluating the library.

---

## Guiding Principles for the Rewrite

All demo-site changes should follow these rules:

1. **Lead with pain, then model, then proof.**
2. **Prefer clarity over completeness on the home page.**
3. **Use the homepage to route, not to duplicate the entire docs surface.**
4. **Keep benchmark claims precise and non-hypey.**
5. **Every code snippet shown on the homepage must be current and runnable.**
6. **Make it obvious where to learn, where to compare, and where to inspect reference material.**
7. **Do not add new technical surface area until the current surface is presented well.**
8. **Do not change benchmark functionality unless a concrete defect is identified.**

### Benchmark Safety Constraint

The benchmark layer should be treated as functionally stable unless a real bug is found.

That means:

- benchmark work should default to **copy, framing, labels, and disclosure**, not logic changes
- avoid changing scenario behavior, scoring, orchestration, or measurement flow casually
- avoid touching benchmark internals just to improve presentation
- if benchmark code must change, it should be because of a verified correctness issue, not a messaging concern
- benchmark pages can be clarified, but their behavior should not be reworked during the presentation pass

---

## Target Experience

The refined site should make a new visitor understand the following in under a minute:

1. **What problem SignalTree solves**
   - deeply nested reactive state without ceremony

2. **Why it feels different**
   - state looks like data
   - access stays path-based and type-safe
   - no reducer/action boilerplate

3. **How to evaluate it**
   - read the quick start
   - inspect a simple example
   - compare benchmarks carefully
   - open documentation/reference

4. **Whether it is a fit**
   - ideal for Angular apps with complex nested state
   - less compelling for tiny or flat-state apps

---

## Phase Plan

## Phase 0 — Structural Trust Fixes

Goal: eliminate presentation drift and routing credibility issues before copy/design polish.

### Scope

- Fix homepage quick-start snippet so imports and example code match current APIs.
- Remove or reconcile stale app shell content.
- Ensure docs page includes all key published packages.
- Improve nav coverage for existing valuable routes.
- Confirm deep-link deployment behavior is correct for Vercel.
- Replace fake build-date behavior with real build metadata if feasible.

### Primary Files

- `apps/demo/src/app/components/home/home.component.ts`
- `apps/demo/src/app/components/home/home.component.html`
- `apps/demo/src/app/components/navigation/navigation.component.ts`
- `apps/demo/src/app/components/navigation/navigation.component.html`
- `apps/demo/src/app/pages/documentation/documentation.component.ts`
- `apps/demo/src/app/app.ts`
- `apps/demo/src/app/app.html`
- `apps/demo/src/index.html`
- `vercel.json`

### Success Criteria

- No stale or misleading homepage code.
- No obvious route-discoverability blind spots in primary navigation.
- Docs expose `events` and `realtime` alongside the existing package docs.
- Live deep links resolve correctly.
- Version/build metadata shown to users is honest.

---

## Phase 1 — Homepage Repositioning

Goal: rewrite the homepage so it communicates the product faster and more convincingly.

### Scope

- Rewrite hero copy around nested-state pain.
- Add a tight “before vs after” example.
- Add strong primary CTAs.
- Add “who it’s for / not for”.
- Reframe feature cards so they support the narrative instead of feeling like an exhaustive list.
- Reduce combative or over-claimed language.

### Homepage Narrative Order

Recommended order:

1. Hero: problem + promise
2. Primary CTA row
3. Before/after example
4. Why SignalTree feels simpler
5. Who it’s for / not for
6. Key routes into demos/docs/benchmarks
7. Supporting advanced features

### Success Criteria

- New visitor can explain SignalTree in plain English after one screen.
- The page has a clear evaluation flow.
- The page feels product-led, not feature-dump-led.

---

## Phase 2 — Navigation and IA Cleanup

Goal: make the site easier to traverse and make hidden value visible.

### Scope

- Reorganize nav labels/categories.
- Surface advanced-but-important routes currently buried.
- Separate “Learn” from “Reference”.
- Make benchmark routes easier to find without making them the primary message.

### High-Value Routes to Surface Better

- `/events`
- `/realtime`
- `/guardrails`
- `/presets`
- `/persistence`
- `/serialization`
- `/undo-redo`
- `/markers`
- `/bundle-visualizer`
- `/examples/fundamentals/recommended-architecture`
- `/examples/fundamentals/migration-recipe`

### Success Criteria

- Important routes are reachable from nav or homepage without hunting.
- Learn/reference split is obvious.
- Route structure feels intentional.

---

## Phase 3 — Documentation Presentation Cleanup

Goal: improve docs discoverability and package clarity without rewriting the whole documentation set.

### Scope

- Expand in-app docs package coverage.
- Improve package selection labels/order.
- Clarify package roles.
- Add version/package context where useful.
- De-emphasize raw README dumping where better framing would help.

### Success Criteria

- Users can quickly find the package they care about.
- The docs page better answers: what package is this, when do I use it, and where do I go next?

---

## Phase 4 — Proof and Trust Layer

Goal: strengthen credibility without adding hype.

### Scope

- Make benchmark framing more careful and honest without changing benchmark behavior.
- Tighten trust signals around version/build/package provenance.
- Add route-level metadata/SEO if worthwhile.
- Ensure examples reflect current architecture guidance.

### Explicit Non-Goal

- Do not refactor benchmark logic during this presentation effort unless a specific functional bug is identified and isolated.

### Success Criteria

- Fewer “is this current?” moments.
- Fewer “is this benchmark marketing?” reactions.
- Better consistency between product claims and code reality.

### Current Benchmark Presentation Guidance

During this pass, benchmark changes are limited to:

- headings
- explanatory copy
- framing text
- labels that improve methodological clarity

Benchmark changes are not allowed to alter:

- scoring
- orchestration
- scenario logic
- weighting behavior
- measurement flow

---

## Recommended Implementation Order

This is the concrete order to execute in.

1. Fix homepage quick-start snippet.
2. Fix primary nav coverage.
3. Expand docs page package coverage.
4. Clean stale shell/app wrapper pieces.
5. Validate Vercel/deep-link behavior.
6. Rewrite hero + CTA + before/after section.
7. Add who-it’s-for / not-for block.
8. Reframe feature sections around evaluation flow.
9. Refine docs labels and IA.
10. Final polish pass on tone, metadata, and route discoverability.

---

## Detailed Backlog

## P0 — Must Do

- [x] Fix homepage quick-start imports and sample code.
- [x] Add primary CTA structure to homepage.
- [x] Rewrite hero copy around pain-first positioning.
- [x] Add a simple before/after code example.
- [x] Add “who it’s for / not for” section.
- [x] Surface more routes in primary navigation.
- [x] Add `events` docs coverage.
- [x] Add `realtime` docs coverage.
- [x] Remove or reconcile stale `app.html` shell content.
- [x] Verify/fix deep-link handling for deployed routes.
- [x] Replace synthetic build-date display with real metadata or remove it.

## P1 — Strongly Recommended

- [x] Reorganize homepage feature cards around user journeys.
- [x] Reduce tone that reads as over-selling.
- [x] Add a “recommended architecture” route/link from more prominent entry points.
- [x] Improve navigation grouping labels.
- [x] Expose reference vs learn more clearly on docs/navigation surfaces.
- [x] Improve package descriptions on the docs page.
- [x] Surface `guardrails`, `presets`, `persistence`, and `serialization` more clearly.
- [x] Surface `undo-redo`, `markers`, and `bundle-visualizer` more clearly.

## P2 — Nice to Have After Core Rewrite Lands

- [ ] Add route-level metadata/SEO cleanup.
- [ ] Add a more opinionated “start here” guided path.
- [ ] Add a stronger real-world showcase/demo flow.
- [x] Further tighten benchmark framing/copy.
- [ ] Review remaining route naming consistency.

---

## File-by-File Working Notes

### Home

**Files**

- `apps/demo/src/app/components/home/home.component.ts`
- `apps/demo/src/app/components/home/home.component.html`
- `apps/demo/src/app/components/home/home.component.scss`

**Planned changes**

- Rework feature data model if needed to support stronger grouping.
- Update quick-start code.
- Add hero/CTA/before-after content.
- Reduce redundant or weak feature sections.
- Preserve useful route cards, but demote exhaustive catalog behavior.

### Navigation

**Files**

- `apps/demo/src/app/components/navigation/navigation.component.ts`
- `apps/demo/src/app/components/navigation/navigation.component.html`
- `apps/demo/src/app/components/navigation/navigation.component.scss`

**Planned changes**

- Increase route coverage.
- Improve group naming.
- Replace synthetic build-date behavior.
- Keep version display accurate and confidence-building.

### Docs Page

**Files**

- `apps/demo/src/app/pages/documentation/documentation.component.ts`
- `apps/demo/src/app/pages/documentation/documentation.component.html`

**Planned changes**

- Add missing packages.
- Improve package selection UX.
- Clarify package roles.

### App Shell / Routing / Deployment

**Files**

- `apps/demo/src/app/app.ts`
- `apps/demo/src/app/app.html`
- `apps/demo/src/app/app.routes.ts`
- `apps/demo/src/index.html`
- `vercel.json`

**Planned changes**

- Remove stale wrapper content.
- Confirm shell consistency.
- Ensure deep-link compatibility.
- Avoid conflicting deployment assumptions.

---

## Validation Plan

After each meaningful phase:

### Functional Checks

- Home route loads correctly.
- Key primary routes are reachable from nav/home.
- Docs page renders expected package docs.
- Deep links work directly in browser.

### Quality Checks

- `pnpm nx test demo`
- `pnpm nx build demo`
- Manual smoke test of homepage, docs, benchmarks, and package pages

### Presentation Checks

- Homepage code snippet is API-accurate.
- Version/build info is truthful.
- Messaging is consistent with architecture guidance.
- No broken CTA paths.

---

## Risks / Things to Watch

- Do not let homepage positioning become anti-framework rhetoric.
- Do not let benchmarks dominate the product story.
- Do not destabilize the benchmark layer while refining presentation.
- Do not over-expose every route from the homepage; route people intentionally.
- Do not promise “best” without context.
- Do not introduce visual changes that make the site feel less credible or more toy-like.

---

## Recommendation Inventory

This section exists specifically so the earlier conversation does not get lost.

If the implementation drifts, return here first.

### External Review Synthesis

The following strategic recommendations were explicitly folded into this plan:

- Lead with the pain of nested reactive state, not with “Reactive JSON” as an unexplained category label.
- Narrow the category claim and avoid trying to sound like the answer to every state-management problem.
- Reduce “spec sheet” energy on the homepage.
- Add a simple before/after example early.
- Add a clear “who it’s for / who it’s not for” block.
- Build a memorable evaluation path instead of presenting a broad wall of features.
- Add fair comparison guidance rather than pure benchmark marketing.
- Simplify docs IA into a clearer Learn vs Reference mental model.
- Tone down superlatives and unsupported claims.
- Make version/package clarity stronger.

### Full Demo Improvement Inventory

The following recommendations were raised during the audit and should remain documented even if not all are implemented immediately:

1. Add a clear explanation of the difference between app-wide production architecture and example-local demo trees.
2. Either wire `user.tree.ts` into a real route or remove it to avoid dead-example drift.
3. Add an explicit DevTools connection-model explanation on the DevTools demo/docs surfaces.
4. Standardize DevTools naming across demos.
5. Separate benchmark harness state from benchmarked library state where possible.
6. Keep global error suppression dev-only and narrowly scoped.
7. Keep third-party library versions generated and centralized so benchmark metadata cannot drift.
8. Treat benchmark environment heuristics as advisory, not hard truth.
9. Document warmup/iteration strategy in benchmark framing.
10. Prefer `OnPush` in demo components where it does not harm clarity.
11. Avoid logging in benchmark hot paths unless the log is the point of the demo.
12. Consolidate snapshot/clone helpers instead of ad hoc JSON cloning.
13. Move remaining “plain field used in computed” style state into reactive sources where the demo intends to teach reactivity.
14. Add linting or checks to catch non-reactive plain fields used inside `computed()`.
15. Extract repeated benchmark setup into helpers to reduce drift.
16. Add a benchmark-page warning that synthetic benchmark patterns are not production guidance.
17. Add visibility/throttling guards for long-running benchmarks.
18. Add cancellation support for long-running benchmark runs.
19. Ensure benchmark results always include exact versions and environment metadata.
20. Add an exports / tree-shaking sanity-check demo or page.
21. Consolidate version display so all surfaces derive from the same generated metadata.
22. Add smoke tests for core demo routes.
23. Reduce default test-console noise where possible.
24. Add a “known limitations / disclaimers” page or section covering benchmark noise, multi-tree demo caveats, and recommended architecture.

### Explicitly Deferred / Not Current Priority

These ideas were discussed and should remain documented, but are not current P0 priorities:

- Benchmark-page warning banner about synthetic workloads.
- Deep benchmark-orchestrator hardening beyond current metadata and correctness work.
- Full route-level SEO pass.
- Larger real-world showcase/demo scenario.
- Additional smoke/e2e coverage beyond current core validation.

### Recommendation Mapping to Current Phases

- **Phase 0** covers trust, routing, docs coverage, metadata honesty, and stale-shell cleanup.
- **Phase 1** covers pain-first messaging, before/after, CTAs, and fit guidance.
- **Phase 2** covers route surfacing and Learn/Reference clarity.
- **Phase 3** covers docs package clarity and docs presentation.
- **Phase 4** covers benchmark framing and broader trust polish.

---

## Current Status Board

### Status

- [x] Demo/site audit completed
- [x] Strategic review synthesized
- [x] Historical context captured
- [x] Planning doc rewritten into execution plan
- [x] Recommendation inventory captured in plan
- [x] Phase 0 implementation started
- [x] Phase 1 homepage rewrite started
- [x] Phase 2 IA/navigation cleanup started
- [x] Phase 3 docs presentation cleanup started
- [x] Phase 4 benchmark/trust framing cleanup started
- [x] Phase 0 validation completed
- [x] Final validation completed

### Immediate Next Actions

1. Review the updated demo visually and smoke-test the main flows.
2. Re-run full build/test validation once the shell environment is stable again.
3. Decide whether any remaining route naming or SEO cleanup is worth doing before commit.
4. Prepare the demo refinement changes for commit.

---

## Working Log Template

Use this section to track progress as implementation proceeds.

### Update Format

```md
## Update YYYY-MM-DD

- Completed:
  - ...
- In progress:
  - ...
- Next:
  - ...
- Validation:
  - ...
```

### Update 2026-03-06

- Completed:
  - Consolidated the raw conversation into a structured execution plan.
  - Captured settled architecture and messaging decisions.
  - Converted audit findings into phased work.
  - Added the full recommendation inventory so prior audit guidance is preserved in the plan.
  - Reworked the homepage around pain-first positioning, CTAs, before/after comparison, package entry points, and fit guidance.
  - Expanded primary navigation to surface more high-value routes.
  - Added `events` and `realtime` package docs coverage to the demo docs page and build assets.
  - Replaced stale app-shell placeholder content with an explicit note.
  - Removed the synthetic build-date display.
  - Added Vercel SPA fallback routes and removed legacy GitHub Pages SPA script.
  - Added deep links into specific documentation packages from homepage and navigation.
  - Added docs-page quick links so Learn and Reference are connected more clearly.
  - Softened remaining homepage proof-point wording so measurements read as current examples rather than absolute claims.
  - Refined benchmark-page framing text to reduce marketing tone while keeping all benchmark behavior unchanged.
  - Added a collapsible mobile navigation drawer so the site navigation works cleanly on smaller screens.
- In progress:
  - None.
- Next:
  - Review the updated demo visually.
  - Decide whether route naming or SEO cleanup is worth a follow-up pass.
  - Prepare the demo refinement changes for commit.
- Validation:
  - `pnpm nx build demo --configuration=production --output-style=static` passed.
  - `pnpm nx test demo --output-style=static -- --runInBand` passed.
  - Follow-up editor diagnostics after the docs-link pass were clean.
  - Follow-up editor diagnostics after the benchmark presentation pass were clean.
  - Final re-run on 2026-03-06 with an explicit NVM Node path passed for both build and test.

---

## Bottom Line

SignalTree does **not** need more demo surface area right now.

It needs a sharper front door.

The priority is to make the existing depth easier to understand, easier to trust, and easier to navigate.
