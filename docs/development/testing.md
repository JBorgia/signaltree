# Testing the SignalTree packages (contributor guide)

> If you hit `Cannot read properties of null (reading 'ngModule')` when running
> tests, read the **"How to run the tests"** section — you almost certainly ran
> vitest from the wrong directory.

## How to run the tests

Run `@signaltree/core` tests through **Nx** (CI path) or vitest **with the
package's own config**:

```bash
# Preferred — uses the project's vitest config + Angular TestBed setup
npx nx test core

# Equivalent, when you want to scope to specific files:
cd packages/core && npx vitest run --config vitest.config.ts src/lib/markers
```

**Do NOT run `npx vitest run packages/core/...` from the repo root.** Vitest
resolves its config from the current working directory; there is no root vitest
config, so a root-level run silently skips `packages/core/vitest.config.ts` —
which means `setupFiles` never loads, the Angular `TestBed` environment is never
initialized, and every spec that uses `TestBed` / `inject()` fails with
`Cannot read properties of null (reading 'ngModule')`. The error looks like a
code bug; it is actually a wrong-cwd bug.

## Why `src/test-setup.ts` exists

`packages/core/src/test-setup.ts` initializes the Angular testing environment
(`getTestBed().initTestEnvironment(...)` + `zone.js/testing`). It is wired in
via `setupFiles: ['src/test-setup.ts']` in `vitest.config.ts`, and is listed in
`tsconfig.lib.json`'s `exclude` so its `zone.js` imports never reach the
published bundle.

Specs that need it: any using `TestBed.runInInjectionContext` / `inject()` —
currently the `asyncSource` and `asyncQuery` marker specs (their markers call
`inject(DestroyRef)` for auto-cleanup).

**There must be exactly ONE test-setup file** (`src/test-setup.ts`). Do not add
per-directory `test-setup.ts` files: they are referenced by no runner (dead
code) and, because `tsconfig.lib.json` includes `src/**/*.ts`, their
`zone.js/testing` side-effect imports get compiled into the production library.
Five such orphans (left over from the jest→vitest migration) were removed in
June 2026 for exactly this reason.

## History / context

- The core suite runs under `@nx/vitest` — there is no Jest config for `core`
  (the Jest workflow `test-packages.yml` covers only guardrails/realtime/schema).
- The `asyncSource`/`asyncQuery` specs never executed from the day they were
  added (`bc60988b`) until the `setupFiles` wiring landed, because the
  `ngModule null` failure blocked the whole file. Wiring the setup surfaced two
  real `asyncQuery` bugs (error-kills-pipeline and rerun-deduped) — both now
  fixed and covered by passing specs. If those specs ever start failing again,
  they are testing real marker behavior, not the harness.
