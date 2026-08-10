# Bundle Optimization and Analysis

How SignalTree's bundle cost is measured, and what it currently is.

## Current status

Measured with `node tools/size-report.mjs` and budgeted by
`node tools/check-bundle-budget.mjs`. Own code only, gzipped, production means
`ngDevMode: false`.

| scenario                   | prod (ships) | dev (diagnostics) | budget           |
| -------------------------- | ------------ | ----------------- | ---------------- |
| bare `signalTree`          | 5.79 KB      | 7.80 KB           | 5.9 KB / 8.1 KB  |
| `signalTree` + `entityMap` | 9.40 KB      | 12.07 KB          | 9.5 KB / 12.1 KB |
| `signalTree` + `form()`    | 7.90 KB      | 10.17 KB          | 8 KB / 10.5 KB   |

Prod and dev are budgeted separately because the dev diagnostics fold away
under `ngDevMode: false`. The `devmode-foldable` gate proves they actually do,
rather than assuming it.

**Do not pitch SignalTree on bundle size.** Measured against the field it sits
near the top of the range — NgRx SignalStore is roughly 1.9 KB and Elf roughly
2.1 KB. The trade is capability per KB, not KB.

## Canonical tools

- `node tools/size-report.mjs` — per-marker and per-enhancer deltas over a bare
  tree. This is the generator every published size figure should cite.
- `node tools/check-bundle-budget.mjs` — the gate. Fails when a scenario exceeds
  its prod or dev ceiling.

### Not `scripts/consolidated-bundle-analysis.js`

That script still exists and `npm run size:report` still points at it, but it
should not be used to source a published number, and this document previously
did exactly that.

Its output disagrees with the maintained generators in ways that are not
roundable: it reports a "96.5% reduction versus old separate packages" and a
"full publishable output across 2 packages" when there are seven. It also
writes its results to `artifacts/consolidated-bundle-results.json`, which is
gitignored local scratch — the exact route by which stale figures have reached
published docs before (see AGENTS.md).

The figures this section used to carry came from it: a "core package alone" of
**25.63KB gzipped** against a real bare tree of 5.79 KB, a 36.31KB ecosystem
total, and a `core + enterprise + shared + types + utils` breakdown naming a
package removed in 14.0.0. Those are the same v9-era numbers that
`tools/check-numeric-claims.mjs` was written to catch — its own header cites
"Core publishable (gzipped) 25.64KB" as ungeneratable and deleted. They survived
here because that gate is ratcheted, so pre-existing figures are grandfathered
rather than failed.

## Workflow

1. Rebuild the packages (`npx nx run-many -t build`)
2. `node tools/size-report.mjs` for the breakdown
3. `node tools/check-bundle-budget.mjs` to check it against the ceilings
4. If a budget moved deliberately, update it in the same commit and say why

## Optimization techniques

- Keep dev-only code behind inline `ngDevMode` guards at the call site, so it
  folds — see [dropping-dev-code.md](./dropping-dev-code.md)
- Remove redundant exports and wrappers
- Consolidate type handlers and utilities
- Prefer patterns that tree-shake: no side effects at module scope

## References

- [scripts/README.md](../../scripts/README.md) — analysis and performance scripts
- [dropping-dev-code.md](./dropping-dev-code.md) — how the dev/prod split works
- [tools/GATES.md](../../tools/GATES.md) — what the size gates do and do not check
