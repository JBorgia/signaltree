# Severity Definitions — Worked Examples (Phase 3 fix)

Resolves the Linguistics-lens 🟡 finding on M1 (severity definitions ambiguous between reviewers). Each tier has 2–3 worked examples drawn from plausible audit findings.

## P0 — broken claim or correctness bug

Definition: a documented capability that does not work as documented, OR a runtime/typing bug that produces incorrect behavior. Must fix before next release.

Examples:

- **P0** — README claims "deep type inference works to N levels of nesting" but the audit's invoice + line items + line item options test (N=4 levels) loses inference at level 3. Concrete reproduction: `specs/examples/signaltree/invoice-editor/typing-failure.ts:42`.
- **P0** — Bundle-size benchmark in `apps/benchmarks/` reports 8KB, but reproducing on a clean checkout with the locked measurement-protocol.md config yields 14KB. Documented number is unreproducible.
- **P0** — `tree.users.set(...)` mutation crashes in production builds when `users` is undefined, despite the type system claiming `users: User[]`. The crash exists; the type system covers for it.

## P1 — adoption-blocker for AI agents OR NgRx evaluators

Definition: a gap that causes a fresh Cursor/Claude/Copilot session OR an experienced NgRx user evaluating SignalTree to abandon the library or reach for NgRx instead. Fix in next minor.

Examples:

- **P1** — When the M3 fresh-Claude session is asked to "add validation to the invoice form," it fails 3/3 attempts because there is no SignalTree pattern for cross-field validation in the docs and the agent reaches for NgRx Forms. Adoption-blocker for the AI-legibility audit question.
- **P1** — There is no "migrating from NgRx" guide. An evaluator with an NgRx codebase has no path. NgRx SignalStore ships an upgrade guide for classic NgRx users; SignalTree's silence here loses adopters mechanically.
- **P1** — `@signaltree/ng-forms` README has no working "load a form from API → edit → save back" example. Every reviewer who tries this stalls.

## P2 — DX papercut or doc gap

Definition: friction in the golden path that an experienced user works around but a new user trips on. Affects DX score but not adoption directly. Fix when convenient.

Examples:

- **P2** — Calling `tree.users()` (callable syntax) for read works, but calling `tree.users.length()` does not — `length` is on the underlying array, not on the signal. The error message is `length is not a function`. New users hit this in minute 5.
- **P2** — JSDoc on `signalTree<T>(initial: T)` says "see types.ts" without a link. Hyperlink in JSDoc would surface the recursive-type contract.
- **P2** — The `@signaltree/guardrails` package detects an anti-pattern but logs to `console.warn` only. Easy to miss in development.

## P3 — nice-to-have / future polish

Definition: a finding that's real but won't affect adoption or correctness. Track for a follow-up cycle, do not block current release.

Examples:

- **P3** — README's installation section lists `npm install` first; could lead with `pnpm` since the repo uses pnpm. Minor.
- **P3** — Some tests in `packages/core/src/lib/__tests__/` use `it()` while others use `test()`. Inconsistency, low harm.
- **P3** — `@signaltree/realtime` only documents Supabase + Firebase + WebSocket; adding a Convex example would broaden appeal.

## Severity arbitration

If a finding could be P0 or P1, default to P1 unless reproduction shows clear correctness failure. If P1 or P2, default to P2 unless an AI-agent transcript or NgRx-evaluator review shows the issue caused abandonment.

The audit MUST NOT inflate severities for emphasis. Inflation undermines credibility — a maintainer reading "37 P0s" treats every P0 as a P1, which means real P0s drown.

If two severity tags seem defensible for the same finding, file the finding once at the lower tier and add a note: `severity_note: "could be promoted to <higher tier> if X is true"`. Maintainer arbitrates.
